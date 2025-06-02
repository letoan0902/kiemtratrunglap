// Global password toggle function - must be in global scope for onclick
// Add password toggle states tracking like index.js
let passwordToggleStates = {};

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

// Hàm hover toggle password với hiệu ứng mượt mà cho admin
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

// Animation functions from index.js for smooth icon transitions
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

// Auto-save functionality for admin forms
let adminAutoSaveInterval = null;
let lastAdminSaveData = "";

function startAdminAutoSave() {
  // Don't start if already running
  if (adminAutoSaveInterval) return;

  adminAutoSaveInterval = setInterval(() => {
    saveAdminFormDataToLocal();
  }, 60000); // 60 seconds instead of 10 - less frequent for admin
}

function stopAdminAutoSave() {
  if (adminAutoSaveInterval) {
    clearInterval(adminAutoSaveInterval);
    adminAutoSaveInterval = null;
  }
}

function saveAdminFormDataToLocal() {
  try {
    // Only save if there's an active modal with form data
    const activeModal = document.querySelector('.modal[style*="flex"]');
    if (!activeModal) {
      return; // No modal open, nothing to save
    }

    const form = activeModal.querySelector("form");
    if (!form) {
      return; // No form in modal
    }

    const formData = {
      timestamp: new Date().toISOString(),
      page: "admin",
      currentTab: window.adminPanel?.currentTab || "users",
    };

    let hasData = false;
    const inputs = form.querySelectorAll(
      'input[type="text"], input[type="email"], textarea'
    );
    inputs.forEach((input) => {
      if (input.id && input.value.trim()) {
        formData[input.id] = input.value.trim();
        hasData = true;
      }
    });

    // Only save if there's actual data and it's different from last save
    const currentDataString = JSON.stringify(formData);
    if (!hasData || currentDataString === lastAdminSaveData) {
      return;
    }

    localStorage.setItem("admin_form_backup", currentDataString);
    lastAdminSaveData = currentDataString;
    console.log("Auto-saved admin form data");
  } catch (error) {
    console.warn("Failed to save admin form data:", error);
  }
}

function clearAllAdminLocalData() {
  try {
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (
        key &&
        (key.startsWith("admin_") ||
          key.startsWith("app_") ||
          key.startsWith("auth_") ||
          key.startsWith("user_"))
      ) {
        keysToRemove.push(key);
      }
    }

    keysToRemove.forEach((key) => {
      localStorage.removeItem(key);
    });

    console.log("Cleared admin local data");
  } catch (error) {
    console.warn("Failed to clear admin local data:", error);
  }
}

async function logout() {
  // Stop auto-save immediately
  stopAdminAutoSave();

  // Tạo modal xác nhận đăng xuất
  const confirmed = await Utils.confirmDialog(
    "Bạn có chắc chắn muốn đăng xuất khỏi hệ thống?",
    "small"
  );

  if (confirmed) {
    // Clear all local data before logout
    clearAllAdminLocalData();
    authSystem.logout();
  } else {
    // Restart auto-save if user cancels logout
    startAdminAutoSave();
  }
}

// Module imports and AdminPanel class will be loaded via module script in HTML
