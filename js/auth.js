// Authentication system using Firebase v9+ SDK with enhanced security
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

// Import secure configuration
import { configManager, rateLimiter } from "./config.js";

// Firebase app instance
let app = null;
let analytics = null;
let db = null;

// Optimized Security monitoring
class SecurityMonitor {
  constructor() {
    this.suspiciousActivity = [];
    this.failedAttempts = new Map();
    this.maxFailedAttempts = 5;
    this.blockDuration = 300000; // 5 minutes
    this.initialized = false;
  }

  // Lazy initialization
  init() {
    if (this.initialized) return;
    this.initialized = true;

    // Clean up old data periodically (background)
    setInterval(() => {
      this.cleanup();
    }, 60000); // Every minute
  }

  logActivity(type, details = {}) {
    // Lazy init on first use
    if (!this.initialized) this.init();

    const activity = {
      type,
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent.slice(0, 100), // Truncate for performance
      details,
    };

    this.suspiciousActivity.push(activity);

    // Keep only last 50 activities (reduced from 100)
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

    // Limit stored attempts
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

  // Background cleanup
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

    // Fast async initialization
    this.initPromise = this.init();
  }

  async init() {
    try {
      // Parallel initialization for speed
      const [securityCheck, firebaseConfig] = await Promise.all([
        configManager.performSecurityChecks(),
        configManager.getConfig(),
      ]);

      // Initialize Firebase with secure config
      app = initializeApp(firebaseConfig);
      this.db = getFirestore(app);

      // Analytics lazy loading (non-blocking)
      setTimeout(() => {
        analytics = getAnalytics(app);
      }, 0);

      this.initialized = true;

      // Check session storage for current user (parallel)
      const savedUser = sessionStorage.getItem("currentUser");
      if (savedUser) {
        try {
          this.currentUser = JSON.parse(savedUser);

          // Async user verification (don't block UI)
          this.verifyUserExists(this.currentUser.email).then((exists) => {
            if (!exists) {
              this.logout();
            } else {
              this.redirectToAppropriatePanel();
            }
          });
        } catch (e) {
          // Invalid session data
          sessionStorage.removeItem("currentUser");
        }
      }

      // Lazy security monitoring setup
      setTimeout(() => {
        this.setupSecurityMonitoring();
      }, 1000);
    } catch (error) {
      console.error("Failed to initialize authentication system:", error);
      this.handleInitializationError(error);
    }
  }

  setupSecurityMonitoring() {
    if (this.monitoringSetup) return;
    this.monitoringSetup = true;

    // Optimized activity tracking
    let lastActivity = Date.now();
    let idleCheckInterval = null;

    // Throttled activity tracker
    const throttledActivityUpdate = this.throttle(() => {
      lastActivity = Date.now();
    }, 1000); // Update max once per second

    // Efficient event listeners
    const events = ["click", "keypress", "scroll"];
    events.forEach((eventType) => {
      document.addEventListener(eventType, throttledActivityUpdate, {
        passive: true,
        capture: false,
      });
    });

    // Optimized idle checking (every 2 minutes instead of 1)
    idleCheckInterval = setInterval(() => {
      const idleTime = Date.now() - lastActivity;
      if (idleTime > 1800000 && this.isLoggedIn()) {
        // 30 minutes idle
        this.securityMonitor.logActivity("idle_timeout");
        this.logout();
        clearInterval(idleCheckInterval);
      }
    }, 120000); // Check every 2 minutes

    // Simplified page visibility monitoring
    document.addEventListener(
      "visibilitychange",
      () => {
        if (document.hidden) {
          lastActivity = Date.now() - 300000; // Mark as 5 min idle when hidden
        } else {
          lastActivity = Date.now();
        }
      },
      { passive: true }
    );
  }

