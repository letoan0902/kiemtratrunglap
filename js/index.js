// Global Variables
let passwordToggleStates = {};
let autoSaveInterval = null;
let lastSavedData = "";
let isLoggedIn = false;
let currentStep = 1;

// Forgot Password Data
let forgotPasswordData = {
  email: "",
  otpId: "",
  userId: "",
  isValidated: false,
};

// Utility Functions (must be defined first)
function showLoadingModal(text = "Đang xử lý...") {
  document.getElementById("loadingText").textContent = text;
  document.getElementById("loadingModal").style.display = "flex";
}

function hideLoadingModal() {
  document.getElementById("loadingModal").style.display = "none";
}

function showError(message) {
  alert(message);
}

function clearErrors() {
  document.getElementById("emailError").textContent = "";
  document.getElementById("passwordError").textContent = "";
}

function showFieldError(fieldId, message) {
  const errorElement = document.getElementById(fieldId + "Error");
  if (errorElement) {
    errorElement.textContent = message;
    errorElement.style.display = "block";
  }
}

// Step Management Functions
function showStep(stepNumber) {
  // Hide all steps
  for (let i = 1; i <= 4; i++) {
    const step = document.getElementById(`authStep${i}`);
    if (step) {
      step.classList.remove("active");
    }
  }

  // Show target step
  const targetStep = document.getElementById(`authStep${stepNumber}`);
  if (targetStep) {
    targetStep.classList.add("active");
    currentStep = stepNumber;
    updateStepProgress();

    // Focus on appropriate input based on step
    setTimeout(() => {
      if (stepNumber === 3) {
        // Focus on first OTP input for step 3
        const firstOTPInput = document.querySelector(".otp-inputn1");
        if (firstOTPInput) {
          firstOTPInput.focus();
        }
      } else {
        // Focus on first general input for other steps
        const firstInput = targetStep.querySelector(
          'input[type="text"], input[type="password"]'
        );
        if (firstInput) {
          firstInput.focus();
        }
      }
    }, 100);
  }
}

function updateStepProgress() {
  const indicators = document.querySelectorAll(".step-indicator");
  indicators.forEach((indicator, index) => {
    const stepNum = index + 1;
    indicator.classList.remove("active", "completed");

    if (stepNum < currentStep) {
      indicator.classList.add("completed");
    } else if (stepNum === currentStep) {
      indicator.classList.add("active");
    }
  });
}

function goToNextStep() {
  if (currentStep < 4) {
    showStep(currentStep + 1);
  }
}

function goToPrevStep() {
  if (currentStep > 1) {
    showStep(currentStep - 1);
  }
}

function goToLogin() {
  showStep(1);
  resetForgotPasswordData();
}

// Forgot Password Functions
function showForgotPasswordStep1() {
  showStep(2);
}

function resetForgotPasswordData() {
  forgotPasswordData = {
    email: "",
    otpId: "",
    userId: "",
    isValidated: false,
  };

  // Clear all form inputs and errors
  const inputs = ["forgotEmail", "newPassword", "confirmPassword"];
  inputs.forEach((id) => {
    const element = document.getElementById(id);
    if (element) element.value = "";
  });

  const errors = [
    "forgotEmailError",
    "otpError",
    "newPasswordError",
    "confirmPasswordError",
  ];
  errors.forEach((id) => {
    const element = document.getElementById(id);
    if (element) element.textContent = "";
  });

  clearOTPInputs();
}

// OTP Functions
function handleOTPInput(input, event) {
  input.value = input.value.replace(/[^0-9]/g, "");

  if (input.value.length === 1) {
    const nextInput = input.nextElementSibling;
    if (nextInput && nextInput.classList.contains("otp-input")) {
      nextInput.focus();
    }
  }

  document.getElementById("otpError").textContent = "";
}

function handleOTPKeyDown(input, event) {
  if (event.key === "Backspace" && input.value === "") {
    const prevInput = input.previousElementSibling;
    if (prevInput && prevInput.classList.contains("otp-input")) {
      prevInput.focus();
    }
  } else if (event.key === "Enter") {
    // Kiểm tra nếu đang ở ô cuối cùng và tất cả ô đều đã nhập
    if (input.classList.contains("otp-input6")) {
      const allInputs = document.querySelectorAll(".otp-input");
      let allFilled = true;
      allInputs.forEach((otpInput) => {
        if (otpInput.value.trim() === "") {
          allFilled = false;
        }
      });

      if (allFilled) {
        // Kích hoạt xác minh OTP
        verifyOTP();
      }
    }
  }
}

