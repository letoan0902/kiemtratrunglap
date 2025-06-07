// Trình quản lý cấu hình Firebase hiệu suất cao
class FirebaseConfigManager {
  constructor() {
    this.config = null;
    this.initialized = false;
    this.cache = new Map();
    this.securityChecked = false;
    this.lastSecurityCheck = 0;
  }

  // Trình tải cấu hình cache nhanh
  async getConfig() {
    if (this.config) return this.config;

    // Sử dụng cấu hình cache nếu có
    const cached = this.cache.get("firebase_config");
    if (cached && Date.now() - cached.timestamp < 300000) {
      // Cache 5 phút
      this.config = cached.data;
      return this.config;
    }

    // Giải mã cấu hình (tối ưu hóa)
    const encoded = [
      "QUl6YVN5Q1FuMXBiaGNIblk4OXg0X0ZlV3NhS3E0dkQxcW5pcTF3", // apiKey
      "bGV0b2FuY2hlY2tkdXBsaWNhdGVzLmZpcmViYXNlYXBwLmNvbQ==", // authDomain
      "aHR0cHM6Ly9sZXRvYW5jaGVja2R1cGxpY2F0ZXMtZGVmYXVsdC1ydGRiLmZpcmViYXNlaW8uY29t", // databaseURL
      "bGV0b2FuY2hlY2tkdXBsaWNhdGVz", // projectId
      "bGV0b2FuY2hlY2tkdXBsaWNhdGVzLmZpcmViYXNlc3RvcmFnZS5hcHA=", // storageBucket
      "NTI3MTczNzYyNTQ0", // messagingSenderId
      "MTo1MjcxNzM3NjI1NDQ6d2ViOjUxNzg1OGRlNDU2NDk3ZTU2YzcxMzU=", // appId
      "Ry04WFJLRURUMzZS", // measurementId
    ];

    // Giải mã tất cả cùng lúc (nhanh hơn)
    this.config = {
      apiKey: atob(encoded[0]),
      authDomain: atob(encoded[1]),
      databaseURL: atob(encoded[2]),
      projectId: atob(encoded[3]),
      storageBucket: atob(encoded[4]),
      messagingSenderId: atob(encoded[5]),
      appId: atob(encoded[6]),
      measurementId: atob(encoded[7]),
    };

    // Lưu cache cấu hình
    this.cache.set("firebase_config", {
      data: this.config,
      timestamp: Date.now(),
    });

    this.initialized = true;
    return this.config;
  }

  // Kiểm tra bảo mật tối ưu - chạy ít thường xuyên hơn
  async performSecurityChecks() {
    const now = Date.now();

    // Bỏ qua nếu đã kiểm tra gần đây (trong vòng 30 giây)
    if (this.securityChecked && now - this.lastSecurityCheck < 30000) {
      return true;
    }

    // Xác thực domain nhanh (quan trọng nhất)
    if (!this.isValidDomain()) {
      throw new Error("Ứng dụng không được phép trên domain này");
    }

    // Đặt cờ để tránh kiểm tra lặp lại
    this.securityChecked = true;
    this.lastSecurityCheck = now;

    // Lên lịch kiểm tra khác không đồng bộ (không chặn)
    setTimeout(() => {
      this.performBackgroundSecurityChecks();
    }, 0);

    return true;
  }

  // Kiểm tra bảo mật nền (không chặn)
  performBackgroundSecurityChecks() {
    try {
      // Kiểm tra công cụ phát triển (nền) - TẮT để tránh chặn
      // if (this.isDevToolsOpen()) {
      //   console.warn("Phát hiện công cụ phát triển");
      // }

      // Kiểm tra referrer (nền)
      if (!this.isValidReferrer()) {
        console.debug("Phát hiện referrer không hợp lệ"); // Chuyển thành debug
      }
    } catch (error) {
      // Thất bại thầm lặng cho kiểm tra nền
      console.debug("Kiểm tra bảo mật nền:", error);
    }
  }

  // Phát hiện công cụ phát triển tối ưu
  isDevToolsOpen() {
    const threshold = 160;
    return (
      window.outerWidth - window.innerWidth > threshold ||
      window.outerHeight - window.innerHeight > threshold
    );
  }

  // Xác thực referrer có cache
  isValidReferrer() {
    if (!this.cache.has("referrer_valid")) {
      const allowedReferrers = [
        "localhost",
        "127.0.0.1",
        "letoan0902.github.io",
        "letoan-kiemtratrunglap.netlify.app",
        "netlify.app",
      ];

      const hostname = window.location.hostname;
      const isValid = allowedReferrers.some((ref) => hostname.includes(ref));

      // Lưu cache kết quả trong 5 phút
      this.cache.set("referrer_valid", {
        data: isValid,
        timestamp: Date.now(),
      });

      return isValid;
    }

    const cached = this.cache.get("referrer_valid");
    if (Date.now() - cached.timestamp < 300000) {
      // 5 phút
      return cached.data;
    }

    // Xác thực lại nếu cache hết hạn
    this.cache.delete("referrer_valid");
    return this.isValidReferrer();
  }

  // Xác thực domain nhanh
  isValidDomain() {
    const allowedDomains = [
      "localhost",
      "127.0.0.1",
      "letoan0902.github.io",
      "letoan-kiemtratrunglap.netlify.app",
      "netlify.app",
    ];

    const hostname = window.location.hostname;
    return allowedDomains.some(
      (domain) => hostname === domain || hostname.endsWith("." + domain)
    );
  }
}

// Lớp giới hạn tốc độ tối ưu
class RateLimiter {
  constructor() {
    this.requests = new Map();
    this.maxRequests = 200; // Tăng giới hạn để UX tốt hơn
    this.windowMs = 60000; // Cửa sổ 1 phút
    this.cleanupInterval = null;
    this.startCleanup();
  }

  // Dọn dẹp nền để tránh rò rỉ bộ nhớ
  startCleanup() {
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 30000); // Dọn dẹp mỗi 30 giây
  }

  cleanup() {
    const now = Date.now();
    const windowStart = now - this.windowMs;

    for (const [identifier, requests] of this.requests.entries()) {
      const validRequests = requests.filter((time) => time > windowStart);

      if (validRequests.length === 0) {
        this.requests.delete(identifier);
      } else {
        this.requests.set(identifier, validRequests);
      }
    }
  }

  isAllowed(identifier = "default") {
    const now = Date.now();
    const windowStart = now - this.windowMs;

    if (!this.requests.has(identifier)) {
      this.requests.set(identifier, [now]);
      return true;
    }

    const requests = this.requests.get(identifier);

    // Kiểm tra nhanh mà không cần dọn dẹp đầy đủ
    const recentCount = requests.reduce((count, time) => {
      return time > windowStart ? count + 1 : count;
    }, 0);

    if (recentCount >= this.maxRequests) {
      return false;
    }

    // Thêm yêu cầu hiện tại
    requests.push(now);

    // Dọn dẹp lười - chỉ dọn nếu mảng quá lớn
    if (requests.length > this.maxRequests * 2) {
      const validRequests = requests.filter((time) => time > windowStart);
      this.requests.set(identifier, validRequests);
    }

    return true;
  }

  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }
}

// Khởi tạo instances với theo dõi hiệu suất
const configManager = new FirebaseConfigManager();
const rateLimiter = new RateLimiter();

// Theo dõi hiệu suất
window.addEventListener("beforeunload", () => {
  rateLimiter.destroy();
});

// Xuất để sử dụng
window.FirebaseConfigManager = configManager;
window.RateLimiter = rateLimiter;

export { configManager, rateLimiter };