  // Throttle helper for performance
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
    // Lightweight error UI
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
      // Check cache first
      const cacheKey = `user_exists_${email}`;
      const cached = this.cache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < 60000) {
        // 1 minute cache
        return cached.data;
      }

      // Wait for initialization if needed
      if (!this.initialized) {
        await this.initPromise;
      }

      // Normalize email
      const normalizedEmail = email.trim().toLowerCase();
      const userDoc = await getDoc(doc(this.db, "users", normalizedEmail));
      const exists = userDoc.exists() && userDoc.data().isActive;

      // Cache result
      this.cache.set(cacheKey, {
        data: exists,
        timestamp: Date.now(),
      });

      return exists;
    } catch (error) {
      console.error("Error verifying user:", error);
      return false;
    }
  }

  async waitForInitialization() {
    if (this.initialized) return;
    return this.initPromise;
  }

  async login(emailOrUsername, password) {
    try {
      // Fast initialization check
      await this.waitForInitialization();

      // Rate limiting check
      const clientId = this.getClientIdentifier();
      if (!rateLimiter.isAllowed(`login_${clientId}`)) {
        this.securityMonitor.logActivity("rate_limit_exceeded", { clientId });
        return {
          success: false,
          message: "Quá nhiều lần đăng nhập. Vui lòng thử lại sau.",
          field: "email",
        };
      }

      // Check if client is blocked due to failed attempts
      if (this.securityMonitor.isBlocked(clientId)) {
        this.securityMonitor.logActivity("blocked_attempt", { clientId });
        return {
          success: false,
          message:
            "Tài khoản tạm thời bị khóa do nhiều lần đăng nhập sai. Vui lòng thử lại sau 5 phút.",
          field: "email",
        };
      }

      // Normalize input
      const normalizedInput = emailOrUsername.trim().toLowerCase();

      // Fast lookup strategy - try username first, then scan if needed
      let userDoc = null;
      let finalUserId = null;
      let foundUserData = null;

      // First try direct username lookup (fastest)
      userDoc = await getDoc(doc(this.db, "users", normalizedInput));

      if (userDoc.exists()) {
        foundUserData = userDoc.data();
        finalUserId = normalizedInput;
        console.log("Found user by direct username lookup:", normalizedInput);
      } else {
        console.log(
          "Direct username lookup failed, checking if input is email..."
        );

        // If direct lookup failed, it might be an email - scan for email field
        // This is slower but only runs when someone logs in with email instead of username
        const allUsersSnapshot = await getDocs(collection(this.db, "users"));
        let foundUser = null;

        allUsersSnapshot.forEach((doc) => {
          const data = doc.data();
          const userEmail = data.email?.toLowerCase() || "";
          const userName = data.username?.toLowerCase() || "";

          // Check if input matches email or username
          if (userEmail === normalizedInput || userName === normalizedInput) {
            foundUser = { id: doc.id, ...data };
            finalUserId = doc.id; // Document ID is the username
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

        console.log("Found user by email search:", foundUserData.username);
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

      // Clear failed attempts on successful login
      this.securityMonitor.clearFailedAttempts(clientId);
      this.securityMonitor.logActivity("login_success", {
        email: foundUserData.email,
        clientId,
      });

      // Create user session
      const user = {
        email: foundUserData.email,
        username: foundUserData.username || foundUserData.email,
        role: foundUserData.role,
        name: foundUserData.name,
        assignedFields: foundUserData.assignedFields || [],
        loginTime: new Date().toISOString(),
      };

      this.currentUser = user;
      // Use sessionStorage instead of localStorage for better security
      sessionStorage.setItem("currentUser", JSON.stringify(user));

      // Update last login time in Firestore
      await updateDoc(doc(this.db, "users", finalUserId), {
        lastLoginAt: serverTimestamp(),
      });

      console.log("Login successful for:", foundUserData.email);
      return { success: true, user: user };
    } catch (error) {
      console.error("Login error:", error);
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
    // Create a semi-persistent client identifier
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

  // User management functions for admin - FIX INDEX ERRORS
  async getUsers() {
    try {
      await this.waitForInitialization();

      // Remove orderBy to avoid index requirement
      const q = query(
        collection(this.db, "users"),
        where("role", "==", "user")
      );

      const querySnapshot = await getDocs(q);
      const users = [];

      querySnapshot.forEach((doc) => {
        const data = doc.data();
        users.push({
          id: doc.id,
          ...data,
          createdAt:
            data.createdAt?.toDate?.()?.toISOString() ||
            new Date().toISOString(),
        });
      });

      // Sort in JavaScript instead of Firestore
      users.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

      return users;
    } catch (error) {
      console.error("Error getting users:", error);
      // Fallback: get all users and filter
      try {
        const allUsersSnapshot = await getDocs(collection(this.db, "users"));
        const users = [];
        allUsersSnapshot.forEach((doc) => {
          const data = doc.data();
          if (data.role === "user") {
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
        console.error("Fallback error:", fallbackError);
        return [];
      }
    }
  }

  async createUser(userData) {
    try {
      await this.waitForInitialization();

      // Fast rate limiting check
      const clientId = this.getClientIdentifier();
      if (!rateLimiter.isAllowed(`admin_${clientId}`)) {
        return {
          success: false,
          message: "Quá nhiều thao tác. Vui lòng thử lại sau.",
        };
      }

      // Fast input processing
      const email = userData.email?.trim().toLowerCase() || null;
      const username = userData.username?.trim().toLowerCase();
      const password = userData.password?.trim() || "123456";
      const name = userData.name?.trim();

      // Fast validation
      if (!username) {
        return { success: false, message: "Vui lòng nhập tên đăng nhập!" };
      }

      if (username.length < 3) {
        return {
          success: false,
          message: "Tên đăng nhập phải có ít nhất 3 ký tự!",
        };
      }

      // Use username as document ID for fast lookup
      const userId = username;

      // Single fast check - try to get user by username (document ID)
      const existingUser = await getDoc(doc(this.db, "users", userId));
      if (existingUser.exists()) {
        return { success: false, message: "Tên người dùng đã tồn tại!" };
      }

      // Fast user object creation
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
      };

      // Single fast write operation
      await setDoc(doc(this.db, "users", userId), newUser);

      console.log("User created successfully:", userId);

      return {
        success: true,
        user: {
          id: userId,
          ...newUser,
          createdAt: new Date().toISOString(),
        },
      };
    } catch (error) {
      console.error("Error creating user:", error);
      return { success: false, message: "Có lỗi xảy ra khi tạo người dùng!" };
    }
  }

  async updateUser(userId, userData) {
    try {
      await this.waitForInitialization();

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
      console.error("Error updating user:", error);
      return {
        success: false,
        message: "Có lỗi xảy ra khi cập nhật người dùng!",
      };
    }
  }

  async deleteUser(userId) {
    try {
      await this.waitForInitialization();

      // Instead of deleting, we'll deactivate the user
      await updateDoc(doc(this.db, "users", userId), {
        isActive: false,
        deletedAt: serverTimestamp(),
        deletedBy: this.currentUser.email,
      });

      return { success: true };
    } catch (error) {
      console.error("Error deleting user:", error);
      return { success: false, message: "Có lỗi xảy ra khi xóa người dùng!" };
    }
  }

  // Field management - FIX INDEX ERRORS AND ADD FIELD ACCESS CONTROL
  async getFields() {
    try {
      await this.waitForInitialization();

      // Remove orderBy to avoid index requirement
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

      // Sort in JavaScript instead of Firestore
      allFields.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

      // If user is admin, return all fields
      if (this.isAdmin()) {
        return allFields;
      }

      // If user is regular user, return only assigned fields
      if (this.currentUser && this.currentUser.assignedFields) {
        const assignedFields = allFields.filter((field) =>
          this.currentUser.assignedFields.includes(field.id)
        );
        return assignedFields;
      }

      // If no assigned fields, return empty array
      return [];
    } catch (error) {
      console.error("Error getting fields:", error);
      // Fallback: get all fields and filter
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

        // Apply field access control
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
        console.error("Fallback error:", fallbackError);
        return [];
      }
    }
  }

  // Get all fields for admin (bypass access control)
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
      console.error("Error getting all fields for admin:", error);
      return [];
    }
  }

  async createField(fieldData) {
    try {
      await this.waitForInitialization();

      // Simplified check without complex query
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
      console.error("Error creating field:", error);
      return { success: false, message: "Có lỗi xảy ra khi tạo trường!" };
    }
  }

  async updateField(fieldId, updateData) {
    try {
      await this.waitForInitialization();

      const fieldRef = doc(this.db, "fields", fieldId);

      // Add timestamp
      const dataToUpdate = {
        ...updateData,
        updatedAt: new Date().toISOString(),
        updatedBy: this.currentUser.email,
      };

      await updateDoc(fieldRef, dataToUpdate);

      return { success: true };
    } catch (error) {
      console.error("Update field error:", error);
      return {
        success: false,
        message: "Có lỗi xảy ra khi cập nhật trường!",
      };
    }
  }

  async deleteField(fieldId) {
    try {
      await this.waitForInitialization();

      // Instead of deleting, we'll deactivate the field
      await updateDoc(doc(this.db, "fields", fieldId), {
        isActive: false,
        deletedAt: serverTimestamp(),
        deletedBy: this.currentUser.email,
      });

      return { success: true };
    } catch (error) {
      console.error("Error deleting field:", error);
      return { success: false, message: "Có lỗi xảy ra khi xóa trường!" };
    }
  }

  // Data management with field access control
  async addDataToField(fieldId, data) {
    try {
      await this.waitForInitialization();

      // Rate limiting for data operations
      const clientId = this.getClientIdentifier();
      if (!rateLimiter.isAllowed(`data_${clientId}`)) {
        return {
          success: false,
          message: "Quá nhiều thao tác. Vui lòng thử lại sau.",
        };
      }

      // Check if user has access to this field
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

      // Check for duplicates
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
      console.error("Error adding data:", error);
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
      console.error("Error removing data:", error);
      return { success: false, message: "Có lỗi xảy ra khi xóa dữ liệu!" };
    }
  }

  // Utility functions
  generateDataId() {
    return "data_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9);
  }

  delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // Export functions
  async exportData(format = "excel") {
    try {
      const fields = await this.getFields();

      if (format === "excel") {
        return this.exportToExcel(fields);
      }

      return { success: false, message: "Định dạng không được hỗ trợ!" };
    } catch (error) {
      console.error("Error exporting data:", error);
      return { success: false, message: "Có lỗi xảy ra khi xuất dữ liệu!" };
    }
  }

  async exportToExcel(fields) {
    // This will be implemented with a library like SheetJS
    // For now, return CSV format
    let csvContent = "data:text/csv;charset=utf-8,";

    // Header
    csvContent += "Trường,Dữ liệu,Người thêm,Ngày thêm\n";

    // Data
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

// Initialize auth system
const authSystem = new AuthSystem();

// Legacy support
const auth = authSystem;

// Export for module usage
export { authSystem, auth };
