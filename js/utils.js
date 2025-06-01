// Các hàm tiện ích cho ứng dụng
class Utils {
  static showMessage(message, type = "info", duration = 3000) {
    const existingMessage = document.querySelector(".message");
    if (existingMessage) {
      existingMessage.remove();
    }

    const messageDiv = document.createElement("div");
    messageDiv.className = `message ${type} fade-in`;
    messageDiv.textContent = message;

    // Chèn vào đầu body hoặc sau nav
    const nav = document.querySelector(".nav");
    if (nav) {
      nav.insertAdjacentElement("afterend", messageDiv);
    } else {
      document.body.insertBefore(messageDiv, document.body.firstChild);
    }

    // Tự động xóa sau khoảng thời gian
    setTimeout(() => {
      if (messageDiv.parentNode) {
        messageDiv.style.animation = "fadeOut 0.3s ease-out";
        setTimeout(() => {
          if (messageDiv.parentNode) {
            messageDiv.remove();
          }
        }, 300);
      }
    }, duration);
  }

  static showSuccess(message) {
    this.showToast(message, "success");
  }

  static showError(message) {
    this.showToast(message, "error");
  }

  static showWarning(message) {
    this.showToast(message, "warning");
  }

  static showInfo(message) {
    this.showToast(message, "info");
  }

  static showLoading(element, show = true) {
    if (show) {
      element.classList.add("loading");
      element.disabled = true;
      element.dataset.originalText = element.textContent;
      element.innerHTML = '<span class="loading"></span> Đang xử lý...';
    } else {
      element.classList.remove("loading");
      element.disabled = false;
      element.textContent = element.dataset.originalText || element.textContent;
    }
  }