function getOTPValue() {
  const otpInputs = document.querySelectorAll(".otp-input");
  let otp = "";
  otpInputs.forEach((input) => {
    otp += input.value;
  });
  return otp;
}

function clearOTPInputs() {
  const otpInputs = document.querySelectorAll(".otp-input");
  otpInputs.forEach((input) => {
    input.value = "";
  });
}

// Main Forgot Password Flow Functions
async function sendOTP() {
  const email = document.getElementById("forgotEmail").value.trim();

  if (!email) {
    showFieldError("forgotEmail", "Vui lòng nhập email hoặc tên đăng nhập");
    return;
  }

  document.getElementById("forgotEmailError").textContent = "";

  try {
    showLoadingModal("Đang kiểm tra thông tin...");

    const userExists = await checkUserExists(email);

    if (!userExists) {
      hideLoadingModal();
      showFieldError("forgotEmail", "Không tìm thấy tên đăng nhập / email");
      return;
    }

    showLoadingModal("Đang gửi mã OTP...");

    const response = await fetch(
      "https://otp-service-beta.vercel.app/api/otp/generate",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: userExists.email || email,
          type: "numeric",
          organization: "Hệ thống Kiểm tra Trùng lặp",
          subject: "Mã xác minh đặt lại mật khẩu",
        }),
      }
    );

    console.log("OTP Generate Response Status:", response.status);
    const result = await response.json();
    console.log("OTP Generate Response Data:", result);

    hideLoadingModal();

    // Xử lý response dựa trên structure thực tế
    if (
      response.ok &&
      (result.success === true || result.message || result.data)
    ) {
      forgotPasswordData.email = userExists.email || email;
      // Lưu thông tin cần thiết từ response
      if (result.data) {
        forgotPasswordData.otpId = result.data.id || result.data.otpId;
      } else if (result.id) {
        forgotPasswordData.otpId = result.id;
      }
      forgotPasswordData.userId = userExists.id;

      goToNextStep(); // Go to OTP step
      Utils.showSuccess("Mã OTP đã được gửi đến email của bạn!");
    } else {
      const errorMessage =
        result.error || result.message || "Có lỗi xảy ra khi gửi OTP";
      showFieldError("forgotEmail", errorMessage);
    }
  } catch (error) {
    hideLoadingModal();
    console.error("Lỗi gửi OTP:", error);
    showFieldError("forgotEmail", "Không thể gửi OTP. Vui lòng thử lại!");
  }
}

async function verifyOTP() {
  const otp = getOTPValue();

  if (otp.length !== 6) {
    showFieldError("otp", "Vui lòng nhập đầy đủ 6 số OTP");
    return;
  }

  if (!forgotPasswordData.email) {
    showFieldError("otp", "Thông tin email bị mất. Vui lòng bắt đầu lại!");
    return;
  }

  try {
    showLoadingModal("Đang xác minh OTP...");

    const response = await fetch(
      "https://otp-service-beta.vercel.app/api/otp/verify",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: forgotPasswordData.email,
          otp: otp,
        }),
      }
    );

    console.log("OTP Verify Response Status:", response.status);
    const result = await response.json();
    console.log("OTP Verify Response Data:", result);

    hideLoadingModal();

    // Xử lý response dựa trên structure thực tế - API trả về {"message":"OTP is verified"} khi thành công
    if (
      response.ok &&
      (result.success === true ||
        result.message === "OTP is verified" ||
        result.verified === true)
    ) {
      forgotPasswordData.isValidated = true;
      goToNextStep(); // Go to reset password step
      Utils.showSuccess("OTP xác minh thành công!");
    } else {
      const errorMessage =
        result.error || result.message || "Mã OTP không chính xác";
      showFieldError("otp", errorMessage);
    }
  } catch (error) {
    hideLoadingModal();
    console.error("Lỗi xác minh OTP:", error);
    showFieldError("otp", "Có lỗi xảy ra khi xác minh OTP. Vui lòng thử lại!");
  }
}

