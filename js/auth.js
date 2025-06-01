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

// Security monitoring
class SecurityMonitor {
  constructor() {
    this.suspiciousActivity = [];
    this.failedAttempts = new Map();
    this.maxFailedAttempts = 5;
    this.blockDuration = 300000; // 5 minutes
  }

  logActivity(type, details = {}) {
    const activity = {
      type,
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      ip: details.ip || "unknown",
      details,
    };

    this.suspiciousActivity.push(activity);

    // Keep only last 100 activities
    if (this.suspiciousActivity.length > 100) {
      this.suspiciousActivity = this.suspiciousActivity.slice(-100);
    }
  }

  recordFailedAttempt(identifier) {
    if (!this.failedAttempts.has(identifier)) {
      this.failedAttempts.set(identifier, []);
    }

    const attempts = this.failedAttempts.get(identifier);
    attempts.push(Date.now());

    // Clean old attempts
    const cutoff = Date.now() - this.blockDuration;
    const recentAttempts = attempts.filter((time) => time > cutoff);
    this.failedAttempts.set(identifier, recentAttempts);
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
}

class AuthSystem {
  constructor() {
    this.currentUser = null;
    this.db = null;
    this.securityMonitor = new SecurityMonitor();
    this.initialized = false;
    this.init();
  }

  async init() {
    try {
      // Perform security checks
      await configManager.performSecurityChecks();

      // Get secure configuration
      const firebaseConfig = await configManager.getConfig();

      // Initialize Firebase with secure config
      app = initializeApp(firebaseConfig);
      analytics = getAnalytics(app);
      db = getFirestore(app);

      this.db = db;
      this.initialized = true;

      // Check session storage for current user (temporary session only)
      const savedUser = sessionStorage.getItem("currentUser");
      if (savedUser) {
        this.currentUser = JSON.parse(savedUser);
        // Verify user still exists in database
        const userExists = await this.verifyUserExists(this.currentUser.email);
        if (!userExists) {
          this.logout();
          return;
        }
        this.redirectToAppropriatePanel();
      }

      // Set up security monitoring
      this.setupSecurityMonitoring();
    } catch (error) {
      console.error("Failed to initialize authentication system:", error);
      this.handleInitializationError(error);
    }
  }