  static formatDate(dateString) {
    if (!dateString) return "";
    const date = new Date(dateString);
    return date.toLocaleString("vi-VN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  static formatDateShort(dateString) {
    if (!dateString) return "";
    const date = new Date(dateString);
    return date.toLocaleDateString("vi-VN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  }

  static validateEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
  }

  static validatePassword(password) {
    return password.length >= 6;
  }

  static generateRandomPassword(length = 8) {
    const chars =
      "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let result = "";
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  static copyToClipboard(text) {
    if (navigator.clipboard) {
      navigator.clipboard
        .writeText(text)
        .then(() => {
          this.showSuccess("Đã sao chép vào clipboard!");
        })
        .catch(() => {
          this.fallbackCopyToClipboard(text);
        });
    } else {
      this.fallbackCopyToClipboard(text);
    }
  }

  static fallbackCopyToClipboard(text) {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed";
    textArea.style.left = "-999999px";
    textArea.style.top = "-999999px";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();

    try {
      document.execCommand("copy");
      this.showSuccess("Đã sao chép vào clipboard!");
    } catch (err) {
      this.showError("Không thể sao chép!");
    }

    document.body.removeChild(textArea);
  }

  static async confirmDialog(message, size = "medium") {
    return new Promise((resolve) => {
      const modal = this.createModal({
        title: "Xác nhận",
        content: `
          <div class="confirm-modal">
            <p class="message">${message}</p>
            <div class="btn-group">
              <button class="btn btn-secondary" onclick="this.confirmResult = false; this.closest('.modal').style.display='none'; document.body.removeChild(this.closest('.modal'));">Hủy</button>
              <button class="btn btn-danger" onclick="this.confirmResult = true; this.closest('.modal').style.display='none'; document.body.removeChild(this.closest('.modal'));">Xác nhận</button>
            </div>
          </div>
        `,
        size: size,
        closable: true,
        allowOverlayClose: true,
      });

      // Set default result to false when modal is closed via X button
      modal.confirmResult = false;

      // Wait for user action
      const checkResult = () => {
        if (modal.confirmResult !== undefined) {
          const result = modal.confirmResult;
          resolve(result);
        } else if (document.body.contains(modal)) {
          setTimeout(checkResult, 100);
        } else {
          resolve(false);
        }
      };
      checkResult();
    });
  }

  static createModal({
    title,
    content,
    size = "medium",
    closable = true,
    allowOverlayClose = false,
  }) {
    // Create modal overlay
    const modal = document.createElement("div");
    modal.className = "modal";

    // Determine modal size
    let modalClass = "modal-content";
    if (size === "small") modalClass += " modal-small";
    else if (size === "large") modalClass += " modal-large";
    else if (size === "auto") modalClass += " modal-auto";

    modal.innerHTML = `
      <div class="${modalClass}">
        <div class="modal-header">
          <h3 class="modal-title">${title}</h3>
          ${
            closable
              ? "<button class=\"modal-close\" onclick=\"this.closest('.modal').style.display='none'; document.body.removeChild(this.closest('.modal'));\">×</button>"
              : ""
          }
        </div>
        <div class="modal-body">
          ${content}
        </div>
      </div>
    `;

    // Add click outside to close (only if allowOverlayClose is true)
    if (allowOverlayClose) {
      modal.addEventListener("click", (e) => {
        if (e.target === modal) {
          modal.style.display = "none";
          document.body.removeChild(modal);
        }
      });
    }

    // Add to body and show
    document.body.appendChild(modal);
    modal.style.display = "flex";

    return modal;
  }

  static debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }

  static throttle(func, limit) {
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

  static sanitizeInput(input) {
    const div = document.createElement("div");
    div.textContent = input;
    return div.innerHTML;
  }

  static formatFileSize(bytes) {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  }

  static getUrlParameter(name) {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get(name);
  }

  static setUrlParameter(name, value) {
    const url = new URL(window.location);
    url.searchParams.set(name, value);
    window.history.replaceState({}, "", url);
  }

  static removeUrlParameter(name) {
    const url = new URL(window.location);
    url.searchParams.delete(name);
    window.history.replaceState({}, "", url);
  }

  static animateNumber(element, start, end, duration = 1000) {
    const range = end - start;
    const increment = range / (duration / 16);
    let current = start;

    const animate = () => {
      current += increment;
      if (
        (increment > 0 && current >= end) ||
        (increment < 0 && current <= end)
      ) {
        element.textContent = end;
      } else {
        element.textContent = Math.floor(current);
        requestAnimationFrame(animate);
      }
    };

    animate();
  }

  static createTable(data, columns, options = {}) {
    const {
      actions,
      pagination = false,
      itemsPerPage = 10,
      onHeaderClick,
    } = options;

    const container = document.createElement("div");
    container.className = "table-container";

    // Create pagination state
    let currentPage = 1;
    let itemsPerPageValue = itemsPerPage;

    const createPaginationControls = () => {
      const totalPages = Math.ceil(data.length / itemsPerPageValue);
      const startItem = (currentPage - 1) * itemsPerPageValue + 1;
      const endItem = Math.min(currentPage * itemsPerPageValue, data.length);

      const paginationDiv = document.createElement("div");
      paginationDiv.className = "pagination-controls";

      const leftSide = document.createElement("div");
      leftSide.className = "pagination-info";
      leftSide.innerHTML = `
        <span>Hiển thị: </span>
        <select class="items-per-page-select">
          <option value="10" ${
            itemsPerPageValue === 10 ? "selected" : ""
          }>10</option>
          <option value="20" ${
            itemsPerPageValue === 20 ? "selected" : ""
          }>20</option>
          <option value="50" ${
            itemsPerPageValue === 50 ? "selected" : ""
          }>50</option>
          <option value="100" ${
            itemsPerPageValue === 100 ? "selected" : ""
          }>100</option>
          <option value="200" ${
            itemsPerPageValue === 200 ? "selected" : ""
          }>200</option>
          <option value="500" ${
            itemsPerPageValue === 500 ? "selected" : ""
          }>500</option>
        </select>
        <span> mục/trang | Hiển thị ${startItem}-${endItem} trong ${
        data.length
      } mục</span>
      `;

      const rightSide = document.createElement("div");
      rightSide.className = "pagination-buttons";

      // Previous button
      const prevBtn = document.createElement("button");
      prevBtn.className = "btn btn-secondary pagination-btn";
      prevBtn.innerHTML = "‹ Trước";
      prevBtn.disabled = currentPage === 1;
      prevBtn.onclick = () => {
        if (currentPage > 1) {
          currentPage--;
          renderTable();
        }
      };

      // Page numbers
      const pageNumbers = document.createElement("div");
      pageNumbers.className = "page-numbers";

      const maxVisiblePages = 5;
      let startPage = Math.max(
        1,
        currentPage - Math.floor(maxVisiblePages / 2)
      );
      let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);

      if (endPage - startPage + 1 < maxVisiblePages) {
        startPage = Math.max(1, endPage - maxVisiblePages + 1);
      }

      // First page
      if (startPage > 1) {
        const firstPage = this.createPageButton(1, currentPage, () => {
          currentPage = 1;
          renderTable();
        });
        pageNumbers.appendChild(firstPage);

        if (startPage > 2) {
          const ellipsis = document.createElement("span");
          ellipsis.textContent = "...";
          ellipsis.style.padding = "6px";
          ellipsis.style.color = "#666";
          pageNumbers.appendChild(ellipsis);
        }
      }

      // Visible pages
      for (let i = startPage; i <= endPage; i++) {
        const pageBtn = this.createPageButton(i, currentPage, () => {
          currentPage = i;
          renderTable();
        });
        pageNumbers.appendChild(pageBtn);
      }

      // Last page
      if (endPage < totalPages) {
        if (endPage < totalPages - 1) {
          const ellipsis = document.createElement("span");
          ellipsis.textContent = "...";
          ellipsis.style.padding = "6px";
          ellipsis.style.color = "#666";
          pageNumbers.appendChild(ellipsis);
        }

        const lastPage = this.createPageButton(totalPages, currentPage, () => {
          currentPage = totalPages;
          renderTable();
        });
        pageNumbers.appendChild(lastPage);
      }

      // Next button
      const nextBtn = document.createElement("button");
      nextBtn.className = "btn btn-secondary pagination-btn";
      nextBtn.innerHTML = "Sau ›";
      nextBtn.disabled = currentPage === totalPages;
      nextBtn.onclick = () => {
        if (currentPage < totalPages) {
          currentPage++;
          renderTable();
        }
      };

      rightSide.appendChild(prevBtn);
      rightSide.appendChild(pageNumbers);
      rightSide.appendChild(nextBtn);

      paginationDiv.appendChild(leftSide);
      paginationDiv.appendChild(rightSide);

      return paginationDiv;
    };

    const renderTable = () => {
      // Clear container
      container.innerHTML = "";

      // Calculate pagination
      const startIndex = (currentPage - 1) * itemsPerPageValue;
      const endIndex = startIndex + itemsPerPageValue;
      const pageData = pagination ? data.slice(startIndex, endIndex) : data;

      // Add top pagination if needed
      if (pagination) {
        const topPagination = createPaginationControls();
        container.appendChild(topPagination);
      }

      // Create table
      const table = document.createElement("table");
      table.className = "data-table";

      // Create header
      const thead = document.createElement("thead");
      const headerRow = document.createElement("tr");

      columns.forEach((column, index) => {
        const th = document.createElement("th");
        th.textContent = column.title;
        if (column.width) {
          th.style.width = column.width;
        }

        // Add searchable styling and click handler
        if (column.searchable) {
          th.classList.add("searchable");
          if (onHeaderClick) {
            th.addEventListener("click", () => {
              onHeaderClick(column, index);
            });
          }
        }

        headerRow.appendChild(th);
      });

      if (actions) {
        const th = document.createElement("th");
        th.textContent = "Thao tác";
        th.style.width = "150px";
        th.style.textAlign = "center";
        headerRow.appendChild(th);
      }

      thead.appendChild(headerRow);
      table.appendChild(thead);

      // Create body
      const tbody = document.createElement("tbody");

      if (pageData.length === 0) {
        const row = document.createElement("tr");
        const cell = document.createElement("td");
        cell.colSpan = columns.length + (actions ? 1 : 0);
        cell.innerHTML = `
          <div style="text-align: center; padding: 40px; color: #666;">
            <div style="font-size: 48px; margin-bottom: 15px;">📊</div>
            <div style="font-size: 16px; font-weight: 500;">Không có dữ liệu</div>
            <div style="font-size: 14px; margin-top: 5px;">Chưa có dữ liệu nào được thêm vào</div>
          </div>
        `;
        row.appendChild(cell);
        tbody.appendChild(row);
      } else {
        pageData.forEach((item, index) => {
          const row = document.createElement("tr");

          columns.forEach((column) => {
            const cell = document.createElement("td");
            let value = item[column.key];

            if (column.render) {
              value = column.render(value, item, index);
            } else if (column.type === "date") {
              value = this.formatDate(value);
            } else if (column.type === "dateShort") {
              value = this.formatDateShort(value);
            }

            if (typeof value === "string" && value.includes("<")) {
              cell.innerHTML = value;
            } else {
              cell.textContent = value || "";
            }

            row.appendChild(cell);
          });

          if (actions) {
            const cell = document.createElement("td");
            cell.style.textAlign = "center";
            cell.innerHTML = actions(item, index);
            row.appendChild(cell);
          }

          tbody.appendChild(row);
        });
      }

      table.appendChild(tbody);
      container.appendChild(table);

      // Add bottom pagination if needed
      if (pagination) {
        const bottomPagination = createPaginationControls();
        container.appendChild(bottomPagination);
      }

      // Add event listeners for items per page selects
      container.querySelectorAll(".items-per-page-select").forEach((select) => {
        select.addEventListener("change", (e) => {
          itemsPerPageValue = parseInt(e.target.value);
          currentPage = 1; // Reset to first page
          renderTable();
        });
      });
    };

    renderTable();
    return container;
  }

  static createPageButton(pageNumber, currentPage, onClick) {
    const button = document.createElement("button");
    button.className = "page-number";
    button.textContent = pageNumber;
    button.onclick = onClick;

    if (pageNumber === currentPage) {
      button.classList.add("active");
    }

    return button;
  }

  static exportTableToCSV(table, filename = "export.csv") {
    const rows = Array.from(table.querySelectorAll("tr"));
    const csvContent = rows
      .map((row) => {
        const cells = Array.from(row.querySelectorAll("th, td"));
        return cells.map((cell) => `"${cell.textContent.trim()}"`).join(",");
      })
      .join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");

    if (link.download !== undefined) {
      const url = URL.createObjectURL(blob);
      link.setAttribute("href", url);
      link.setAttribute("download", filename);
      link.style.visibility = "hidden";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  }

  static scrollToTop(smooth = true) {
    if (smooth) {
      window.scrollTo({
        top: 0,
        behavior: "smooth",
      });
    } else {
      window.scrollTo(0, 0);
    }
  }

  static isInViewport(element) {
    const rect = element.getBoundingClientRect();
    return (
      rect.top >= 0 &&
      rect.left >= 0 &&
      rect.bottom <=
        (window.innerHeight || document.documentElement.clientHeight) &&
      rect.right <= (window.innerWidth || document.documentElement.clientWidth)
    );
  }

  static storage = {
    set(key, value) {
      try {
        localStorage.setItem(key, JSON.stringify(value));
        return true;
      } catch (e) {
        console.error("Storage error:", e);
        return false;
      }
    },

    get(key, defaultValue = null) {
      try {
        const item = localStorage.getItem(key);
        return item ? JSON.parse(item) : defaultValue;
      } catch (e) {
        console.error("Storage error:", e);
        return defaultValue;
      }
    },

    remove(key) {
      try {
        localStorage.removeItem(key);
        return true;
      } catch (e) {
        console.error("Storage error:", e);
        return false;
      }
    },

    clear() {
      try {
        localStorage.clear();
        return true;
      } catch (e) {
        console.error("Storage error:", e);
        return false;
      }
    },
  };

  static showToast(message, type = "info") {
    // Remove existing toasts
    const existingToasts = document.querySelectorAll(".toast");
    existingToasts.forEach((toast) => toast.remove());

    // Create toast
    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
      <div class="toast-content">
        <span class="toast-message">${message}</span>
        <button class="toast-close" onclick="this.parentElement.parentElement.remove()">×</button>
      </div>
    `;

    // Add to body
    document.body.appendChild(toast);

    // Animate in
    setTimeout(() => toast.classList.add("show"), 100);

    // Auto remove after 5 seconds
    setTimeout(() => {
      if (toast.parentElement) {
        toast.classList.remove("show");
        setTimeout(() => toast.remove(), 300);
      }
    }, 5000);
  }
}