async function resetPassword() {
  if (!forgotPasswordData.isValidated) {
    Utils.showError("Vui lòng xác minh OTP trước!");
    return;
  }

  const newPassword = document.getElementById("newPassword").value.trim();
  const confirmPassword = document
    .getElementById("confirmPassword")
    .value.trim();

  if (!newPassword) {
    showFieldError("newPassword", "Vui lòng nhập mật khẩu mới");
    return;
  }

  if (newPassword.length < 6) {
    showFieldError("newPassword", "Mật khẩu phải có ít nhất 6 ký tự");
    return;
  }

  if (!confirmPassword) {
    showFieldError("confirmPassword", "Vui lòng xác nhận mật khẩu");
    return;
  }

  if (newPassword !== confirmPassword) {
    showFieldError("confirmPassword", "Mật khẩu xác nhận không khớp");
    return;
  }

  document.getElementById("newPasswordError").textContent = "";
  document.getElementById("confirmPasswordError").textContent = "";

  try {
    showLoadingModal("Đang cập nhật mật khẩu...");

    if (!window.authSystem) {
      throw new Error("Hệ thống xác thực chưa sẵn sàng");
    }

    const result = await authSystem.resetUserPassword(
      forgotPasswordData.userId,
      newPassword
    );
    hideLoadingModal();

    if (result.success) {
      Utils.showSuccess(
        "Mật khẩu đã được cập nhật thành công! Vui lòng đăng nhập lại."
      );
      goToLogin();
    } else {
      Utils.showError(result.message || "Có lỗi xảy ra khi cập nhật mật khẩu");
    }
  } catch (error) {
    hideLoadingModal();
    console.error("Lỗi cập nhật mật khẩu:", error);
    Utils.showError("Có lỗi xảy ra khi cập nhật mật khẩu. Vui lòng thử lại!");
  }
}

async function resendOTP() {
  if (!forgotPasswordData.email) {
    Utils.showError("Thông tin email bị mất. Vui lòng bắt đầu lại!");
    goToLogin();
    showForgotPasswordStep1();
    return;
  }

  try {
    showLoadingModal("Đang gửi lại mã OTP...");

    const response = await fetch(
      "https://otp-service-beta.vercel.app/api/otp/generate",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: forgotPasswordData.email,
          type: "numeric",
          organization: "Hệ thống Kiểm tra Trùng lặp",
          subject: "Mã xác minh đặt lại mật khẩu",
        }),
      }
    );

    console.log("Resend OTP Response Status:", response.status);
    const result = await response.json();
    console.log("Resend OTP Response Data:", result);

    hideLoadingModal();

    // Xử lý response dựa trên structure thực tế
    if (
      response.ok &&
      (result.success === true || result.message || result.data)
    ) {
      // Lưu thông tin cần thiết từ response
      if (result.data) {
        forgotPasswordData.otpId = result.data.id || result.data.otpId;
      } else if (result.id) {
        forgotPasswordData.otpId = result.id;
      }

      clearOTPInputs();
      const firstOTPInput = document.querySelector(".otp-input");
      if (firstOTPInput) firstOTPInput.focus();

      Utils.showSuccess("Mã OTP mới đã được gửi đến email của bạn!");
    } else {
      const errorMessage =
        result.error || result.message || "Có lỗi xảy ra khi gửi lại OTP";
      Utils.showError(errorMessage);
    }
  } catch (error) {
    hideLoadingModal();
    console.error("Lỗi gửi lại OTP:", error);
    Utils.showError("Không thể gửi lại OTP. Vui lòng thử lại!");
  }
}

async function checkUserExists(emailOrUsername) {
  try {
    if (!window.authSystem) {
      throw new Error("Hệ thống xác thực chưa sẵn sàng");
    }

    const userInfo = await authSystem.checkUserExists(emailOrUsername);
    return userInfo;
  } catch (error) {
    console.error("Lỗi kiểm tra user:", error);
    return false;
  }
}

// Password Toggle Functions
function togglePassword(inputId, button) {
  const input = document.getElementById(inputId);

  if (!passwordToggleStates[inputId]) {
    passwordToggleStates[inputId] = {
      isRevealed: false,
      hoverPaused: false,
      currentIcon: "hide",
    };
  }

  const state = passwordToggleStates[inputId];

  if (input.type === "password") {
    input.type = "text";
    state.isRevealed = true;
    state.currentIcon = "show";
  } else {
    input.type = "password";
    state.isRevealed = false;
    state.currentIcon = "hide";
  }

  state.hoverPaused = true;
  updateIconDisplay(button, state.currentIcon, true);

  setTimeout(() => {
    state.hoverPaused = false;
  }, 2000);
}

