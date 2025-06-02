// Hệ thống xác thực sử dụng Firebase v9+ SDK với bảo mật nâng cao
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.11.1/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.11.1/firebase-analytics.js";
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
  arrayUnion,
  arrayRemove,
} from "https://www.gstatic.com/firebasejs/10.11.1/firebase-firestore.js";

// Nhập cấu hình bảo mật
import { configManager, rateLimiter } from "./config.js";

// Instance ứng dụng Firebase
let app = null;
let analytics = null;
let db = null;

// Theo dõi bảo mật tối ưu
class SecurityMonitor {
  constructor() {
    this.suspiciousActivity = [];
    this.failedAttempts = new Map();
    this.maxFailedAttempts = 5;
    this.blockDuration = 300000; // 5 phút
    this.initialized = false;
  }

  // Khởi tạo lười
  init() {
    if (this.initialized) return;
    this.initialized = true;

    // Dọn dẹp dữ liệu cũ định kỳ (nền)
    setInterval(() => {
      this.cleanup();
    }, 60000); // Mỗi phút
  }

  logActivity(type, details = {}) {
    // Khởi tạo lười khi sử dụng lần đầu
    if (!this.initialized) this.init();

    const activity = {
      type,
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent.slice(0, 100), // Cắt ngắn để tối ưu hiệu suất
      details,
    };

    this.suspiciousActivity.push(activity);

    // Chỉ giữ 50 hoạt động gần nhất (giảm từ 100)
    if (this.suspiciousActivity.length > 50) {
      this.suspiciousActivity = this.suspiciousActivity.slice(-50);
    }
  }

  recordFailedAttempt(identifier) {
    if (!this.failedAttempts.has(identifier)) {
      this.failedAttempts.set(identifier, []);
    }

    const attempts = this.failedAttempts.get(identifier);
    attempts.push(Date.now());

    // Giới hạn số lần thử được lưu trữ
    if (attempts.length > this.maxFailedAttempts * 2) {
      attempts.splice(0, attempts.length - this.maxFailedAttempts);
    }
  }

  isBlocked(identifier) {
    if (!this.failedAttempts.has(identifier)) {
      return false;
    }

    const attempts = this.failedAttempts.get(identifier);
    const cutoff = Date.now() - this.blockDuration;
    const recentAttempts = attempts.filter((time) => time > cutoff);

    return recentAttempts.length >= this.maxFailedAttempts;
  }

  clearFailedAttempts(identifier) {
    this.failedAttempts.delete(identifier);
  }

  // Dọn dẹp nền
  cleanup() {
    const cutoff = Date.now() - this.blockDuration;

    for (const [identifier, attempts] of this.failedAttempts.entries()) {
      const validAttempts = attempts.filter((time) => time > cutoff);

      if (validAttempts.length === 0) {
        this.failedAttempts.delete(identifier);
      } else {
        this.failedAttempts.set(identifier, validAttempts);
      }
    }
  }
}

class AuthSystem {
  constructor() {
    this.currentUser = null;
    this.db = null;
    this.securityMonitor = new SecurityMonitor();
    this.initialized = false;
    this.cache = new Map();
    this.monitoringSetup = false;

    // Khởi tạo không đồng bộ nhanh
    this.initPromise = this.init();
  }

  async init() {
    try {
      // Khởi tạo song song để tăng tốc
      const [securityCheck, firebaseConfig] = await Promise.all([
        configManager.performSecurityChecks(),
        configManager.getConfig(),
      ]);

      // Khởi tạo Firebase với cấu hình bảo mật
      app = initializeApp(firebaseConfig);
      this.db = getFirestore(app);

      // Tải Analytics lười (không chặn)
      setTimeout(() => {
        analytics = getAnalytics(app);
      }, 0);

      this.initialized = true;

      // Kiểm tra session storage cho người dùng hiện tại (song song)
      const savedUser = sessionStorage.getItem("currentUser");
      if (savedUser) {
        try {
          this.currentUser = JSON.parse(savedUser);
          console.log("Tìm thấy user đã lưu:", {
            email: this.currentUser.email,
            role: this.currentUser.role,
            currentPage: window.location.pathname,
          });

          // Xác minh người dùng không đồng bộ (không chặn UI)
          // Thêm delay để tránh loop redirect
          setTimeout(async () => {
            try {
              const exists = await this.verifyUserExists(
                this.currentUser.email
              );
              console.log("Kết quả xác minh user:", {
                email: this.currentUser.email,
                exists: exists,
              });

              if (!exists) {
                console.log("Xác minh user thất bại - đăng xuất");
                this.logout();
              } else {
                console.log("Xác minh user thành công - kiểm tra trang");

                // Chỉ redirect nếu đang ở trang sai
                const currentPage = window.location.pathname.split("/").pop();
                const expectedPage =
                  this.currentUser.role === "admin"
                    ? "admin.html"
                    : "user.html";

                if (
                  currentPage !== expectedPage &&
                  currentPage !== "index.html"
                ) {
                  console.log("Redirect đến panel phù hợp:", {
                    currentPage: currentPage,
                    expectedPage: expectedPage,
                  });
                  this.redirectToAppropriatePanel();
                }
              }
            } catch (error) {
              console.error("Lỗi trong quá trình xác minh user:", error);
              // Không logout nếu có lỗi network, chỉ log
            }
          }, 1000); // Delay 1 giây để tránh redirect ngay lập tức
        } catch (e) {
          console.log("Dữ liệu session không hợp lệ, đang xóa:", e);
          // Dữ liệu session không hợp lệ
          sessionStorage.removeItem("currentUser");
        }
      }

      // Thiết lập theo dõi bảo mật lười
      setTimeout(() => {
        this.setupSecurityMonitoring();
      }, 1000);
    } catch (error) {
      console.error("Không thể khởi tạo hệ thống xác thực:", error);
      this.handleInitializationError(error);
    }
  }

