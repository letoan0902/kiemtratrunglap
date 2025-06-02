// Import modules
import { configManager, rateLimiter } from "./config.js";
import { authSystem } from "./auth.js";

// Làm cho chúng có sẵn globally
window.configManager = configManager;
window.rateLimiter = rateLimiter;
window.authSystem = authSystem;

class AdminPanel {
  constructor() {
    this.currentTab = "users";
    this.customSelects = new Map();
    this.searchTimers = new Map();
    this.columnSearchStates = new Map();
    this.allUsers = [];
    this.allFields = [];
    this.allData = [];
    this.init();
  }

  async init() {
    // Đợi auth system sẵn sàng
    await this.waitForAuth();

    // Kiểm tra xác thực
    if (!authSystem.requireAdmin()) {
      return;
    }

    this.setupEventListeners();
    await this.loadData();
    this.updateUI();

    // Trì hoãn init custom selects để đảm bảo DOM đã sẵn sàng
    setTimeout(() => {
      this.initCustomSelects();
    }, 100);

    // Bắt đầu auto-save cho admin forms
    startAdminAutoSave();

    // Dọn dẹp khi thoát trang
    window.addEventListener("beforeunload", () => {
      stopAdminAutoSave();
    });
  }

  async waitForAuth() {
    // Đợi Firebase và auth system sẵn sàng
    let attempts = 0;
    while ((!window.authSystem || !authSystem.isLoggedIn()) && attempts < 100) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      attempts++;
    }
  }

  setupEventListeners() {
    // Điều hướng tab
    document.querySelectorAll(".tab-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const tabName = e.target.dataset.tab;
        this.switchTab(tabName);
      });
    });

    // Thêm user
    document.getElementById("addUserBtn").addEventListener("click", () => {
      this.showAddUserModal();
    });

    // Thêm field
    document.getElementById("addFieldBtn").addEventListener("click", () => {
      this.showAddFieldModal();
    });

    // Export buttons
    document.getElementById("exportAllBtn").addEventListener("click", () => {
      this.exportAllDataExcel();
    });

    document.getElementById("exportFieldBtn").addEventListener("click", () => {
      this.exportFieldDataExcel();
    });

    document
      .getElementById("exportUserDataBtn")
      .addEventListener("click", () => {
        this.exportUserDataExcel();
      });

    // User status filter
    document
      .getElementById("userStatusFilter")
      .addEventListener("change", (e) => {
        this.filterUsersByStatus(e.target.value);
      });

    // Logout
    document.getElementById("logoutBtn").addEventListener("click", () => {
      logout();
    });

    this.setupEnhancedSearch();
    // this.initCustomSelects(); // Already called in init()
  }

  async toggleUserLock(userId) {
    try {
      console.log("toggleUserLock called with userId:", userId);

      // Get current user info to determine action - force fresh data
      const users = await authSystem.getUsers();
      const user = users.find((u) => u.id === userId);

      if (!user) {
        console.error("User not found in users list:", {
          userId: userId,
          availableUsers: users.map((u) => u.id),
        });
        Utils.showError("Không tìm thấy người dùng!");
        return;
      }

      // Log current user status
      console.log("Current user data:", {
        userId: userId,
        email: user.email,
        name: user.name,
        status: user.status,
        hasStatusField: user.hasOwnProperty("status"),
        statusType: typeof user.status,
      });

      const isLocked = user.status === false;
      const action = isLocked ? "mở khóa" : "khóa";
      console.log(`Attempting to ${action} user:`, {
        userId: userId,
        currentStatus: user.status,
        isLocked: isLocked,
        action: action,
      });

      const confirmed = await Utils.confirmDialog(
        `Bạn có chắc chắn muốn ${action} người dùng "${user.name}"?`,
        "small"
      );

      if (!confirmed) {
        console.log("User cancelled the action");
        return;
      }

      // Show loading
      Utils.showInfo(`Đang ${action} người dùng...`);

      // Call deleteUser() method which contains the lock/unlock logic
      console.log(
        "Calling authSystem.deleteUser() which handles status toggle"
      );

      const result = await authSystem.deleteUser(userId);

      console.log("Toggle user result:", result);

      if (result.success) {
        Utils.showSuccess(
          result.message ||
            `${
              action.charAt(0).toUpperCase() + action.slice(1)
            } người dùng thành công!`
        );

        // Force refresh both users list and statistics
        console.log("Refreshing user list and statistics...");
        await Promise.all([this.loadUsers(), this.loadStatistics()]);
        console.log("Refresh completed");
      } else {
        console.error("Toggle user failed:", result);
        Utils.showError(result.message || `Có lỗi khi ${action} người dùng!`);
      }
    } catch (error) {
      console.error("Error in toggleUserLock:", error);
      Utils.showError("Có lỗi xảy ra khi thực hiện thao tác!");
    }
  }

  // Search and filter methods
  clearAllColumnSearch(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const inputs = container.querySelectorAll(".column-search-input");
    inputs.forEach((input) => {
      input.value = "";
    });

    // Clear the search
    const tabName = containerId
      .replace("ColumnSearch", "")
      .replace("user", "users");
    this.performColumnSearch(tabName, {});
  }

  hideColumnSearch(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.style.display = "none";

    // Also clear any active search
    this.clearAllColumnSearch(containerId);
  }

  showColumnSearch(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.style.display = "block";
  }

  performColumnSearch(tabName, criteria) {
    const tables = document.querySelectorAll(`#${tabName}TableContainer table`);

    tables.forEach((table) => {
      const rows = table.querySelectorAll("tbody tr");
      let visibleCount = 0;

      rows.forEach((row) => {
        const cells = row.querySelectorAll("td");
        let matches = true;

        // Check each search criteria
        for (const [columnIndex, searchValue] of Object.entries(criteria)) {
          const colIndex = parseInt(columnIndex);
          if (colIndex >= 0 && colIndex < cells.length) {
            const cellText = cells[colIndex].textContent.toLowerCase();
            if (!cellText.includes(searchValue)) {
              matches = false;
              break;
            }
          }
        }

        if (matches) {
          row.style.display = "";
          row.classList.add("search-highlight");
          visibleCount++;
          setTimeout(() => row.classList.remove("search-highlight"), 1000);
        } else {
          row.style.display = "none";
        }
      });

      // Update table info if exists
      this.updateTableInfo(table, visibleCount, rows.length);
    });
  }

  updateTableInfo(table, visibleCount, totalCount) {
    let infoElement = table.parentElement.querySelector(".table-search-info");
    if (!infoElement) {
      infoElement = document.createElement("div");
      infoElement.className = "table-search-info";
      infoElement.style.cssText = `
          text-align: center;
          padding: 8px;
          background: rgba(255, 179, 128, 0.1);
          border-radius: 6px;
          margin: 10px 0;
          font-size: 14px;
          color: #666;
      `;
      table.parentElement.insertBefore(infoElement, table);
    }

    if (visibleCount < totalCount) {
      infoElement.textContent = `Hiển thị ${visibleCount} trong ${totalCount} mục`;
      infoElement.style.display = "block";
    } else {
      infoElement.style.display = "none";
    }
  }

  async loadData() {
    await this.loadStatistics();
    await this.loadUsers();
    await this.loadFields();
  }

  async loadStatistics() {
    const users = await authSystem.getUsers();
    const fields = await authSystem.getFields();
    let totalData = 0;
    let totalDuplicates = 0;

    fields.forEach((field) => {
      totalData += (field.data || []).length;
      // Check for duplicates within field
      const values = (field.data || []).map((item) => item.value);
      const duplicates = values.filter(
        (value, index) => values.indexOf(value) !== index
      );
      totalDuplicates += duplicates.length;
    });

    // Animate numbers
    Utils.animateNumber(document.getElementById("totalUsers"), 0, users.length);
    Utils.animateNumber(
      document.getElementById("totalFields"),
      0,
      fields.length
    );
    Utils.animateNumber(document.getElementById("totalData"), 0, totalData);
    Utils.animateNumber(
      document.getElementById("totalDuplicates"),
      0,
      totalDuplicates
    );
  }

  async loadUsers() {
    const users = await authSystem.getUsers();

    // Sort users by creation date - newest first
    users.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    const container = document.getElementById("usersTableContainer");

    const columns = [
      { key: "name", title: "Tên", searchable: true },
      { key: "email", title: "Email", searchable: true },
      {
        key: "assignedFields",
        title: "Trường được gán",
        render: (fields) => (fields || []).length + " trường",
      },
      {
        key: "status",
        title: "Trạng thái",
        render: (status) => {
          const isLocked = status === false;
          return `<span class="status-badge ${
            isLocked ? "status-locked" : "status-active"
          }">${isLocked ? "🔒 Bị khóa" : "✅ Hoạt động"}</span>`;
        },
      },
      {
        key: "createdAt",
        title: "Ngày tạo",
        type: "dateShort",
        searchable: true,
      },
      { key: "createdBy", title: "Tạo bởi", searchable: true },
    ];

    const options = {
      actions: (user) => {
        const isLocked = user.status === false;
        const lockBtnClass = isLocked ? "btn-success" : "btn-warning";
        const lockBtnText = isLocked ? "🔓" : "🔒";
        return `
          <div class="action-buttons">
            <button class="btn btn-secondary" onclick="adminPanel.editUser('${
              user.id
            }')" title="Sửa">✏️</button>
            <button class="btn ${lockBtnClass}" onclick="adminPanel.toggleUserLock('${
          user.id
        }')" title="${isLocked ? "Mở khóa" : "Khóa"}">${lockBtnText}</button>
          </div>
        `;
      },
      onHeaderClick: (column, index) => {
        if (column.searchable) {
          this.showColumnSearch("userColumnSearch");
        }
      },
    };

    const table = Utils.createTable(users, columns, options);
    container.innerHTML = "";
    container.appendChild(table);

    // Store users for filtering
    this.allUsers = users;

    // Add click handlers to searchable headers
    this.addHeaderClickHandlers(table, "userColumnSearch");
  }

  async loadFields() {
    const fields = await authSystem.getAllFieldsForAdmin();

    // Sort fields by creation date - newest first
    fields.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    const users = await authSystem.getUsers();
    const container = document.getElementById("fieldsTableContainer");

    const columns = [
      { key: "name", title: "Tên trường", searchable: true },
      { key: "description", title: "Mô tả", searchable: true },
      {
        key: "data",
        title: "Số lượng dữ liệu",
        render: (data) => (data || []).length + " mục",
      },
      {
        key: "assignedUsers",
        title: "Gán",
        render: (assignedUsers, field) => {
          const assignedCount = this.getAssignedUserCount(field.id, users);
          return `<button class="btn btn-secondary" onclick="adminPanel.showFieldAssignmentModal('${field.id}')" style="padding: 5px 10px;">${assignedCount} người</button>`;
        },
      },
      {
        key: "createdAt",
        title: "Ngày tạo",
        type: "dateShort",
        searchable: true,
      },
      { key: "createdBy", title: "Tạo bởi", searchable: true },
    ];

    const options = {
      actions: (field) => `
        <div class="action-buttons">
          <button class="btn btn-secondary" onclick="adminPanel.editField('${field.id}')" title="Sửa">✏️</button>
          <button class="btn btn-danger" onclick="adminPanel.deleteField('${field.id}')" title="Xóa">🗑️</button>
        </div>
      `,
      pagination: true,
      itemsPerPage: 10,
      onHeaderClick: (column, index) => {
        if (column.searchable) {
          this.showColumnSearch("fieldColumnSearch");
        }
      },
    };

    const table = Utils.createTable(fields, columns, options);
    container.innerHTML = "";
    container.appendChild(table);

    // Add click handlers to searchable headers
    this.addHeaderClickHandlers(table, "fieldColumnSearch");
  }

  setupEnhancedSearch() {
    // Setup clear buttons and enhanced search for each tab
    this.setupTabSearch(
      "users",
      "userSearchBox",
      "userSearchClear",
      "userColumnSearch"
    );
    this.setupTabSearch(
      "fields",
      "fieldSearchBox",
      "fieldSearchClear",
      "fieldColumnSearch"
    );
    this.setupTabSearch(
      "data",
      "dataSearchBox",
      "dataSearchClear",
      "dataColumnSearch"
    );
  }

  setupTabSearch(tabName, searchBoxId, clearBtnId, columnSearchId) {
    const searchBox = document.getElementById(searchBoxId);
    const clearBtn = document.getElementById(clearBtnId);
    const columnSearchContainer = document.getElementById(columnSearchId);

    if (!searchBox || !clearBtn) return;

    // Clear button functionality
    clearBtn.addEventListener("click", () => {
      searchBox.value = "";
      this.clearSearch(tabName);
      this.updateSearchUI(searchBox, "");
    });

    // Search input with enhanced features
    searchBox.addEventListener("input", (e) => {
      const value = e.target.value;
      this.handleSearch(tabName, value);
      this.updateSearchUI(searchBox, value);
    });

    // Column search setup
    if (columnSearchContainer) {
      this.setupColumnSearch(tabName, columnSearchContainer);
    }
  }

  updateSearchUI(searchInput, value) {
    const clearBtn =
      searchInput.parentElement.querySelector(".search-clear-btn");

    if (value.trim()) {
      clearBtn.style.opacity = "1";
      clearBtn.style.pointerEvents = "auto";
    } else {
      clearBtn.style.opacity = "0.3";
      clearBtn.style.pointerEvents = "none";
    }
  }

  setupColumnSearch(tabName, container) {
    const inputs = container.querySelectorAll(".column-search-input");

    inputs.forEach((input) => {
      input.addEventListener("input", () => {
        this.handleColumnSearch(tabName, container);
      });
    });

    // Listen for search event from clear buttons
    container.addEventListener("search", () => {
      this.handleColumnSearch(tabName, container);
    });
  }

  handleColumnSearch(tabName, container) {
    const inputs = container.querySelectorAll(".column-search-input");
    const searchCriteria = {};

    inputs.forEach((input) => {
      const columnIndex = parseInt(input.dataset.column);
      const value = input.value.trim();
      if (value) {
        searchCriteria[columnIndex] = value.toLowerCase();
      }
    });

    this.performColumnSearch(tabName, searchCriteria);
  }

  handleSearch(type, searchTerm) {
    // Clear previous timer
    if (this.searchTimers.has(type)) {
      clearTimeout(this.searchTimers.get(type));
    }

    // Set new timer for debounced search
    const timer = setTimeout(() => {
      this.performSearch(type, searchTerm);
    }, 300);

    this.searchTimers.set(type, timer);
  }

  performSearch(type, searchTerm) {
    const tables = document.querySelectorAll(`#${type}TableContainer table`);
    tables.forEach((table) => {
      const rows = table.querySelectorAll("tbody tr");
      let visibleCount = 0;

      rows.forEach((row) => {
        const text = row.textContent.toLowerCase();
        const matches = searchTerm
          .toLowerCase()
          .split(" ")
          .every((term) => text.includes(term));

        if (matches) {
          row.style.display = "";
          visibleCount++;
        } else {
          row.style.display = "none";
        }
      });

      this.updateTableInfo(table, visibleCount, rows.length);
    });
  }

  clearSearch(type) {
    const tables = document.querySelectorAll(`#${type}TableContainer table`);
    tables.forEach((table) => {
      const rows = table.querySelectorAll("tbody tr");
      rows.forEach((row) => {
        row.style.display = "";
      });

      // Hide table info
      const infoElement =
        table.parentElement.querySelector(".table-search-info");
      if (infoElement) {
        infoElement.style.display = "none";
      }
    });
  }

  // Reset search when switching tabs
  resetTabSearch(previousTab) {
    if (previousTab) {
      // Clear general search
      const searchBoxId =
        previousTab === "users"
          ? "userSearchBox"
          : previousTab === "fields"
          ? "fieldSearchBox"
          : previousTab === "data"
          ? "dataSearchBox"
          : null;

      if (searchBoxId) {
        const searchBox = document.getElementById(searchBoxId);
        if (searchBox) {
          searchBox.value = "";
          this.updateSearchUI(searchBox, "");
        }
        this.clearSearch(previousTab);
      }

      // Clear column search
      const columnSearchId =
        previousTab === "users"
          ? "userColumnSearch"
          : previousTab === "fields"
          ? "fieldColumnSearch"
          : previousTab === "data"
          ? "dataColumnSearch"
          : null;

      if (columnSearchId) {
        this.hideColumnSearch(columnSearchId);
      }
    }
  }

  initCustomSelects() {
    // Initialize all custom selects
    this.initCustomSelect(
      "fieldSelectContainer",
      "fieldSelectTrigger",
      "fieldSelectOptions",
      (value) => {
        this.loadFieldData(value);
      }
    );

    this.initCustomSelect(
      "userDataUserSelectContainer",
      "userDataUserSelectTrigger",
      "userDataUserSelectOptions",
      () => {
        this.loadUserData();
      }
    );

    this.initCustomSelect(
      "userDataFieldSelectContainer",
      "userDataFieldSelectTrigger",
      "userDataFieldSelectOptions",
      () => {
        this.loadUserData();
      }
    );

    this.initCustomSelect(
      "exportFieldSelectContainer",
      "exportFieldSelectTrigger",
      "exportFieldSelectOptions"
    );
  }

  initCustomSelect(containerId, triggerId, optionsId, onChange = null) {
    const container = document.getElementById(containerId);
    const trigger = document.getElementById(triggerId);
    const options = document.getElementById(optionsId);

    if (!container || !trigger || !options) return;

    // Store reference
    const selectData = {
      container,
      trigger,
      options,
      value: "",
      onChange,
    };

    this.customSelects.set(containerId, selectData);

    // Click trigger to show/hide options
    trigger.addEventListener("click", (e) => {
      e.stopPropagation();
      this.toggleCustomSelect(containerId);
    });

    // Click option to select
    options.addEventListener("click", (e) => {
      const li = e.target.closest("li");
      if (!li) return;

      const value = li.dataset.value;
      const text = li.textContent;

      this.setCustomSelectValue(containerId, value, text);
      this.hideCustomSelect(containerId);

      if (onChange) {
        onChange(value);
      }
    });

    // Close when clicking outside
    document.addEventListener("click", (e) => {
      if (!container.contains(e.target)) {
        this.hideCustomSelect(containerId);
      }
    });
  }

  toggleCustomSelect(containerId) {
    const selectData = this.customSelects.get(containerId);
    if (!selectData) return;

    const isActive = selectData.options.classList.contains("active");

    // Close all other selects
    this.customSelects.forEach((data, id) => {
      if (id !== containerId) {
        this.hideCustomSelect(id);
      }
    });

    if (isActive) {
      this.hideCustomSelect(containerId);
    } else {
      this.showCustomSelectOptions(containerId);
    }
  }

  showCustomSelectOptions(containerId) {
    const selectData = this.customSelects.get(containerId);
    if (!selectData) return;

    selectData.trigger.classList.add("active");
    selectData.options.classList.add("active");
  }

  hideCustomSelect(containerId) {
    const selectData = this.customSelects.get(containerId);
    if (!selectData) return;

    selectData.trigger.classList.remove("active");
    selectData.options.classList.remove("active");
  }

  setCustomSelectValue(containerId, value, text) {
    const selectData = this.customSelects.get(containerId);
    if (!selectData) return;

    selectData.value = value;
    selectData.trigger.querySelector("span").textContent = text;

    // Update selected option
    selectData.options.querySelectorAll("li").forEach((li) => {
      li.classList.remove("selected");
      if (li.dataset.value === value) {
        li.classList.add("selected");
      }
    });
  }

  getCustomSelectValue(containerId) {
    const selectData = this.customSelects.get(containerId);
    return selectData ? selectData.value : "";
  }

  populateCustomSelect(containerId, options) {
    const selectData = this.customSelects.get(containerId);
    if (!selectData) return;

    const optionsHtml = options
      .map((option) => `<li data-value="${option.value}">${option.text}</li>`)
      .join("");

    selectData.options.innerHTML = optionsHtml;
  }

  updateUI() {
    const user = authSystem.getCurrentUser();
    if (user) {
      document.getElementById("userInfo").textContent = `👋 ${user.name}`;
    }
  }

  switchTab(tabName) {
    // Reset search for previous tab
    this.resetTabSearch(this.currentTab);

    // Update active tab button
    document.querySelectorAll(".tab-btn").forEach((btn) => {
      btn.classList.remove("active");
    });
    document.querySelector(`[data-tab="${tabName}"]`).classList.add("active");

    // Update active tab content
    document.querySelectorAll(".tab-content").forEach((content) => {
      content.classList.remove("active");
    });
    document.getElementById(`tab-${tabName}`).classList.add("active");

    this.currentTab = tabName;

    // Load specific data for tab
    if (tabName === "data") {
      this.loadFieldOptions();
    } else if (tabName === "export") {
      this.loadExportOptions();
    } else if (tabName === "userdata") {
      this.loadUserDataOptions();
    }
  }

  getAssignedUserCount(fieldId, users) {
    return users.filter(
      (user) => user.assignedFields && user.assignedFields.includes(fieldId)
    ).length;
  }

  addHeaderClickHandlers(table, columnSearchId) {
    const headers = table.querySelectorAll("thead th");
    headers.forEach((header, index) => {
      const headerText = header.textContent.trim().toLowerCase();

      // Only add click handlers to searchable columns
      if (
        headerText.includes("tên") ||
        headerText.includes("email") ||
        headerText.includes("mô tả") ||
        headerText.includes("ngày") ||
        headerText.includes("dữ liệu") ||
        headerText.includes("thêm bởi") ||
        headerText.includes("tạo bởi")
      ) {
        header.classList.add("searchable");
        header.addEventListener("click", () => {
          this.showColumnSearch(columnSearchId);

          // Focus on relevant input based on header content
          setTimeout(() => {
            const container = document.getElementById(columnSearchId);
            const inputs = container.querySelectorAll(".column-search-input");

            // Map header text to appropriate input
            let targetInput = null;
            if (headerText.includes("tên")) {
              targetInput = inputs[0]; // First input (name)
            } else if (headerText.includes("email")) {
              targetInput = inputs[1]; // Second input (email)
            } else if (headerText.includes("mô tả")) {
              targetInput = inputs[1]; // Description (for fields)
            } else if (
              headerText.includes("dữ liệu") ||
              headerText.includes("thêm bởi")
            ) {
              targetInput = inputs[1]; // Data or added by
            } else if (headerText.includes("ngày")) {
              // Find the date input (varies by tab)
              targetInput = Array.from(inputs).find((input) =>
                input.placeholder.includes("ngày")
              );
            } else if (headerText.includes("tạo bởi")) {
              // Find the created by input
              targetInput = Array.from(inputs).find((input) =>
                input.placeholder.includes("người tạo")
              );
            }

            if (targetInput) {
              targetInput.focus();
            }
          }, 100);
        });
      }
    });
  }

  // Placeholder methods that will be fully implemented
  editUser(userId) {
    console.log("Edit user:", userId);
    Utils.showInfo("Chức năng sửa người dùng đang được phát triển...");
  }

  showAddUserModal() {
    const modal = Utils.createModal({
      title: "Thêm Người Dùng Mới",
      content: `
            <form id="createUserForm" autocomplete="off">
                <div class="form-group">
                    <label for="userUsername">Tên đăng nhập</label>
                    <input type="text" id="userUsername" name="new-username" class="form-input" placeholder="Nhập tên đăng nhập"  autocomplete="new-password" data-lpignore="true" data-form-type="other">
                    <div class="field-error" id="usernameError"></div>
                </div>
                
                <div class="form-group">
                    <label for="userEmail">Email (tùy chọn)</label>
                    <input type="text" id="userEmail" name="new-email" class="form-input" placeholder="Nhập email hoặc để trống" autocomplete="new-password" data-lpignore="true" data-form-type="other">
                    <div class="field-error" id="emailError"></div>
                </div>
                
                <div class="form-group">
                    <label for="userPassword">Mật khẩu (để trống sẽ dùng 123456)</label>
                    <div class="password-input-container">
                        <input type="password" id="userPassword" name="new-password" class="form-input password-field" placeholder="Nhập mật khẩu hoặc để trống" autocomplete="new-password" data-lpignore="true" data-form-type="other">
                        <button type="button" class="password-toggle" onclick="togglePassword('userPassword', this)" onmouseenter="hoverTogglePassword('userPassword', this, true)" onmouseleave="hoverTogglePassword('userPassword', this, false)">
                            <svg class="password-icon hide-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M4 4L9.87868 9.87868M20 20L14.1213 14.1213M9.87868 9.87868C9.33579 10.4216 9 11.1716 9 12C9 13.6569 10.3431 15 12 15C12.8284 15 13.5784 14.6642 14.1213 14.1213M9.87868 9.87868L14.1213 14.1213M6.76821 6.76821C4.72843 8.09899 2.96378 10.026 2 11.9998C3.74646 15.5764 8.12201 19 11.9998 19C13.7376 19 15.5753 18.3124 17.2317 17.2317M9.76138 5.34717C10.5114 5.12316 11.2649 5 12.0005 5C15.8782 5 20.2531 8.42398 22 12.0002C21.448 13.1302 20.6336 14.2449 19.6554 15.2412" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                            </svg>
                            <svg class="password-icon show-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="display: none;">
                                <path fill-rule="evenodd" d="M12,4 C14.7275481,4 17.3356792,5.4306247 19.76629,7.78114976 C20.5955095,8.58304746 21.3456935,9.43915664 22.0060909,10.2956239 C22.4045936,10.8124408 22.687526,11.2189945 22.8424353,11.4612025 L23.1870348,12 L22.8424353,12.5387975 C22.687526,12.7810055 22.4045936,13.1875592 22.0060909,13.7043761 C21.3456935,14.5608434 20.5955095,15.4169525 19.76629,16.2188502 C17.3356792,18.5693753 14.7275481,20 12,20 C9.27245185,20 6.66432084,18.5693753 4.23371003,16.2188502 C3.40449054,15.4169525 2.65430652,14.5608434 1.99390911,13.7043761 C1.59540638,13.1875592 1.31247398,12.7810055 1.15756471,12.5387975 L0.812965202,12 L1.15756471,11.4612025 C1.31247398,11.2189945 1.59540638,10.8124408 1.99390911,10.2956239 C2.65430652,9.43915664 3.40449054,8.58304746 4.23371003,7.78114976 C6.66432084,5.4306247 9.27245185,4 12,4 Z M20.4222529,11.5168761 C19.8176112,10.7327184 19.1301624,9.94820254 18.37596,9.21885024 C16.2825083,7.1943753 14.1050769,6 12,6 C9.89492315,6 7.71749166,7.1943753 5.62403997,9.21885024 C4.86983759,9.94820254 4.18238879,10.7327184 3.57774714,11.5168761 C3.44715924,11.6862352 3.32648802,11.8478224 3.21616526,12 C3.32648802,12.1521776 3.44715924,12.3137648 3.57774714,12.4831239 C4.18238879,13.2672816 4.86983759,14.0517975 5.62403997,14.7811498 C7.71749166,16.8056247 9.89492315,18 12,18 C14.1050769,18 16.2825083,16.8056247 18.37596,14.7811498 C19.1301624,14.0517975 19.8176112,13.2672816 20.4222529,12.4831239 C20.5528408,12.3137648 20.673512,12.1521776 20.7838347,12 C20.673512,11.8478224 20.5528408,11.6862352 20.4222529,11.5168761 Z M12,16 C9.790861,16 8,14.209139 8,12 C8,9.790861 9.790861,8 12,8 C14.209139,8 16,9.790861 16,12 C16,14.209139 14.209139,16 12,16 Z M12,14 C13.1045695,14 14,13.1045695 14,12 C14,10.8954305 13.1045695,10 12,10 C10.8954305,10 10,10.8954305 10,12 C10,13.1045695 10.8954305,14 12,14 Z" fill="currentColor"/>
                            </svg>
                        </button>
                    </div>
                    <div class="field-error" id="passwordError"></div>
                </div>
                
                <div class="btn-group">
                    <button type="button" class="btn btn-secondary" onclick="this.closest('.modal').style.display='none'; document.body.removeChild(this.closest('.modal'));">Hủy</button>
                    <button type="submit" id="createUserBtn" class="btn btn-primary">👤 Tạo Người dùng</button>
                </div>
            </form>
        `,
      closable: true,
    });

    // Add form submission handler
    document
      .getElementById("createUserForm")
      .addEventListener("submit", async (e) => {
        e.preventDefault();
        await this.handleAddUser(modal);
      });
  }

  async handleAddUser(modal) {
    // Clear previous errors
    this.clearFieldErrors();

    const username = document.getElementById("userUsername").value.trim();
    const email = document.getElementById("userEmail").value.trim() || null;
    const password =
      document.getElementById("userPassword").value.trim() || "123456";

    let hasErrors = false;

    // Validate username
    if (!username) {
      this.showFieldError("usernameError", "Vui lòng nhập tên đăng nhập!");
      hasErrors = true;
    } else if (username.length < 3) {
      this.showFieldError(
        "usernameError",
        "Tên đăng nhập phải có ít nhất 3 ký tự!"
      );
      hasErrors = true;
    }

    // Validate password if provided
    if (password && password.length < 6 && password !== "123456") {
      this.showFieldError("passwordError", "Mật khẩu phải có ít nhất 6 ký tự!");
      hasErrors = true;
    }

    if (hasErrors) return;

    // Add loading state to button
    const createBtn = document.getElementById("createUserBtn");
    const originalText = createBtn.innerHTML;
    createBtn.innerHTML = "⏳ Đang tạo...";
    createBtn.disabled = true;

    // Name = username for display
    const name = username;

    try {
      // Fast user creation
      const result = await authSystem.createUser({
        name,
        email,
        username,
        password,
      });

      if (result.success) {
        // Immediate success feedback
        createBtn.innerHTML = "✅ Thành công!";
        Utils.showSuccess("Thêm người dùng thành công!");

        // Close modal immediately for better UX
        modal.style.display = "none";
        document.body.removeChild(modal);

        // Background refresh (non-blocking)
        setTimeout(async () => {
          try {
            await Promise.all([this.loadUsers(), this.loadStatistics()]);
          } catch (error) {
            console.error("Background refresh error:", error);
          }
        }, 100);
      } else {
        // Reset button on error
        createBtn.innerHTML = originalText;
        createBtn.disabled = false;

        // Check for specific field errors
        if (
          result.message.includes("Tên người dùng đã tồn tại") ||
          result.message.includes("username")
        ) {
          this.showFieldError("usernameError", result.message);
        } else if (
          result.message.includes("Email đã tồn tại") ||
          result.message.includes("email")
        ) {
          this.showFieldError("emailError", result.message);
        } else {
          // System error - show modal
          this.showSystemErrorModal(result.message);
        }
      }
    } catch (error) {
      // Reset button on error
      createBtn.innerHTML = originalText;
      createBtn.disabled = false;

      console.error("Create user error:", error);
      this.showSystemErrorModal("Có lỗi hệ thống xảy ra khi tạo người dùng!");
    }
  }

  showFieldError(fieldId, message) {
    const errorElement = document.getElementById(fieldId);
    if (errorElement) {
      errorElement.textContent = message;
      errorElement.style.display = "block";
    }
  }

  clearFieldErrors() {
    const errorElements = document.querySelectorAll(".field-error");
    errorElements.forEach((element) => {
      element.textContent = "";
      element.style.display = "none";
    });
  }

  showSystemErrorModal(message) {
    const errorModal = Utils.createModal({
      title: "❌ Lỗi Hệ Thống",
      content: `
            <div style="text-align: center; padding: 20px;">
                <p style="color: #d32f2f; font-size: 16px; margin-bottom: 20px;">${message}</p>
                <button class="btn btn-secondary" onclick="this.closest('.modal').style.display='none'; document.body.removeChild(this.closest('.modal'));">Đóng</button>
            </div>
        `,
      size: "small",
      closable: true,
      allowOverlayClose: true,
    });
  }

  showAddFieldModal() {
    const modal = Utils.createModal({
      title: "Thêm Trường Dữ Liệu Mới",
      content: `
            <form id="addFieldForm">
                <div class="form-group">
                    <label>Tên trường</label>
                    <input type="text" id="fieldName" class="form-input" required autocomplete="off">
                </div>
                <div class="form-group">
                    <label>Mô tả</label>
                    <textarea id="fieldDescription" class="form-input" rows="3"></textarea>
                </div>
                <div class="form-group">
                    <label style="display: flex; align-items: center; gap: 10px;">
                        <input type="checkbox" id="assignToAll" checked> 
                        Gán cho tất cả người dùng hiện tại
                    </label>
                </div>
                <div class="btn-group">
                    <button type="button" class="btn btn-secondary" onclick="this.closest('.modal').style.display='none'; document.body.removeChild(this.closest('.modal'));">Hủy</button>
                    <button type="submit" class="btn btn-primary">Thêm trường</button>
                </div>
            </form>
        `,
      size: "medium",
      closable: true,
    });

    // Add form submission handler
    document
      .getElementById("addFieldForm")
      .addEventListener("submit", async (e) => {
        e.preventDefault();
        await this.handleAddField(modal);
      });
  }

  async handleAddField(modal) {
    const name = document.getElementById("fieldName").value.trim();
    const description = document
      .getElementById("fieldDescription")
      .value.trim();
    const assignToAll = document.getElementById("assignToAll").checked;

    if (!name) {
      Utils.showError("Vui lòng nhập tên trường!");
      return;
    }

    // Add loading state to submit button
    const submitBtn = modal.querySelector('button[type="submit"]');
    const originalText = submitBtn.innerHTML;
    submitBtn.innerHTML = "⏳ Đang tạo...";
    submitBtn.disabled = true;

    try {
      // Fast field creation
      const result = await authSystem.createField({ name, description });

      if (result.success) {
        // Immediate success feedback
        submitBtn.innerHTML = "✅ Thành công!";
        Utils.showSuccess("Thêm trường thành công!");

        // Close modal immediately
        modal.style.display = "none";
        document.body.removeChild(modal);

        // Background assignment and refresh
        setTimeout(async () => {
          try {
            // If assign to all is checked, assign this field to all users
            if (assignToAll) {
              await this.assignFieldToAllUsers(result.field.id);
            }

            // Background refresh
            await Promise.all([this.loadFields(), this.loadStatistics()]);
          } catch (error) {
            console.error("Background field operations error:", error);
          }
        }, 100);
      } else {
        // Reset button on error
        submitBtn.innerHTML = originalText;
        submitBtn.disabled = false;
        Utils.showError(result.message);
      }
    } catch (error) {
      // Reset button on error
      submitBtn.innerHTML = originalText;
      submitBtn.disabled = false;
      Utils.showError("Có lỗi xảy ra khi tạo trường!");
    }
  }

  async assignFieldToAllUsers(fieldId) {
    try {
      const users = await authSystem.getUsers();

      for (const user of users) {
        const currentFields = user.assignedFields || [];
        if (!currentFields.includes(fieldId)) {
          const updatedFields = [...currentFields, fieldId];
          await authSystem.updateUser(user.id, {
            assignedFields: updatedFields,
          });
        }
      }
    } catch (error) {
      console.error("Error assigning field to all users:", error);
      Utils.showWarning(
        "Trường đã được tạo nhưng có lỗi khi gán cho tất cả người dùng"
      );
    }
  }

  async showFieldAssignmentModal(fieldId) {
    const fields = await authSystem.getAllFieldsForAdmin();
    const users = await authSystem.getUsers();
    const field = fields.find((f) => f.id === fieldId);

    if (!field) {
      Utils.showError("Không tìm thấy trường!");
      return;
    }

    let assignedUserIds = users
      .filter(
        (user) => user.assignedFields && user.assignedFields.includes(fieldId)
      )
      .map((user) => user.id);

    let unassignedUserIds = users
      .filter(
        (user) => !user.assignedFields || !user.assignedFields.includes(fieldId)
      )
      .map((user) => user.id);

    const modal = Utils.createModal({
      title: `Quản lý gán trường: ${field.name}`,
      content: `
            <div>
                <input type="text" id="userSearchInput" class="search-input" placeholder="🔍 Tìm kiếm người dùng..." autocomplete="off">
                
                <div class="field-assignment-container">
                    <div class="field-assignment-column">
                        <div class="field-assignment-header">
                            <h4 style="margin: 0; color: #ff9800;">Chưa được gán (<span id="unassignedCount">${
                              unassignedUserIds.length
                            }</span>)</h4>
                            <button class="btn btn-success" id="assignAllBtn" style="padding: 6px 12px; font-size: 12px;">
                                ➕ Gán tất cả
                            </button>
                        </div>
                        <div id="unassignedUsersList" class="field-assignment-list unassigned">
                            ${this.renderUserList(
                              users,
                              unassignedUserIds,
                              "unassigned",
                              fieldId
                            )}
                        </div>
                    </div>
                    
                    <div class="field-assignment-column">
                        <div class="field-assignment-header">
                            <h4 style="margin: 0; color: #4caf50;">Đã được gán (<span id="assignedCount">${
                              assignedUserIds.length
                            }</span>)</h4>
                            <button class="btn btn-danger" id="removeAllBtn" style="padding: 6px 12px; font-size: 12px;">
                                ➖ Bỏ gán tất cả
                            </button>
                        </div>
                        <div id="assignedUsersList" class="field-assignment-list assigned">
                            ${this.renderUserList(
                              users,
                              assignedUserIds,
                              "assigned",
                              fieldId
                            )}
                        </div>
                    </div>
                </div>
                
                <div class="modal-actions">
                    <button class="btn btn-secondary" id="closeModalBtn">Đóng</button>
                    <button class="btn btn-primary" id="saveAssignmentsBtn">💾 Lưu thay đổi</button>
                </div>
            </div>
        `,
      size: "large",
      closable: true,
    });

    // Store current state
    modal.fieldId = fieldId;
    modal.assignedUserIds = new Set(assignedUserIds);
    modal.unassignedUserIds = new Set(unassignedUserIds);
    modal.users = users;

    // Add search functionality
    document
      .getElementById("userSearchInput")
      .addEventListener("input", (e) => {
        this.filterUsersInModal(e.target.value, modal);
      });

    // Assign all button
    document.getElementById("assignAllBtn").addEventListener("click", () => {
      this.assignAllUsers(modal);
    });

    // Remove all button
    document.getElementById("removeAllBtn").addEventListener("click", () => {
      this.removeAllUsers(modal);
    });

    // Close button
    document.getElementById("closeModalBtn").addEventListener("click", () => {
      modal.style.display = "none";
      document.body.removeChild(modal);
    });

    // Save button
    document
      .getElementById("saveAssignmentsBtn")
      .addEventListener("click", async () => {
        await this.saveFieldAssignments(modal);
      });
  }

  renderUserList(users, userIds, type, fieldId) {
    return Array.from(userIds)
      .map((userId) => {
        const user = users.find((u) => u.id === userId);
        if (!user) return "";

        return `
            <div class="user-item" data-user-id="${user.id}" data-user-name="${
          user.name
        }">
                <span>${user.name} (${user.email})</span>
                <button class="btn ${
                  type === "assigned" ? "btn-danger" : "btn-success"
                }" 
                        onclick="adminPanel.${
                          type === "assigned"
                            ? "removeUserFromField"
                            : "addUserToField"
                        }('${user.id}')" 
                        style="padding: 2px 8px; margin-left: 10px;">
                    ${type === "assigned" ? "×" : "+"}
                </button>
            </div>
        `;
      })
      .join("");
  }

  addUserToField(userId) {
    const modal = document.querySelector('.modal[style*="flex"]');
    if (!modal) return;

    // Move user from unassigned to assigned
    modal.unassignedUserIds.delete(userId);
    modal.assignedUserIds.add(userId);

    // Update the UI
    this.updateModalUserLists(modal);
  }

  removeUserFromField(userId) {
    const modal = document.querySelector('.modal[style*="flex"]');
    if (!modal) return;

    // Move user from assigned to unassigned
    modal.assignedUserIds.delete(userId);
    modal.unassignedUserIds.add(userId);

    // Update the UI
    this.updateModalUserLists(modal);
  }

  assignAllUsers(modal) {
    // Move all unassigned users to assigned
    modal.unassignedUserIds.forEach((userId) => {
      modal.assignedUserIds.add(userId);
    });
    modal.unassignedUserIds.clear();

    this.updateModalUserLists(modal);
  }

  removeAllUsers(modal) {
    // Move all assigned users to unassigned
    modal.assignedUserIds.forEach((userId) => {
      modal.unassignedUserIds.add(userId);
    });
    modal.assignedUserIds.clear();

    this.updateModalUserLists(modal);
  }

  updateModalUserLists(modal) {
    const unassignedContainer = document.getElementById("unassignedUsersList");
    const assignedContainer = document.getElementById("assignedUsersList");
    const unassignedCount = document.getElementById("unassignedCount");
    const assignedCount = document.getElementById("assignedCount");

    unassignedContainer.innerHTML = this.renderUserList(
      modal.users,
      modal.unassignedUserIds,
      "unassigned",
      modal.fieldId
    );
    assignedContainer.innerHTML = this.renderUserList(
      modal.users,
      modal.assignedUserIds,
      "assigned",
      modal.fieldId
    );

    unassignedCount.textContent = modal.unassignedUserIds.size;
    assignedCount.textContent = modal.assignedUserIds.size;
  }

  filterUsersInModal(searchTerm, modal) {
    const userItems = document.querySelectorAll(".user-item");
    userItems.forEach((item) => {
      const userName = item.dataset.userName.toLowerCase();
      const userEmail = item.querySelector("span").textContent.toLowerCase();
      if (
        userName.includes(searchTerm.toLowerCase()) ||
        userEmail.includes(searchTerm.toLowerCase())
      ) {
        item.style.display = "block";
      } else {
        item.style.display = "none";
      }
    });
  }

  async saveFieldAssignments(modal) {
    try {
      Utils.showInfo("Đang lưu thay đổi...");

      // Update each user's assigned fields
      const updatePromises = modal.users.map(async (user) => {
        const currentFields = user.assignedFields || [];
        let newFields = [...currentFields];

        if (modal.assignedUserIds.has(user.id)) {
          // User should have this field assigned
          if (!newFields.includes(modal.fieldId)) {
            newFields.push(modal.fieldId);
          }
        } else {
          // User should not have this field assigned
          newFields = newFields.filter((fieldId) => fieldId !== modal.fieldId);
        }

        // Only update if there's a change
        if (
          JSON.stringify(currentFields.sort()) !==
          JSON.stringify(newFields.sort())
        ) {
          return authSystem.updateUser(user.id, {
            assignedFields: newFields,
          });
        }
        return { success: true };
      });

      const results = await Promise.all(updatePromises);
      const failures = results.filter((result) => !result.success);

      if (failures.length === 0) {
        Utils.showSuccess("Lưu gán trường thành công!");

        // Close modal
        modal.style.display = "none";
        document.body.removeChild(modal);

        // Refresh the fields table and users table
        await Promise.all([this.loadFields(), this.loadUsers()]);
      } else {
        Utils.showError(
          `Có ${failures.length} lỗi khi cập nhật. Vui lòng thử lại!`
        );
      }
    } catch (error) {
      console.error("Save field assignments error:", error);
      Utils.showError("Có lỗi xảy ra khi lưu gán trường!");
    }
  }

  async editUser(userId) {
    // Get user data first
    const users = await authSystem.getUsers();
    const user = users.find((u) => u.id === userId);

    if (!user) {
      Utils.showError("Không tìm thấy người dùng!");
      return;
    }

    const modal = Utils.createModal({
      title: "Chỉnh sửa Người Dùng",
      content: `
            <form id="editUserForm">
                <div class="form-group">
                    <label for="editUserUsername">Tên đăng nhập</label>
                    <input type="text" id="editUserUsername" class="form-input" value="${
                      user.username || user.email
                    }" required autocomplete="off">
                </div>
                
                <div class="form-group">
                    <label for="editUserEmail">Email</label>
                    <input type="text" id="editUserEmail" class="form-input" value="${
                      user.email || ""
                    }" placeholder="Email (tùy chọn)" autocomplete="off">
                </div>
                
                <div class="form-group">
                    <label for="editUserPassword">Mật khẩu mới (để trống nếu không đổi)</label>
                    <div class="password-input-container">
                        <input type="password" id="editUserPassword" class="form-input password-field" placeholder="Nhập mật khẩu mới" autocomplete="off">
                        <button type="button" class="password-toggle" onclick="togglePassword('editUserPassword', this)" onmouseenter="hoverTogglePassword('editUserPassword', this, true)" onmouseleave="hoverTogglePassword('editUserPassword', this, false)">
                            <svg class="password-icon hide-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M4 4L9.87868 9.87868M20 20L14.1213 14.1213M9.87868 9.87868C9.33579 10.4216 9 11.1716 9 12C9 13.6569 10.3431 15 12 15C12.8284 15 13.5784 14.6642 14.1213 14.1213M9.87868 9.87868L14.1213 14.1213M6.76821 6.76821C4.72843 8.09899 2.96378 10.026 2 11.9998C3.74646 15.5764 8.12201 19 11.9998 19C13.7376 19 15.5753 18.3124 17.2317 17.2317M9.76138 5.34717C10.5114 5.12316 11.2649 5 12.0005 5C15.8782 5 20.2531 8.42398 22 12.0002C21.448 13.1302 20.6336 14.2449 19.6554 15.2412" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                            </svg>
                            <svg class="password-icon show-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="display: none;">
                                <path fill-rule="evenodd" d="M12,4 C14.7275481,4 17.3356792,5.4306247 19.76629,7.78114976 C20.5955095,8.58304746 21.3456935,9.43915664 22.0060909,10.2956239 C22.4045936,10.8124408 22.687526,11.2189945 22.8424353,11.4612025 L23.1870348,12 L22.8424353,12.5387975 C22.687526,12.7810055 22.4045936,13.1875592 22.0060909,13.7043761 C21.3456935,14.5608434 20.5955095,15.4169525 19.76629,16.2188502 C17.3356792,18.5693753 14.7275481,20 12,20 C9.27245185,20 6.66432084,18.5693753 4.23371003,16.2188502 C3.40449054,15.4169525 2.65430652,14.5608434 1.99390911,13.7043761 C1.59540638,13.1875592 1.31247398,12.7810055 1.15756471,12.5387975 L0.812965202,12 L1.15756471,11.4612025 C1.31247398,11.2189945 1.59540638,10.8124408 1.99390911,10.2956239 C2.65430652,9.43915664 3.40449054,8.58304746 4.23371003,7.78114976 C6.66432084,5.4306247 9.27245185,4 12,4 Z M20.4222529,11.5168761 C19.8176112,10.7327184 19.1301624,9.94820254 18.37596,9.21885024 C16.2825083,7.1943753 14.1050769,6 12,6 C9.89492315,6 7.71749166,7.1943753 5.62403997,9.21885024 C4.86983759,9.94820254 4.18238879,10.7327184 3.57774714,11.5168761 C3.44715924,11.6862352 3.32648802,11.8478224 3.21616526,12 C3.32648802,12.1521776 3.44715924,12.3137648 3.57774714,12.4831239 C4.18238879,13.2672816 4.86983759,14.0517975 5.62403997,14.7811498 C7.71749166,16.8056247 9.89492315,18 12,18 C14.1050769,18 16.2825083,16.8056247 18.37596,14.7811498 C19.1301624,14.0517975 19.8176112,13.2672816 20.4222529,12.4831239 C20.5528408,12.3137648 20.673512,12.1521776 20.7838347,12 C20.673512,11.8478224 20.5528408,11.6862352 20.4222529,11.5168761 Z M12,16 C9.790861,16 8,14.209139 8,12 C8,9.790861 9.790861,8 12,8 C14.209139,8 16,9.790861 16,12 C16,14.209139 14.209139,16 12,16 Z M12,14 C13.1045695,14 14,13.1045695 14,12 C14,10.8954305 13.1045695,10 12,10 C10.8954305,10 10,10.8954305 10,12 C10,13.1045695 10.8954305,14 12,14 Z" fill="currentColor"/>
                            </svg>
                        </button>
                    </div>
                </div>
                
                <div class="btn-group">
                    <button type="button" class="btn btn-secondary" onclick="this.closest('.modal').style.display='none'; document.body.removeChild(this.closest('.modal'));">Hủy</button>
                    <button type="submit" class="btn btn-primary">Cập nhật</button>
                </div>
            </form>
        `,
      size: "medium",
      closable: true,
    });

    // Add form submission handler
    document
      .getElementById("editUserForm")
      .addEventListener("submit", async (e) => {
        e.preventDefault();
        await this.handleEditUser(userId, modal);
      });
  }

  async handleEditUser(userId, modal) {
    const username = document.getElementById("editUserUsername").value.trim();
    const email = document.getElementById("editUserEmail").value.trim() || null;
    const password = document.getElementById("editUserPassword").value.trim();

    if (!username) {
      Utils.showError("Vui lòng nhập tên đăng nhập!");
      return;
    }

    const updateData = {
      name: username, // Name = username
      username: username,
      email: email,
    };

    // Only update password if provided
    if (password) {
      updateData.password = password;
    }

    const result = await authSystem.updateUser(userId, updateData);

    if (result.success) {
      Utils.showSuccess("Cập nhật người dùng thành công!");
      modal.style.display = "none";
      document.body.removeChild(modal);
      await this.loadUsers();
    } else {
      Utils.showError(result.message);
    }
  }

  async loadFieldOptions() {
    const fields = await authSystem.getAllFieldsForAdmin();

    const fieldOptions = [
      { value: "", text: "Chọn trường để xem" },
      ...fields.map((field) => ({ value: field.id, text: field.name })),
    ];

    const exportFieldOptions = [
      { value: "", text: "Chọn trường" },
      ...fields.map((field) => ({ value: field.id, text: field.name })),
    ];

    this.populateCustomSelect("fieldSelectContainer", fieldOptions);
    this.populateCustomSelect("exportFieldSelectContainer", exportFieldOptions);
  }

  async loadExportOptions() {
    await this.loadFieldOptions();
  }

  async loadUserDataOptions() {
    // Load users for filter
    const users = await authSystem.getUsers();
    const userOptions = [
      { value: "", text: "Tất cả người dùng" },
      ...users.map((user) => ({
        value: user.email,
        text: `${user.name} (${user.email})`,
      })),
    ];

    this.populateCustomSelect("userDataUserSelectContainer", userOptions);

    // Load fields for filter
    const fields = await authSystem.getAllFieldsForAdmin();
    const fieldOptions = [
      { value: "", text: "Tất cả trường" },
      ...fields.map((field) => ({
        value: field.id,
        text: field.name,
      })),
    ];

    this.populateCustomSelect("userDataFieldSelectContainer", fieldOptions);

    // Load initial data
    await this.loadUserData();
  }

  async loadUserData() {
    const userFilter = this.getCustomSelectValue("userDataUserSelectContainer");
    const fieldFilter = this.getCustomSelectValue(
      "userDataFieldSelectContainer"
    );

    const fields = await authSystem.getAllFieldsForAdmin();
    const users = await authSystem.getUsers();

    let allUserData = [];
    let todayData = 0;
    let contributingUsers = new Set();
    let totalContributors = new Set(); // New: track all contributors ever
    const today = new Date().toDateString();

    // Collect all user-submitted data
    fields.forEach((field) => {
      if (fieldFilter && field.id !== fieldFilter) return;

      (field.data || []).forEach((item) => {
        // Skip admin-added data
        if (
          item.addedBy === "letoan242" ||
          item.addedBy === "trinhhanh261293@gmail.com"
        )
          return;

        // Add to total contributors regardless of current filter
        totalContributors.add(item.addedBy);

        if (userFilter && item.addedBy !== userFilter) return;

        // Find user info
        const user = users.find((u) => u.email === item.addedBy);

        allUserData.push({
          ...item,
          fieldName: field.name,
          fieldId: field.id,
          userName: user ? user.username || user.name : "Unknown User",
        });

        contributingUsers.add(item.addedBy);

        if (new Date(item.addedAt).toDateString() === today) {
          todayData++;
        }
      });
    });

    // Sort by date (newest first)
    allUserData.sort((a, b) => new Date(b.addedAt) - new Date(a.addedAt));

    // Update statistics
    Utils.animateNumber(
      document.getElementById("userDataTotal"),
      0,
      allUserData.length
    );
    Utils.animateNumber(document.getElementById("userDataToday"), 0, todayData);
    Utils.animateNumber(
      document.getElementById("userDataUsers"),
      0,
      contributingUsers.size
    );
    Utils.animateNumber(
      document.getElementById("userDataContributors"),
      0,
      totalContributors.size
    );

    // Display table
    const container = document.getElementById("userDataTableContainer");

    if (allUserData.length === 0) {
      container.innerHTML =
        '<p style="text-align: center; color: #666; padding: 40px;">Không có dữ liệu nào.</p>';
      return;
    }

    const columns = [
      { key: "userName", title: "Người dùng" },
      { key: "fieldName", title: "Trường" },
      { key: "value", title: "Dữ liệu" },
      { key: "addedAt", title: "Ngày thêm", type: "date" },
    ];

    const options = {
      actions: (data) => `
        <div class="action-buttons">
          <button class="btn btn-danger" onclick="adminPanel.removeUserData('${data.fieldId}', '${data.id}')" title="Xóa">🗑️</button>
        </div>
      `,
      pagination: true,
      itemsPerPage: 10,
    };

    const table = Utils.createTable(allUserData, columns, options);
    container.innerHTML = "<h3>Dữ liệu được thêm bởi người dùng:</h3>";
    container.appendChild(table);
  }

  async removeUserData(fieldId, dataId) {
    const confirmed = await Utils.confirmDialog(
      "Bạn có chắc chắn muốn xóa dữ liệu này?",
      "small"
    );
    if (!confirmed) return;

    const result = await authSystem.removeDataFromField(fieldId, dataId);
    if (result.success) {
      Utils.showSuccess("Xóa dữ liệu thành công!");
      await this.loadUserData();
      await this.loadStatistics();
    } else {
      Utils.showError(result.message);
    }
  }

  async loadFieldData(fieldId) {
    if (!fieldId) {
      document.getElementById("dataTableContainer").innerHTML = "";
      return;
    }

    const fields = await authSystem.getAllFieldsForAdmin();
    const users = await authSystem.getUsers();
    const field = fields.find((f) => f.id === fieldId);

    if (!field) return;

    const container = document.getElementById("dataTableContainer");

    // Map data with usernames
    const dataWithUsernames = (field.data || [])
      .map((item) => {
        const user = users.find((u) => u.email === item.addedBy);
        return {
          ...item,
          addedByUsername: user ? user.username || user.name : item.addedBy,
        };
      })
      .sort((a, b) => new Date(b.addedAt) - new Date(a.addedAt));

    const columns = [
      { key: "value", title: "Dữ liệu", searchable: true },
      { key: "addedByUsername", title: "Thêm bởi", searchable: true },
      { key: "addedAt", title: "Ngày thêm", type: "date", searchable: true },
    ];

    const options = {
      actions: (data) => `
        <div class="action-buttons">
          <button class="btn btn-danger" onclick="adminPanel.deleteData('${fieldId}', '${data.id}')" title="Xóa">🗑️</button>
        </div>
      `,
      pagination: true,
      itemsPerPage: 10,
      onHeaderClick: (column, index) => {
        if (column.searchable) {
          this.showColumnSearch("dataColumnSearch");
        }
      },
    };

    const table = Utils.createTable(dataWithUsernames, columns, options);
    container.innerHTML = `<h3>Dữ liệu trong trường: ${field.name}</h3>`;
    container.appendChild(table);

    // Add click handlers to searchable headers
    this.addHeaderClickHandlers(table, "dataColumnSearch");
  }

  async deleteData(fieldId, dataId) {
    const confirmed = await Utils.confirmDialog(
      "Bạn có chắc chắn muốn xóa dữ liệu này?",
      "small"
    );
    if (!confirmed) return;

    const result = await authSystem.removeDataFromField(fieldId, dataId);
    if (result.success) {
      Utils.showSuccess("Xóa dữ liệu thành công!");
      await this.loadFieldData(fieldId);
      await this.loadStatistics();
    } else {
      Utils.showError(result.message);
    }
  }

  async editField(fieldId) {
    // Get field data first
    const fields = await authSystem.getAllFieldsForAdmin();
    const users = await authSystem.getUsers();
    const field = fields.find((f) => f.id === fieldId);

    if (!field) {
      Utils.showError("Không tìm thấy trường!");
      return;
    }

    // Get assigned users
    const assignedUsers = users.filter(
      (user) => user.assignedFields && user.assignedFields.includes(fieldId)
    );

    const modal = Utils.createModal({
      title: "Chỉnh sửa Trường Dữ Liệu",
      content: `
            <form id="editFieldForm">
                <div class="form-group">
                    <label>Tên trường</label>
                    <input type="text" id="editFieldName" class="form-input" value="${
                      field.name
                    }" required autocomplete="off">
                </div>
                <div class="form-group">
                    <label>Mô tả</label>
                    <textarea id="editFieldDescription" class="form-input" rows="3">${
                      field.description || ""
                    }</textarea>
                </div>
                <div class="form-group">
                    <label>Người dùng được gán (${assignedUsers.length})</label>
                    <button type="button" class="btn btn-secondary" onclick="adminPanel.showFieldAssignmentModal('${fieldId}')" style="width: 100%; margin-top: 5px;">
                        Quản lý gán người dùng
                    </button>
                    <small style="color: #666;">Hiện tại: ${
                      assignedUsers.map((u) => u.name).join(", ") ||
                      "Chưa gán ai"
                    }</small>
                </div>
                <div class="btn-group">
                    <button type="button" class="btn btn-secondary" onclick="this.closest('.modal').style.display='none'; document.body.removeChild(this.closest('.modal'));">Hủy</button>
                    <button type="submit" class="btn btn-primary">Cập nhật</button>
                </div>
            </form>
        `,
      size: "medium",
      closable: true,
    });

    // Add form submission handler
    document
      .getElementById("editFieldForm")
      .addEventListener("submit", async (e) => {
        e.preventDefault();
        await this.handleEditField(fieldId, modal);
      });
  }

  async handleEditField(fieldId, modal) {
    const name = document.getElementById("editFieldName").value.trim();
    const description = document
      .getElementById("editFieldDescription")
      .value.trim();

    if (!name) {
      Utils.showError("Vui lòng nhập tên trường!");
      return;
    }

    const result = await authSystem.updateField(fieldId, { name, description });

    if (result.success) {
      Utils.showSuccess("Cập nhật trường thành công!");
      modal.style.display = "none";
      document.body.removeChild(modal);
      await this.loadFields();
    } else {
      Utils.showError(result.message);
    }
  }

  async deleteField(fieldId) {
    const confirmed = await Utils.confirmDialog(
      "Bạn có chắc chắn muốn xóa trường này? Tất cả dữ liệu trong trường sẽ bị mất!",
      "small"
    );
    if (!confirmed) return;

    const result = await authSystem.deleteField(fieldId);
    if (result.success) {
      Utils.showSuccess("Xóa trường thành công!");
      await this.loadFields();
      await this.loadStatistics();
    } else {
      Utils.showError(result.message);
    }
  }

  async exportAllDataExcel() {
    Utils.showInfo("Đang chuẩn bị xuất dữ liệu Excel...");

    try {
      const fields = await authSystem.getAllFieldsForAdmin();
      const users = await authSystem.getUsers();

      // Create workbook
      const wb = XLSX.utils.book_new();

      // Process each field
      fields.forEach((field) => {
        if (!field.data || field.data.length === 0) return;

        // Prepare data for this field
        const fieldData = field.data.map((item) => {
          const user = users.find((u) => u.email === item.addedBy);
          return {
            "Dữ liệu": item.value,
            "Người thêm": user ? user.name : item.addedBy,
            Email: item.addedBy,
            "Ngày thêm": Utils.formatDate(item.addedAt),
          };
        });

        // Create worksheet for this field
        const ws = XLSX.utils.json_to_sheet(fieldData);

        // Auto-size columns based on content (max 50 chars)
        const columnWidths = this.calculateColumnWidths(fieldData, 50);
        ws["!cols"] = columnWidths;

        // Add worksheet to workbook
        const sheetName = this.sanitizeSheetName(field.name);
        XLSX.utils.book_append_sheet(wb, ws, sheetName);
      });

      // Generate and download file
      const fileName = `toan_bo_du_lieu_${
        new Date().toISOString().split("T")[0]
      }.xlsx`;
      XLSX.writeFile(wb, fileName);

      Utils.showSuccess("Xuất dữ liệu Excel thành công!");
    } catch (error) {
      console.error("Export error:", error);
      Utils.showError("Có lỗi xảy ra khi xuất dữ liệu Excel!");
    }
  }

  async exportFieldDataExcel() {
    const fieldId = this.getCustomSelectValue("exportFieldSelectContainer");
    if (!fieldId) {
      Utils.showError("Vui lòng chọn trường để xuất!");
      return;
    }

    Utils.showInfo("Đang chuẩn bị xuất dữ liệu Excel...");

    try {
      const fields = await authSystem.getAllFieldsForAdmin();
      const users = await authSystem.getUsers();
      const field = fields.find((f) => f.id === fieldId);

      if (!field) {
        Utils.showError("Không tìm thấy trường!");
        return;
      }

      if (!field.data || field.data.length === 0) {
        Utils.showWarning("Trường này chưa có dữ liệu!");
        return;
      }

      // Prepare data
      const fieldData = field.data.map((item) => {
        const user = users.find((u) => u.email === item.addedBy);
        return {
          "Dữ liệu": item.value,
          "Người thêm": user ? user.name : item.addedBy,
          Email: item.addedBy,
          "Ngày thêm": Utils.formatDate(item.addedAt),
        };
      });

      // Create workbook and worksheet
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(fieldData);

      // Auto-size columns
      const columnWidths = this.calculateColumnWidths(fieldData, 50);
      ws["!cols"] = columnWidths;

      // Add worksheet to workbook
      XLSX.utils.book_append_sheet(wb, ws, "Dữ liệu");

      // Generate and download file
      const fileName = `${this.sanitizeFileName(field.name)}_${
        new Date().toISOString().split("T")[0]
      }.xlsx`;
      XLSX.writeFile(wb, fileName);

      Utils.showSuccess("Xuất dữ liệu Excel thành công!");
    } catch (error) {
      console.error("Export error:", error);
      Utils.showError("Có lỗi xảy ra khi xuất dữ liệu Excel!");
    }
  }

  async exportUserDataExcel() {
    const userFilter = this.getCustomSelectValue("userDataUserSelectContainer");
    const fieldFilter = this.getCustomSelectValue(
      "userDataFieldSelectContainer"
    );

    Utils.showInfo("Đang chuẩn bị xuất dữ liệu người dùng...");

    try {
      const fields = await authSystem.getAllFieldsForAdmin();
      const users = await authSystem.getUsers();

      let allUserData = [];

      // Collect all user-submitted data
      fields.forEach((field) => {
        if (fieldFilter && field.id !== fieldFilter) return;

        (field.data || []).forEach((item) => {
          // Skip admin-added data
          if (
            item.addedBy === "letoan242" ||
            item.addedBy === "trinhhanh261293@gmail.com"
          )
            return;

          if (userFilter && item.addedBy !== userFilter) return;

          // Find user info
          const user = users.find((u) => u.email === item.addedBy);

          allUserData.push({
            "Người dùng": user ? user.name : "Unknown User",
            Email: item.addedBy,
            Trường: field.name,
            "Dữ liệu": item.value,
            "Ngày thêm": Utils.formatDate(item.addedAt),
          });
        });
      });

      if (allUserData.length === 0) {
        Utils.showWarning("Không có dữ liệu để xuất!");
        return;
      }

      // Create workbook and worksheet
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(allUserData);

      // Auto-size columns
      const columnWidths = this.calculateColumnWidths(allUserData, 50);
      ws["!cols"] = columnWidths;

      // Add worksheet to workbook
      XLSX.utils.book_append_sheet(wb, ws, "Dữ liệu người dùng");

      // Generate and download file
      const fileName = `du_lieu_nguoi_dung_${
        new Date().toISOString().split("T")[0]
      }.xlsx`;
      XLSX.writeFile(wb, fileName);

      Utils.showSuccess("Xuất dữ liệu người dùng thành công!");
    } catch (error) {
      console.error("Export error:", error);
      Utils.showError("Có lỗi xảy ra khi xuất dữ liệu Excel!");
    }
  }

  // Helper functions for Excel export
  calculateColumnWidths(data, maxWidth = 50) {
    if (!data || data.length === 0) return [];

    const keys = Object.keys(data[0]);
    const widths = keys.map((key) => {
      // Calculate width based on header and data
      let maxLength = key.length;

      data.forEach((row) => {
        const cellLength = String(row[key] || "").length;
        if (cellLength > maxLength) {
          maxLength = cellLength;
        }
      });

      // Limit max width and ensure minimum width
      return { wch: Math.min(Math.max(maxLength + 2, 10), maxWidth) };
    });

    return widths;
  }

  sanitizeSheetName(name) {
    // Remove invalid characters for sheet names
    return name.replace(/[\\\/\*\?\[\]]/g, "_").substring(0, 31);
  }

  sanitizeFileName(name) {
    // Remove invalid characters for file names
    return name.replace(/[<>:"/\\|?*]/g, "_");
  }

  filterUsersByStatus(statusFilter) {
    if (!this.allUsers) return;

    let filteredUsers = this.allUsers;

    if (statusFilter === "active") {
      filteredUsers = this.allUsers.filter((user) => user.status !== false);
    } else if (statusFilter === "locked") {
      filteredUsers = this.allUsers.filter((user) => user.status === false);
    }

    // Recreate table with filtered users
    const container = document.getElementById("usersTableContainer");

    const columns = [
      { key: "name", title: "Tên", searchable: true },
      { key: "email", title: "Email", searchable: true },
      {
        key: "assignedFields",
        title: "Trường được gán",
        render: (fields) => (fields || []).length + " trường",
      },
      {
        key: "status",
        title: "Trạng thái",
        render: (status) => {
          const isLocked = status === false;
          return `<span class="status-badge ${
            isLocked ? "status-locked" : "status-active"
          }">${isLocked ? "🔒 Bị khóa" : "✅ Hoạt động"}</span>`;
        },
      },
      {
        key: "createdAt",
        title: "Ngày tạo",
        type: "dateShort",
        searchable: true,
      },
      { key: "createdBy", title: "Tạo bởi", searchable: true },
    ];

    const options = {
      actions: (user) => {
        const isLocked = user.status === false;
        const lockBtnClass = isLocked ? "btn-success" : "btn-warning";
        const lockBtnText = isLocked ? "🔓" : "🔒";
        return `
          <div class="action-buttons">
            <button class="btn btn-secondary" onclick="adminPanel.editUser('${
              user.id
            }')" title="Sửa">✏️</button>
            <button class="btn ${lockBtnClass}" onclick="adminPanel.toggleUserLock('${
          user.id
        }')" title="${isLocked ? "Mở khóa" : "Khóa"}">${lockBtnText}</button>
          </div>
        `;
      },
      onHeaderClick: (column, index) => {
        if (column.searchable) {
          this.showColumnSearch("userColumnSearch");
        }
      },
    };

    const table = Utils.createTable(filteredUsers, columns, options);
    container.innerHTML = "";
    container.appendChild(table);

    // Add click handlers to searchable headers
    this.addHeaderClickHandlers(table, "userColumnSearch");
  }
}

// Make AdminPanel globally available
window.AdminPanel = AdminPanel;

// Initialize admin panel
let adminPanel;
document.addEventListener("DOMContentLoaded", async function () {
  // Wait for auth system to be ready
  let attempts = 0;
  while (!window.authSystem && attempts < 100) {
    await new Promise((resolve) => setTimeout(resolve, 50));
    attempts++;
  }

  adminPanel = new AdminPanel();
  window.adminPanel = adminPanel;
});