function hoverTogglePassword(inputId, button, isHovering) {
  if (!passwordToggleStates[inputId]) {
    passwordToggleStates[inputId] = {
      isRevealed: false,
      hoverPaused: false,
      currentIcon: "hide",
    };
  }

  const state = passwordToggleStates[inputId];
  const input = document.getElementById(inputId);

  if (state.hoverPaused) return;

  if (isHovering) {
    if (!state.isRevealed) {
      input.type = "text";
      animateIconTransition(button, "hide", "show");
    } else {
      input.type = "password";
      animateIconTransition(button, "show", "hide");
    }
  } else {
    if (!state.isRevealed) {
      input.type = "password";
      animateIconTransition(button, "show", "hide");
    } else {
      input.type = "text";
      animateIconTransition(button, "hide", "show");
    }
  }
}

function animateIconTransition(button, fromState, toState) {
  const hideIcon = button.querySelector(".hide-icon");
  const showIcon = button.querySelector(".show-icon");

  const hideAll = () => {
    hideIcon.style.display = "none";
    showIcon.style.display = "none";
  };

  if (fromState === toState) {
    updateIconDisplay(button, toState, false);
    return;
  }

  hideAll();

  if (fromState === "hide" && toState === "show") {
    hideIcon.style.display = "block";
    setTimeout(() => {
      hideIcon.style.display = "none";
      showIcon.style.display = "block";
    }, 50);
  } else if (fromState === "show" && toState === "hide") {
    showIcon.style.display = "block";
    setTimeout(() => {
      showIcon.style.display = "none";
      hideIcon.style.display = "block";
    }, 50);
  }
}

function updateIconDisplay(button, iconState, immediate = false) {
  const hideIcon = button.querySelector(".hide-icon");
  const showIcon = button.querySelector(".show-icon");

  hideIcon.style.display = "none";
  showIcon.style.display = "none";

  if (iconState === "hide") {
    hideIcon.style.display = "block";
  } else if (iconState === "show") {
    showIcon.style.display = "block";
  }
}

// Auto-save functionality
function startAutoSave() {
  if (isLoggedIn) return;
  if (autoSaveInterval) return;

  autoSaveInterval = setInterval(() => {
    if (!isLoggedIn) {
      saveFormDataToLocal();
    }
  }, 30000);
}

function stopAutoSave() {
  if (autoSaveInterval) {
    clearInterval(autoSaveInterval);
    autoSaveInterval = null;
  }
}

function saveFormDataToLocal() {
  try {
    if (isLoggedIn) {
      stopAutoSave();
      return;
    }

    const emailValue = document.getElementById("email")?.value || "";

    if (!emailValue || emailValue === lastSavedData) {
      return;
    }

    const formData = {
      email: emailValue,
      timestamp: new Date().toISOString(),
      page: "login",
    };

    localStorage.setItem("app_form_backup", JSON.stringify(formData));
    lastSavedData = emailValue;
    console.log("Auto-saved form data");
  } catch (error) {
    console.warn("Failed to save form data:", error);
  }
}

function loadFormDataFromLocal() {
  try {
    const savedData = localStorage.getItem("app_form_backup");
    if (savedData) {
      const formData = JSON.parse(savedData);
      if (formData.page === "login" && formData.email) {
        const emailInput = document.getElementById("email");
        if (emailInput && !emailInput.value) {
          emailInput.value = formData.email;
          lastSavedData = formData.email;
        }
      }
    }
  } catch (error) {
    console.warn("Failed to load form data:", error);
  }
}

function clearAllLocalData() {
  try {
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (
        key &&
        (key.startsWith("app_") ||
          key.startsWith("auth_") ||
          key.startsWith("user_"))
      ) {
        keysToRemove.push(key);
      }
    }

    keysToRemove.forEach((key) => {
      localStorage.removeItem(key);
    });

    console.log("Cleared local data");
  } catch (error) {
    console.warn("Failed to clear local data:", error);
  }
}