  setupSecurityMonitoring() {
    if (this.monitoringSetup) return;
    this.monitoringSetup = true;

    // Theo dõi hoạt động tối ưu
    let lastActivity = Date.now();
    let idleCheckInterval = null;

    // Bộ theo dõi hoạt động có giới hạn
    const throttledActivityUpdate = this.throttle(() => {
      lastActivity = Date.now();
    }, 1000); // Cập nhật tối đa mỗi giây một lần

    // Trình nghe sự kiện hiệu quả
    const events = ["click", "keypress", "scroll"];
    events.forEach((eventType) => {
      document.addEventListener(eventType, throttledActivityUpdate, {
        passive: true,
        capture: false,
      });
    });

    // Kiểm tra idle tối ưu (mỗi 2 phút thay vì 1)
    idleCheckInterval = setInterval(() => {
      const idleTime = Date.now() - lastActivity;
      if (idleTime > 1800000 && this.isLoggedIn()) {
        // 30 phút không hoạt động
        this.securityMonitor.logActivity("idle_timeout");
        this.logout();
        clearInterval(idleCheckInterval);
      }
    }, 120000); // Kiểm tra mỗi 2 phút

    // Theo dõi khả năng hiển thị trang đơn giản
    document.addEventListener(
      "visibilitychange",
      () => {
        if (document.hidden) {
          lastActivity = Date.now() - 300000; // Đánh dấu là idle 5 phút khi ẩn
        } else {
          lastActivity = Date.now();
        }
      },
      { passive: true }
    );
  }

  // Hàm helper throttle để tối ưu hiệu suất
  throttle(func, limit) {
    let inThrottle;
    return function () {
      const args = arguments;
      const context = this;
      if (!inThrottle) {
        func.apply(context, args);
        inThrottle = true;
        setTimeout(() => (inThrottle = false), limit);
      }
    };
  }

  handleInitializationError(error) {
    // UI báo lỗi nhẹ
    document.body.innerHTML = `
      <div style="display:flex;justify-content:center;align-items:center;height:100vh;font-family:Arial,sans-serif;background:#fff8e1;">
        <div style="text-align:center;padding:40px;background:white;border-radius:20px;box-shadow:0 15px 35px rgba(0,0,0,0.1);max-width:400px;">
          <h2 style="color:#f44336;margin-bottom:20px;">🔒 Lỗi Bảo Mật</h2>
          <p style="color:#666;margin-bottom:30px;">Ứng dụng không thể khởi tạo do lỗi bảo mật.</p>
          <button onclick="location.reload()" style="background:#ff6b35;color:white;border:none;padding:12px 24px;border-radius:8px;cursor:pointer;font-weight:600;">Thử lại</button>
        </div>
      </div>`;
  }