  setupSecurityMonitoring() {
    // Monitor for suspicious activity
    let lastActivity = Date.now();

    // Track user interactions
    ["click", "keypress", "mousewheel"].forEach((eventType) => {
      document.addEventListener(
        eventType,
        () => {
          lastActivity = Date.now();
        },
        { passive: true }
      );
    });

    // Check for idle users periodically
    setInterval(() => {
      const idleTime = Date.now() - lastActivity;
      if (idleTime > 1800000 && this.isLoggedIn()) {
        // 30 minutes idle
        this.securityMonitor.logActivity("idle_timeout");
        this.logout();
      }
    }, 60000); // Check every minute

    // Monitor page visibility
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        this.securityMonitor.logActivity("page_hidden");
      } else {
        this.securityMonitor.logActivity("page_visible");
      }
    });
  }

  handleInitializationError(error) {
    // Create minimal error UI
    document.body.innerHTML = `
      <div style="
        display: flex;
        justify-content: center;
        align-items: center;
        height: 100vh;
        font-family: Arial, sans-serif;
        background: linear-gradient(135deg, #fffef7 0%, #fff8e1 100%);
      ">
        <div style="
          text-align: center;
          padding: 40px;
          background: white;
          border-radius: 20px;
          box-shadow: 0 15px 35px rgba(0, 0, 0, 0.1);
          max-width: 400px;
        ">
          <h2 style="color: #f44336; margin-bottom: 20px;">🔒 Lỗi Bảo Mật</h2>
          <p style="color: #666; margin-bottom: 30px;">
            Ứng dụng không thể khởi tạo do lỗi bảo mật. Vui lòng liên hệ quản trị viên.
          </p>
          <button onclick="window.location.reload()" style="
            background: linear-gradient(135deg, #ff6b35 0%, #ff9a56 100%);
            color: white;
            border: none;
            padding: 12px 24px;
            border-radius: 8px;
            cursor: pointer;
            font-weight: 600;
          ">Thử lại</button>
        </div>
      </div>
    `;
  }

  async verifyUserExists(email) {
    try {
      // Wait for initialization
      if (!this.initialized) {
        await this.waitForInitialization();
      }

      // Normalize email
      const normalizedEmail = email.trim().toLowerCase();
      const userDoc = await getDoc(doc(db, "users", normalizedEmail));
      return userDoc.exists() && userDoc.data().isActive;
    } catch (error) {
      console.error("Error verifying user:", error);
      return false;
    }
  }

  async waitForInitialization() {
    let attempts = 0;
    while (!this.initialized && attempts < 50) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      attempts++;
    }

    if (!this.initialized) {
      throw new Error("Authentication system failed to initialize");
    }
  }

  async login(emailOrUsername, password) {
    try {
      // Wait for initialization
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

      // Normalize input - trim and lowercase
      const normalizedInput = emailOrUsername.trim().toLowerCase();

      // Security delay to prevent brute force
      await this.delay(300);

      console.log("Attempting login for:", normalizedInput);

      let userDoc = null;
      let finalEmail = null;
      let foundUserData = null;

      // First try direct lookup (for email-based IDs)
      userDoc = await getDoc(doc(db, "users", normalizedInput));

      if (userDoc.exists()) {
        foundUserData = userDoc.data();
        finalEmail = normalizedInput;
        console.log("Found user by direct email lookup:", normalizedInput);
      } else {
        console.log("Direct lookup failed, searching by email/username...");

        // Search all users to find by email or username
        const allUsersSnapshot = await getDocs(collection(db, "users"));
        let foundUser = null;

        allUsersSnapshot.forEach((doc) => {
          const data = doc.data();
          const userEmail = data.email?.toLowerCase() || "";
          const userName = data.username?.toLowerCase() || "";

          // Check if input matches email or username
          if (userEmail === normalizedInput || userName === normalizedInput) {
            foundUser = { id: doc.id, ...data };
            finalEmail = doc.id; // Document ID is the normalized email
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
          "Found user by email/username search:",
          foundUserData.email
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
      await updateDoc(doc(db, "users", finalEmail), {
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
    const screen = `${screen.width}x${screen.height}`;
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;

    return btoa(`${timestamp}_${random}_${screen}_${tz}`).substr(0, 16);
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
      const q = query(collection(db, "users"), where("role", "==", "user"));

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
        const allUsersSnapshot = await getDocs(collection(db, "users"));
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

      // Rate limiting for admin operations
      const clientId = this.getClientIdentifier();
      if (!rateLimiter.isAllowed(`admin_${clientId}`)) {
        return {
          success: false,
          message: "Quá nhiều thao tác. Vui lòng thử lại sau.",
        };
      }

      // Normalize email - trim and lowercase
      const normalizedEmail = userData.email.trim().toLowerCase();
      // Generate username from email if not provided
      const username =
        userData.username?.trim().toLowerCase() ||
        normalizedEmail.split("@")[0];

      console.log("Creating user with normalized email:", normalizedEmail);

      // Check if user already exists by email
      const existingUser = await getDoc(doc(db, "users", normalizedEmail));
      if (existingUser.exists()) {
        return { success: false, message: "Email đã tồn tại!" };
      }

      // Check if username already exists
      const allUsersSnapshot = await getDocs(collection(db, "users"));
      let usernameExists = false;
      allUsersSnapshot.forEach((doc) => {
        const data = doc.data();
        if (data.username === username) {
          usernameExists = true;
        }
      });

      if (usernameExists) {
        return { success: false, message: "Tên người dùng đã tồn tại!" };
      }

      const newUser = {
        email: normalizedEmail, // Use normalized email
        username: username, // Add username field
        password: userData.password,
        name: userData.name,
        role: "user",
        assignedFields: userData.assignedFields || [],
        createdAt: serverTimestamp(),
        createdBy: this.currentUser.email,
        isActive: true,
      };

      // Use normalized email as document ID
      await setDoc(doc(db, "users", normalizedEmail), newUser);

      console.log("User created successfully:", normalizedEmail);

      return {
        success: true,
        user: {
          id: normalizedEmail,
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

      await updateDoc(doc(db, "users", userId), {
        ...userData,
        updatedAt: serverTimestamp(),
        updatedBy: this.currentUser.email,
      });

      const updatedDoc = await getDoc(doc(db, "users", userId));
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
      await updateDoc(doc(db, "users", userId), {
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
      const q = query(collection(db, "fields"), where("isActive", "==", true));

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
        const allFieldsSnapshot = await getDocs(collection(db, "fields"));
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

      const q = query(collection(db, "fields"), where("isActive", "==", true));
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
      const allFieldsSnapshot = await getDocs(collection(db, "fields"));
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

      const docRef = doc(collection(db, "fields"));
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
      await updateDoc(doc(db, "fields", fieldId), {
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

      const fieldDoc = await getDoc(doc(db, "fields", fieldId));
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

      await updateDoc(doc(db, "fields", fieldId), {
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

      const fieldDoc = await getDoc(doc(db, "fields", fieldId));
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

      await updateDoc(doc(db, "fields", fieldId), {
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