// Module loading and initialization functions
async function loadModules() {
  const MODULE_TIMEOUT = 10000;

  try {
    const loadPromise = Promise.all([
      import("./config.js"),
      import("./auth.js"),
    ]);

    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(
        () => reject(new Error("Hết thời gian tải module")),
        MODULE_TIMEOUT
      );
    });

    const [configModule, authModule] = await Promise.race([
      loadPromise,
      timeoutPromise,
    ]);

    window.configManager = configModule.configManager;
    window.rateLimiter = configModule.rateLimiter;
    window.authSystem = authModule.authSystem;

    return true;
  } catch (error) {
    console.error("Không thể tải modules:", error);
    hideLoadingModal();
    showError("Lỗi tải ứng dụng. Vui lòng thử lại.");
    return false;
  }
}

function showLockedAccountModal(message) {
  const modal = document.createElement("div");
  modal.className = "locked-account-modal";
  modal.innerHTML = `
        <div class="locked-account-content">
            <div class="locked-account-icon">🔒</div>
            <h3>Tài khoản bị khóa</h3>
            <p>${message}</p>
            <button class="btn btn-primary" onclick="this.closest('.locked-account-modal').remove()">
                Đã hiểu
            </button>
        </div>
    `;
  document.body.appendChild(modal);
}