  async verifyUserExists(email) {
    try {
      console.log("verifyUserExists được gọi với email:", email);

      // Kiểm tra cache trước
      const cacheKey = `user_exists_${email}`;
      const cached = this.cache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < 60000) {
        console.log("verifyUserExists - sử dụng cache:", cached.data);
        return cached.data;
      }

      // Đợi khởi tạo nếu cần
      if (!this.initialized) {
        await this.initPromise;
      }

      // Chuẩn hóa email
      const normalizedEmail = email.trim().toLowerCase();

      // Thực hiện tìm kiếm thực sự qua tất cả users vì document ID là username, không phải email
      const allUsersSnapshot = await getDocs(collection(this.db, "users"));
      let userExists = false;
      let foundUserData = null;

      allUsersSnapshot.forEach((doc) => {
        const userData = doc.data();
        const userEmail = userData.email?.toLowerCase() || "";

        // Kiểm tra email khớp và user còn active và không bị khóa
        if (userEmail === normalizedEmail && userData.isActive) {
          // Kiểm tra status - nếu có field status và bằng false thì coi như không tồn tại
          if (userData.hasOwnProperty("status") && userData.status === false) {
            console.log("User tồn tại nhưng bị khóa:", {
              email: normalizedEmail,
              userId: doc.id,
              status: userData.status,
            });
            userExists = false; // User bị khóa
          } else {
            console.log("User tồn tại và active:", {
              email: normalizedEmail,
              userId: doc.id,
              status: userData.status || "không có field status",
            });
            userExists = true;
            foundUserData = userData;
          }
        }
      });

      console.log("Kết quả verifyUserExists:", {
        email: normalizedEmail,
        exists: userExists,
        foundUser: foundUserData
          ? {
              email: foundUserData.email,
              username: foundUserData.username,
              status: foundUserData.status,
            }
          : null,
      });

      // Lưu cache kết quả
      this.cache.set(cacheKey, {
        data: userExists,
        timestamp: Date.now(),
      });

      return userExists;
    } catch (error) {
      console.error("Lỗi khi xác minh người dùng:", error);
      return false;
    }
  }

  // Hàm kiểm tra user có tồn tại và trả về thông tin user (cho forgot password)
  async checkUserExists(emailOrUsername) {
    try {
      // Đợi khởi tạo nếu cần
      if (!this.initialized) {
        await this.initPromise;
      }

      // Chuẩn hóa đầu vào
      const normalizedInput = emailOrUsername.trim().toLowerCase();

      // Đầu tiên thử tìm username trực tiếp
      let userDoc = await getDoc(doc(this.db, "users", normalizedInput));

      if (userDoc.exists()) {
        const userData = userDoc.data();
        if (userData.isActive) {
          return {
            id: normalizedInput,
            email: userData.email,
            username: userData.username,
            name: userData.name,
          };
        }
      }

      // Nếu không tìm thấy, tìm kiếm bằng email
      const allUsersSnapshot = await getDocs(collection(this.db, "users"));
      let foundUser = null;

      allUsersSnapshot.forEach((doc) => {
        const data = doc.data();
        const userEmail = data.email?.toLowerCase() || "";
        const userName = data.username?.toLowerCase() || "";

        // Kiểm tra xem đầu vào có khớp với email hoặc username
        if (userEmail === normalizedInput || userName === normalizedInput) {
          foundUser = { id: doc.id, ...data };
        }
      });

      return foundUser;
    } catch (error) {
      console.error("Lỗi khi kiểm tra user tồn tại:", error);
      return false;
    }
  }

  // Hàm reset mật khẩu user (cho forgot password)
  async resetUserPassword(userId, newPassword) {
    try {
      // Đợi khởi tạo nếu cần
      if (!this.initialized) {
        await this.initPromise;
      }

      // Validate password
      if (!newPassword || newPassword.length < 6) {
        return {
          success: false,
          message: "Mật khẩu phải có ít nhất 6 ký tự",
        };
      }

      // Cập nhật mật khẩu trong Firestore
      await updateDoc(doc(this.db, "users", userId), {
        password: newPassword,
        passwordUpdatedAt: serverTimestamp(),
        passwordUpdatedBy: "password_reset",
      });

      // Log hoạt động bảo mật
      this.securityMonitor.logActivity("password_reset", {
        userId: userId,
        timestamp: new Date().toISOString(),
      });

      return {
        success: true,
        message: "Mật khẩu đã được cập nhật thành công",
      };
    } catch (error) {
      console.error("Lỗi khi reset mật khẩu:", error);
      return {
        success: false,
        message: "Có lỗi xảy ra khi cập nhật mật khẩu. Vui lòng thử lại!",
      };
    }
  }

  async waitForInitialization() {
    if (this.initialized) return;
    return this.initPromise;
  }

  async login(emailOrUsername, password) {
    try {
      // Kiểm tra khởi tạo nhanh
      await this.waitForInitialization();

      // Kiểm tra giới hạn tốc độ
      const clientId = this.getClientIdentifier();
      if (!rateLimiter.isAllowed(`login_${clientId}`)) {
        this.securityMonitor.logActivity("rate_limit_exceeded", { clientId });
        return {
          success: false,
          message: "Quá nhiều lần đăng nhập. Vui lòng thử lại sau.",
          field: "email",
        };
      }

      // Kiểm tra nếu client bị chặn do nhiều lần thất bại
      if (this.securityMonitor.isBlocked(clientId)) {
        this.securityMonitor.logActivity("blocked_attempt", { clientId });
        return {
          success: false,
          message:
            "Tài khoản tạm thời bị khóa do nhiều lần đăng nhập sai. Vui lòng thử lại sau 5 phút.",
          field: "email",
        };
      }

      // Chuẩn hóa đầu vào
      const normalizedInput = emailOrUsername.trim().toLowerCase();

      // Chiến lược tìm kiếm nhanh - thử username trước, sau đó quét nếu cần
      let userDoc = null;
      let finalUserId = null;
      let foundUserData = null;

      // Đầu tiên thử tìm username trực tiếp (nhanh nhất)
      userDoc = await getDoc(doc(this.db, "users", normalizedInput));

      if (userDoc.exists()) {
        foundUserData = userDoc.data();
        finalUserId = normalizedInput;
        console.log(
          "Tìm thấy người dùng bằng tìm kiếm username trực tiếp:",
          normalizedInput
        );
      } else {
        console.log(
          "Tìm kiếm username trực tiếp thất bại, kiểm tra xem đầu vào có phải email..."
        );

        // Nếu tìm kiếm trực tiếp thất bại, có thể là email - quét trường email
        // Chậm hơn nhưng chỉ chạy khi ai đó đăng nhập bằng email thay vì username
        const allUsersSnapshot = await getDocs(collection(this.db, "users"));
        let foundUser = null;

        allUsersSnapshot.forEach((doc) => {
          const data = doc.data();
          const userEmail = data.email?.toLowerCase() || "";
          const userName = data.username?.toLowerCase() || "";

          // Kiểm tra xem đầu vào có khớp với email hoặc username
          if (userEmail === normalizedInput || userName === normalizedInput) {
            foundUser = { id: doc.id, ...data };
            finalUserId = doc.id; // Document ID là username
            foundUserData = data;
          }
        });

        if (!foundUser) {
          this.securityMonitor.recordFailedAttempt(clientId);
          this.securityMonitor.logActivity("login_failed", {
            reason: "user_not_found",
            input: normalizedInput,
            clientId,
          });
          return {
            success: false,
            message: "Tài khoản không tồn tại",
            field: "email",
          };
        }

        console.log(
          "Tìm thấy người dùng bằng tìm kiếm email:",
          foundUserData.username
        );
      }

      if (!foundUserData.isActive) {
        this.securityMonitor.recordFailedAttempt(clientId);
        this.securityMonitor.logActivity("login_failed", {
          reason: "account_inactive",
          email: foundUserData.email,
          clientId,
        });
        return {
          success: false,
          message: "Tài khoản đã bị vô hiệu hóa",
          field: "email",
        };
      }

      // Kiểm tra trạng thái khóa của user - chỉ khi status field tồn tại
      if (
        foundUserData.hasOwnProperty("status") &&
        foundUserData.status === false
      ) {
        this.securityMonitor.recordFailedAttempt(clientId);
        this.securityMonitor.logActivity("login_failed", {
          reason: "account_locked",
          email: foundUserData.email,
          userId: finalUserId,
          status: foundUserData.status,
          clientId,
        });
        console.log("Đăng nhập user bị chặn - tài khoản bị khóa:", {
          userId: finalUserId,
          email: foundUserData.email,
          status: foundUserData.status,
        });
        return {
          success: false,
          message:
            "Tài khoản bị khóa, vui lòng liên hệ quản trị viên để biết thêm chi tiết",
          field: "email",
          isLocked: true,
        };
      }

      // Log status check để debug
      console.log("Kiểm tra trạng thái user:", {
        userId: finalUserId,
        email: foundUserData.email,
        hasStatusField: foundUserData.hasOwnProperty("status"),
        status: foundUserData.status,
        isActive: foundUserData.isActive,
      });

      if (foundUserData.password !== password) {
        this.securityMonitor.recordFailedAttempt(clientId);
        this.securityMonitor.logActivity("login_failed", {
          reason: "wrong_password",
          email: foundUserData.email,
          clientId,
        });
        return {
          success: false,
          message: "Mật khẩu không đúng",
          field: "password",
        };
      }

      // Xóa các lần thất bại khi đăng nhập thành công
      this.securityMonitor.clearFailedAttempts(clientId);
      this.securityMonitor.logActivity("login_success", {
        email: foundUserData.email,
        clientId,
      });

      // Tạo phiên người dùng
      const user = {
        email: foundUserData.email,
        username: foundUserData.username || foundUserData.email,
        role: foundUserData.role,
        name: foundUserData.name,
        assignedFields: foundUserData.assignedFields || [],
        loginTime: new Date().toISOString(),
      };

      this.currentUser = user;
      // Sử dụng sessionStorage thay vì localStorage để bảo mật tốt hơn
      sessionStorage.setItem("currentUser", JSON.stringify(user));

      // Cập nhật thời gian đăng nhập cuối trong Firestore
      await updateDoc(doc(this.db, "users", finalUserId), {
        lastLoginAt: serverTimestamp(),
      });

      console.log("Đăng nhập thành công cho:", foundUserData.email);
      return { success: true, user: user };
    } catch (error) {
      console.error("Lỗi đăng nhập:", error);
      this.securityMonitor.logActivity("login_error", {
        error: error.message,
        clientId: this.getClientIdentifier(),
      });
      return {
        success: false,
        message: "Có lỗi xảy ra khi đăng nhập. Vui lòng thử lại!",
        field: "email",
      };
    }
  }

  getClientIdentifier() {
    // Tạo định danh client bán-vĩnh viễn
    let clientId = sessionStorage.getItem("clientId");
    if (!clientId) {
      clientId = this.generateClientId();
      sessionStorage.setItem("clientId", clientId);
    }
    return clientId;
  }

  generateClientId() {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substr(2, 9);
    const screenSize = window.screen
      ? `${window.screen.width}x${window.screen.height}`
      : "unknown";
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;

    return btoa(`${timestamp}_${random}_${screenSize}_${tz}`).substr(0, 16);
  }

  async logout() {
    if (this.currentUser) {
      this.securityMonitor.logActivity("logout", {
        email: this.currentUser.email,
        clientId: this.getClientIdentifier(),
      });
    }

    this.currentUser = null;
    sessionStorage.removeItem("currentUser");
    sessionStorage.removeItem("clientId");

    // Xóa tất cả dữ liệu localStorage bao gồm remember login và auto-save data
    try {
      const keysToRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (
          key &&
          (key.startsWith("app_") ||
            key.startsWith("auth_") ||
            key.startsWith("user_") ||
            key === "remember_login")
        ) {
          keysToRemove.push(key);
        }
      }

      keysToRemove.forEach((key) => {
        localStorage.removeItem(key);
      });

      console.log("Đã xóa localStorage khi đăng xuất:", keysToRemove);
    } catch (error) {
      console.warn("Không thể xóa localStorage khi đăng xuất:", error);
    }

    window.location.href = "index.html";
  }

  isLoggedIn() {
    return this.currentUser !== null;
  }

  isAdmin() {
    return this.currentUser && this.currentUser.role === "admin";
  }

  getCurrentUser() {
    return this.currentUser;
  }

  redirectToAppropriatePanel() {
    if (!this.currentUser) {
      window.location.href = "index.html";
      return;
    }

    const currentPage = window.location.pathname.split("/").pop();

    if (this.currentUser.role === "admin") {
      if (currentPage !== "admin.html") {
        window.location.href = "admin.html";
      }
    } else {
      if (currentPage !== "user.html") {
        window.location.href = "user.html";
      }
    }
  }

  requireAuth() {
    if (!this.isLoggedIn()) {
      window.location.href = "index.html";
      return false;
    }
    return true;
  }

  requireAdmin() {
    if (!this.isLoggedIn() || !this.isAdmin()) {
      window.location.href = "index.html";
      return false;
    }
    return true;
  }

  // Các hàm quản lý người dùng cho admin - SỬA LỖI INDEX
  async getUsers() {
    try {
      await this.waitForInitialization();

      // Xóa cache để đảm bảo lấy dữ liệu mới nhất
      this.cache.clear();

      // Loại bỏ orderBy để tránh yêu cầu index
      const q = query(
        collection(this.db, "users"),
        where("role", "==", "user")
      );

      const querySnapshot = await getDocs(q);
      const users = [];

      querySnapshot.forEach((doc) => {
        const data = doc.data();

        // Đảm bảo status field luôn có giá trị - mặc định là true (không bị khóa)
        if (!data.hasOwnProperty("status")) {
          data.status = true;
        }

        users.push({
          id: doc.id,
          ...data,
          createdAt:
            data.createdAt?.toDate?.()?.toISOString() ||
            new Date().toISOString(),
        });
      });

      // Sắp xếp trong JavaScript thay vì Firestore
      users.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

      console.log(
        "getUsers trả về:",
        users.map((u) => ({
          id: u.id,
          email: u.email,
          status: u.status,
          hasStatusField: u.hasOwnProperty("status"),
        }))
      );

      return users;
    } catch (error) {
      console.error("Lỗi khi lấy danh sách người dùng:", error);
      // Dự phòng: lấy tất cả người dùng và lọc
      try {
        const allUsersSnapshot = await getDocs(collection(this.db, "users"));
        const users = [];
        allUsersSnapshot.forEach((doc) => {
          const data = doc.data();
          if (data.role === "user") {
            // Đảm bảo status field luôn có giá trị
            if (!data.hasOwnProperty("status")) {
              data.status = true;
            }

            users.push({
              id: doc.id,
              ...data,
              createdAt:
                data.createdAt?.toDate?.()?.toISOString() ||
                new Date().toISOString(),
            });
          }
        });
        users.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        return users;
      } catch (fallbackError) {
        console.error("Lỗi dự phòng:", fallbackError);
        return [];
      }
    }
  }

  async createUser(userData) {
    try {
      await this.waitForInitialization();

      // Kiểm tra giới hạn tốc độ nhanh
      const clientId = this.getClientIdentifier();
      if (!rateLimiter.isAllowed(`admin_${clientId}`)) {
        return {
          success: false,
          message: "Quá nhiều thao tác. Vui lòng thử lại sau.",
        };
      }

      // Xử lý đầu vào nhanh
      const email =
        userData.email?.trim().toLowerCase() ||
        Math.floor(Math.random() * 10000000000) + 1 + "t";
      const username = userData.username?.trim().toLowerCase();
      const password = userData.password?.trim() || "123456";
      const name = userData.name?.trim();

      // Xác thực nhanh
      if (!username) {
        return { success: false, message: "Vui lòng nhập tên đăng nhập!" };
      }

      if (username.length < 3) {
        return {
          success: false,
          message: "Tên đăng nhập phải có ít nhất 3 ký tự!",
        };
      }

      // Sử dụng username làm document ID để tìm kiếm nhanh
      const userId = username;

      // Kiểm tra nhanh đơn lẻ - thử lấy người dùng theo username (document ID)
      const existingUser = await getDoc(doc(this.db, "users", userId));
      if (existingUser.exists()) {
        return { success: false, message: "Tên người dùng đã tồn tại!" };
      }

      // Kiểm tra email trùng lặp - quét qua tất cả users
      if (email && typeof email === "string") {
        const allUsersSnapshot = await getDocs(collection(this.db, "users"));
        let emailExists = false;

        allUsersSnapshot.forEach((doc) => {
          const userData = doc.data();
          if (
            userData.email &&
            userData.email.toLowerCase() === email &&
            userData.isActive
          ) {
            emailExists = true;
          }
        });

        if (emailExists) {
          return {
            success: false,
            message: "Email đã tồn tại!",
          };
        }
      }

      // Tạo đối tượng người dùng nhanh
      const newUser = {
        email: email,
        username: username,
        password: password,
        name: name,
        role: "user",
        assignedFields: userData.assignedFields || [],
        createdAt: serverTimestamp(),
        createdBy: this.currentUser.email,
        isActive: true,
        status: true, // true = không bị khóa, false = bị khóa
      };

      // Thao tác ghi đơn lẻ nhanh
      await setDoc(doc(this.db, "users", userId), newUser);

      console.log("User được tạo thành công với status true:", {
        userId: userId,
        email: email,
        status: newUser.status,
        isActive: newUser.isActive,
      });

      return {
        success: true,
        user: {
          id: userId,
          ...newUser,
          createdAt: new Date().toISOString(),
        },
      };
    } catch (error) {
      console.error("Lỗi tạo user:", error);
      return { success: false, message: "Có lỗi xảy ra khi tạo người dùng!" };
    }
  }

  async updateUser(userId, userData) {
    try {
      await this.waitForInitialization();

      // Kiểm tra email trùng lặp nếu email được cập nhật
      if (userData.email) {
        const normalizedEmail = userData.email.trim().toLowerCase();

        // Quét qua tất cả users để kiểm tra email trùng lặp
        const allUsersSnapshot = await getDocs(collection(this.db, "users"));
        let emailExists = false;

        allUsersSnapshot.forEach((doc) => {
          const existingUserData = doc.data();
          // Kiểm tra email trùng lặp với user khác (không phải chính user đang được update)
          if (
            doc.id !== userId &&
            existingUserData.email &&
            existingUserData.email.toLowerCase() === normalizedEmail &&
            existingUserData.isActive
          ) {
            emailExists = true;
          }
        });

        if (emailExists) {
          return {
            success: false,
            message: "Email đã được sử dụng bởi người dùng khác!",
          };
        }

        // Chuẩn hóa email trong userData
        userData.email = normalizedEmail;
      }

      await updateDoc(doc(this.db, "users", userId), {
        ...userData,
        updatedAt: serverTimestamp(),
        updatedBy: this.currentUser.email,
      });

      const updatedDoc = await getDoc(doc(this.db, "users", userId));
      const updatedData = updatedDoc.data();

      return {
        success: true,
        user: {
          id: userId,
          ...updatedData,
        },
      };
    } catch (error) {
      console.error("Lỗi cập nhật user:", error);
      return {
        success: false,
        message: "Có lỗi xảy ra khi cập nhật người dùng!",
      };
    }
  }

  async deleteUser(userId) {
    try {
      await this.waitForInitialization();

      console.log("deleteUser được gọi với userId:", userId);

      // Lấy thông tin user hiện tại để kiểm tra status
      const userDoc = await getDoc(doc(this.db, "users", userId));
      if (!userDoc.exists()) {
        console.log("Không tìm thấy user:", userId);
        return { success: false, message: "Không tìm thấy người dùng!" };
      }

      const userData = userDoc.data();
      console.log("Dữ liệu user hiện tại:", {
        userId: userId,
        hasStatus: userData.hasOwnProperty("status"),
        currentStatus: userData.status,
        email: userData.email,
      });

      // Nếu user chưa có field status, coi như đang mở (true) và cần set lại
      let currentStatus = true; // Mặc định là không bị khóa
      if (userData.hasOwnProperty("status")) {
        currentStatus = userData.status;
      } else {
        console.log("User không có field status, đặt mặc định true");
        // Cập nhật user với status mặc định trước
        await updateDoc(doc(this.db, "users", userId), {
          status: true,
          updatedAt: serverTimestamp(),
          updatedBy: this.currentUser.email,
          statusAddedBy: "system_default",
        });
        currentStatus = true;
      }

      const newStatus = !currentStatus; // Toggle status

      console.log("Thay đổi status:", {
        currentStatus: currentStatus,
        newStatus: newStatus,
        action: newStatus ? "mở khóa" : "khóa",
      });

      // Cập nhật status thay vì xóa
      const updateData = {
        status: newStatus,
        updatedAt: serverTimestamp(),
        updatedBy: this.currentUser.email,
        lockReason: newStatus ? null : "Khóa bởi quản trị viên",
        lockedAt: newStatus ? null : serverTimestamp(),
      };

      console.log("Cập nhật user với dữ liệu:", updateData);

      await updateDoc(doc(this.db, "users", userId), updateData);

      console.log("Cập nhật user hoàn thành thành công");

      // Log hoạt động bảo mật
      this.securityMonitor.logActivity("user_status_changed", {
        targetUserId: userId,
        targetUserEmail: userData.email,
        newStatus: newStatus,
        changedBy: this.currentUser.email,
        action: newStatus ? "mở khóa" : "khóa",
      });

      const action = newStatus ? "mở khóa" : "khóa";
      const result = {
        success: true,
        message: `Đã ${action} người dùng ${
          userData.email || userData.username
        } thành công!`,
        newStatus: newStatus,
        userEmail: userData.email || userData.username,
        action: action,
      };

      console.log("Kết quả deleteUser:", result);
      return result;
    } catch (error) {
      console.error("Lỗi khi thay đổi trạng thái người dùng:", error);
      return {
        success: false,
        message: "Có lỗi xảy ra khi thay đổi trạng thái người dùng!",
        error: error.message,
      };
    }
  }

  // Function riêng để toggle user status với thông báo chi tiết
  async toggleUserStatus(userId) {
    return await this.deleteUser(userId); // Sử dụng lại logic deleteUser
  }

  // Quản lý trường - SỬA LỖI INDEX VÀ THÊM KIỂM SOÁT TRUY CẬP TRƯỜNG
  async getFields() {
    try {
      await this.waitForInitialization();

      // Loại bỏ orderBy để tránh yêu cầu index
      const q = query(
        collection(this.db, "fields"),
        where("isActive", "==", true)
      );

      const querySnapshot = await getDocs(q);
      const allFields = [];

      querySnapshot.forEach((doc) => {
        const data = doc.data();
        allFields.push({
          id: doc.id,
          ...data,
          createdAt:
            data.createdAt?.toDate?.()?.toISOString() ||
            new Date().toISOString(),
          data: data.data || [],
        });
      });

      // Sắp xếp trong JavaScript thay vì Firestore
      allFields.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

      // Nếu người dùng là admin, trả về tất cả trường
      if (this.isAdmin()) {
        return allFields;
      }

      // Nếu người dùng là người dùng thường, chỉ trả về trường được gán
      if (this.currentUser && this.currentUser.assignedFields) {
        const assignedFields = allFields.filter((field) =>
          this.currentUser.assignedFields.includes(field.id)
        );
        return assignedFields;
      }

      // Nếu không có trường được gán, trả về mảng rỗng
      return [];
    } catch (error) {
      console.error("Lỗi khi lấy danh sách trường:", error);
      // Dự phòng: lấy tất cả trường và lọc
      try {
        const allFieldsSnapshot = await getDocs(collection(this.db, "fields"));
        const allFields = [];
        allFieldsSnapshot.forEach((doc) => {
          const data = doc.data();
          if (data.isActive === true) {
            allFields.push({
              id: doc.id,
              ...data,
              createdAt:
                data.createdAt?.toDate?.()?.toISOString() ||
                new Date().toISOString(),
              data: data.data || [],
            });
          }
        });
        allFields.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        // Áp dụng kiểm soát truy cập trường
        if (this.isAdmin()) {
          return allFields;
        }

        if (this.currentUser && this.currentUser.assignedFields) {
          const assignedFields = allFields.filter((field) =>
            this.currentUser.assignedFields.includes(field.id)
          );
          return assignedFields;
        }

        return [];
      } catch (fallbackError) {
        console.error("Lỗi dự phòng:", fallbackError);
        return [];
      }
    }
  }

  // Lấy tất cả fields cho admin (bỏ qua kiểm soát truy cập)
  async getAllFieldsForAdmin() {
    try {
      await this.waitForInitialization();

      const q = query(
        collection(this.db, "fields"),
        where("isActive", "==", true)
      );
      const querySnapshot = await getDocs(q);
      const fields = [];

      querySnapshot.forEach((doc) => {
        const data = doc.data();
        fields.push({
          id: doc.id,
          ...data,
          createdAt:
            data.createdAt?.toDate?.()?.toISOString() ||
            new Date().toISOString(),
          data: data.data || [],
        });
      });

      fields.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      return fields;
    } catch (error) {
      console.error("Lỗi lấy tất cả fields cho admin:", error);
      return [];
    }
  }

  async createField(fieldData) {
    try {
      await this.waitForInitialization();

      // Kiểm tra đơn giản mà không cần query phức tạp
      const allFieldsSnapshot = await getDocs(collection(this.db, "fields"));
      let fieldExists = false;

      allFieldsSnapshot.forEach((doc) => {
        const data = doc.data();
        if (data.name === fieldData.name && data.isActive === true) {
          fieldExists = true;
        }
      });

      if (fieldExists) {
        return { success: false, message: "Trường đã tồn tại!" };
      }

      const newField = {
        name: fieldData.name,
        description: fieldData.description || "",
        data: [],
        createdAt: serverTimestamp(),
        createdBy: this.currentUser.email,
        isActive: true,
      };

      const docRef = doc(collection(this.db, "fields"));
      await setDoc(docRef, newField);

      return {
        success: true,
        field: {
          id: docRef.id,
          ...newField,
          createdAt: new Date().toISOString(),
        },
      };
    } catch (error) {
      console.error("Lỗi tạo field:", error);
      return { success: false, message: "Có lỗi xảy ra khi tạo trường!" };
    }
  }

  async updateField(fieldId, updateData) {
    try {
      await this.waitForInitialization();

      const fieldRef = doc(this.db, "fields", fieldId);

      // Thêm timestamp
      const dataToUpdate = {
        ...updateData,
        updatedAt: new Date().toISOString(),
        updatedBy: this.currentUser.email,
      };

      await updateDoc(fieldRef, dataToUpdate);

      return { success: true };
    } catch (error) {
      console.error("Lỗi cập nhật trường:", error);
      return {
        success: false,
        message: "Có lỗi xảy ra khi cập nhật trường!",
      };
    }
  }

  async deleteField(fieldId) {
    try {
      await this.waitForInitialization();

      // Thay vì xóa, chúng ta sẽ vô hiệu hóa trường
      await updateDoc(doc(this.db, "fields", fieldId), {
        isActive: false,
        deletedAt: serverTimestamp(),
        deletedBy: this.currentUser.email,
      });

      return { success: true };
    } catch (error) {
      console.error("Lỗi khi xóa trường:", error);
      return { success: false, message: "Có lỗi xảy ra khi xóa trường!" };
    }
  }

  // Quản lý dữ liệu với kiểm soát truy cập trường
  async addDataToField(fieldId, data) {
    try {
      await this.waitForInitialization();

      // Giới hạn tốc độ cho thao tác dữ liệu
      const clientId = this.getClientIdentifier();
      if (!rateLimiter.isAllowed(`data_${clientId}`)) {
        return {
          success: false,
          message: "Quá nhiều thao tác. Vui lòng thử lại sau.",
        };
      }

      // Kiểm tra xem người dùng có quyền truy cập trường này không
      if (!this.isAdmin()) {
        if (
          !this.currentUser.assignedFields ||
          !this.currentUser.assignedFields.includes(fieldId)
        ) {
          return {
            success: false,
            message: "Bạn không có quyền truy cập trường này!",
          };
        }
      }

      const fieldDoc = await getDoc(doc(this.db, "fields", fieldId));
      if (!fieldDoc.exists()) {
        return { success: false, message: "Không tìm thấy trường!" };
      }

      const fieldData = fieldDoc.data();
      const existingData = fieldData.data || [];

      // Kiểm tra trùng lặp
      if (
        existingData.some(
          (item) => item.value.toLowerCase() === data.trim().toLowerCase()
        )
      ) {
        return { success: false, message: "Dữ liệu đã tồn tại!" };
      }

      const newDataItem = {
        id: this.generateDataId(),
        value: data.trim(),
        addedAt: new Date().toISOString(),
        addedBy: this.currentUser.email,
      };

      await updateDoc(doc(this.db, "fields", fieldId), {
        data: arrayUnion(newDataItem),
      });

      return {
        success: true,
        data: newDataItem,
      };
    } catch (error) {
      console.error("Lỗi khi thêm dữ liệu:", error);
      return { success: false, message: "Có lỗi xảy ra khi thêm dữ liệu!" };
    }
  }

  async removeDataFromField(fieldId, dataId) {
    try {
      await this.waitForInitialization();

      const fieldDoc = await getDoc(doc(this.db, "fields", fieldId));
      if (!fieldDoc.exists()) {
        return { success: false, message: "Không tìm thấy trường!" };
      }

      const fieldData = fieldDoc.data();
      const dataToRemove = (fieldData.data || []).find(
        (item) => item.id === dataId
      );

      if (!dataToRemove) {
        return { success: false, message: "Không tìm thấy dữ liệu!" };
      }

      await updateDoc(doc(this.db, "fields", fieldId), {
        data: arrayRemove(dataToRemove),
      });

      return { success: true };
    } catch (error) {
      console.error("Lỗi khi xóa dữ liệu:", error);
      return { success: false, message: "Có lỗi xảy ra khi xóa dữ liệu!" };
    }
  }

  // Các hàm tiện ích
  generateDataId() {
    return "data_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9);
  }

  delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // Các hàm xuất dữ liệu
  async exportData(format = "excel") {
    try {
      const fields = await this.getFields();

      if (format === "excel") {
        return this.exportToExcel(fields);
      }

      return { success: false, message: "Định dạng không được hỗ trợ!" };
    } catch (error) {
      console.error("Lỗi khi xuất dữ liệu:", error);
      return { success: false, message: "Có lỗi xảy ra khi xuất dữ liệu!" };
    }
  }

  async exportToExcel(fields) {
    // Sẽ được triển khai với thư viện như SheetJS
    // Hiện tại, trả về định dạng CSV
    let csvContent = "data:text/csv;charset=utf-8,";

    // Tiêu đề
    csvContent += "Trường,Dữ liệu,Người thêm,Ngày thêm\n";

    // Dữ liệu
    fields.forEach((field) => {
      (field.data || []).forEach((item) => {
        csvContent += `"${field.name}","${item.value}","${
          item.addedBy
        }","${new Date(item.addedAt).toLocaleString("vi-VN")}"\n`;
      });
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute(
      "download",
      `data_export_${new Date().toISOString().split("T")[0]}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    return { success: true };
  }
}

// Khởi tạo hệ thống xác thực
const authSystem = new AuthSystem();

// Hỗ trợ legacy
const auth = authSystem;

// Xuất để sử dụng module
export { authSystem, auth };