async function waitForAuthSystem(maxAttempts = 100) {
  for (let i = 0; i < maxAttempts; i++) {
    if (window.authSystem) return true;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return false;
}

async function initializeApp() {
  showLoadingModal("Đang tải ứng dụng...");

  const modulesLoaded = await loadModules();
  if (!modulesLoaded) return;

  showLoadingModal("Đang khởi tạo bảo mật...");

  const authReady = await waitForAuthSystem();
  if (!authReady) {
    hideLoadingModal();
    showError("Không thể khởi tạo hệ thống xác thực.");
    return;
  }

  hideLoadingModal();

  if (authSystem.isLoggedIn()) {
    authSystem.redirectToAppropriatePanel();
    return;
  }

  // Kiểm tra auto login
  const autoLoginSuccess = await tryAutoLogin();
  if (autoLoginSuccess) {
    return; // Đã auto login thành công
  }

  setupFormHandlers();
}

function setupFormHandlers() {
  const loginForm = document.getElementById("loginForm");
  const emailInput = document.getElementById("email");
  const passwordInput = document.getElementById("password");

  loadFormDataFromLocal();

  if (!authSystem.isLoggedIn()) {
    startAutoSave();
  } else {
    isLoggedIn = true;
  }

  loginForm.addEventListener("submit", async function (e) {
    e.preventDefault();

    stopAutoSave();
    clearErrors();

    const email = emailInput.value.trim();
    const password = passwordInput.value.trim();
    const rememberMe =
      document.getElementById("rememberLogin")?.checked || false;

    let hasErrors = false;

    if (!email) {
      showFieldError("email", "Vui lòng nhập email hoặc tên đăng nhập");
      hasErrors = true;
    }

    if (!password) {
      showFieldError("password", "Vui lòng nhập mật khẩu");
      hasErrors = true;
    }

    if (hasErrors) {
      if (!isLoggedIn) {
        startAutoSave();
      }
      return;
    }

    showLoadingModal("Đang xác thực tài khoản...");

    try {
      const result = await authSystem.login(email, password);

      if (result.success) {
        isLoggedIn = true;
        stopAutoSave();

        // Lưu remember me
        saveRememberMe(email, password, rememberMe);

        showLoadingModal("Đăng nhập thành công!");
        localStorage.removeItem("app_form_backup");

        setTimeout(() => {
          hideLoadingModal();
          authSystem.redirectToAppropriatePanel();
        }, 300);
      } else {
        hideLoadingModal();

        if (!isLoggedIn) {
          startAutoSave();
        }

        if (result.isLocked) {
          showLockedAccountModal(result.message);
          return;
        }

        if (result.field === "email") {
          showFieldError("email", result.message);
        } else if (result.field === "password") {
          showFieldError("password", result.message);
        } else {
          showFieldError("email", result.message);
        }
      }
    } catch (error) {
      console.error("Lỗi đăng nhập:", error);
      hideLoadingModal();

      if (!isLoggedIn) {
        startAutoSave();
      }

      showFieldError("email", "Có lỗi xảy ra khi đăng nhập. Vui lòng thử lại!");
    }
  });

  let emailSaveTimeout = null;
  emailInput.addEventListener("input", () => {
    document.getElementById("emailError").textContent = "";

    if (isLoggedIn) return;

    clearTimeout(emailSaveTimeout);
    emailSaveTimeout = setTimeout(() => {
      const currentValue = emailInput.value.trim();
      if (currentValue && currentValue !== lastSavedData) {
        saveFormDataToLocal();
      }
    }, 2000);
  });

  passwordInput.addEventListener("input", () => {
    document.getElementById("passwordError").textContent = "";
  });

  emailInput.addEventListener("keypress", function (e) {
    if (e.key === "Enter") {
      passwordInput.focus();
    }
  });

  passwordInput.addEventListener("keypress", function (e) {
    if (e.key === "Enter") {
      loginForm.dispatchEvent(new Event("submit"));
    }
  });

  emailInput.focus();

  // Enter handling cho step 2 (forgot email)
  const forgotEmailInput = document.getElementById("forgotEmail");
  if (forgotEmailInput) {
    forgotEmailInput.addEventListener("keypress", function (e) {
      if (e.key === "Enter") {
        sendOTP();
      }
    });
  }

  // Enter handling cho step 4 (new password)
  const newPasswordInput = document.getElementById("newPassword");
  const confirmPasswordInput = document.getElementById("confirmPassword");

  if (newPasswordInput) {
    newPasswordInput.addEventListener("keypress", function (e) {
      if (e.key === "Enter") {
        confirmPasswordInput.focus();
      }
    });
  }

  if (confirmPasswordInput) {
    confirmPasswordInput.addEventListener("keypress", function (e) {
      if (e.key === "Enter") {
        resetPassword();
      }
    });
  }

  window.addEventListener("beforeunload", () => {
    stopAutoSave();
  });
}

// Initialize app when DOM is ready
document.addEventListener("DOMContentLoaded", initializeApp);

if (document.readyState !== "loading") {
  setTimeout(initializeApp, 0);
}

// Remember Me functionality
function saveRememberMe(email, password, rememberChecked) {
  try {
    if (rememberChecked) {
      const expirationDays = 30;
      const expirationDate = new Date();
      expirationDate.setDate(expirationDate.getDate() + expirationDays);

      const rememberData = {
        email: email,
        password: btoa(password), // Base64 encode for basic obfuscation
        expiration: expirationDate.toISOString(),
        type: "long",
      };
      localStorage.setItem("remember_login", JSON.stringify(rememberData));
      console.log("Saved remember login for 30 days");
    } else {
      const expirationDays = 5;
      const expirationDate = new Date();
      expirationDate.setDate(expirationDate.getDate() + expirationDays);

      const rememberData = {
        email: email,
        password: btoa(password),
        expiration: expirationDate.toISOString(),
        type: "short",
      };
      localStorage.setItem("remember_login", JSON.stringify(rememberData));
      console.log("Saved remember login for 5 days");
    }
  } catch (error) {
    console.warn("Failed to save remember login:", error);
  }
}

function checkRememberMe() {
  try {
    const rememberData = localStorage.getItem("remember_login");
    if (!rememberData) return null;

    const data = JSON.parse(rememberData);
    const now = new Date();
    const expiration = new Date(data.expiration);

    if (now > expiration) {
      localStorage.removeItem("remember_login");
      console.log("Remember login expired, removed");
      return null;
    }

    return {
      email: data.email,
      password: atob(data.password), // Base64 decode
      type: data.type,
    };
  } catch (error) {
    console.warn("Failed to check remember login:", error);
    localStorage.removeItem("remember_login");
    return null;
  }
}

function clearRememberMe() {
  localStorage.removeItem("remember_login");
  console.log("Cleared remember login");
}

async function tryAutoLogin() {
  const rememberData = checkRememberMe();
  if (!rememberData) return false;

  try {
    showLoadingModal("Đang đăng nhập tự động...");

    const result = await authSystem.login(
      rememberData.email,
      rememberData.password
    );

    if (result.success) {
      isLoggedIn = true;
      stopAutoSave();

      showLoadingModal("Đăng nhập thành công!");

      setTimeout(() => {
        hideLoadingModal();
        authSystem.redirectToAppropriatePanel();
      }, 500);

      return true;
    } else {
      // Nếu đăng nhập thất bại, xóa remember data
      clearRememberMe();
      hideLoadingModal();
      return false;
    }
  } catch (error) {
    console.error("Auto login failed:", error);
    clearRememberMe();
    hideLoadingModal();
    return false;
  }
}
