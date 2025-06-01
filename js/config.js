// High-Performance Firebase Configuration Manager
class FirebaseConfigManager {
  constructor() {
    this.config = null;
    this.initialized = false;
    this.cache = new Map();
    this.securityChecked = false;
    this.lastSecurityCheck = 0;
  }

  // Fast cached config loader
  async getConfig() {
    if (this.config) return this.config;

    // Use cached config if available
    const cached = this.cache.get("firebase_config");
    if (cached && Date.now() - cached.timestamp < 300000) {
      // 5 minute cache
      this.config = cached.data;
      return this.config;
    }

    // Decode configuration (optimized)
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

    // Pre-decode all at once (faster)
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

    // Cache the config
    this.cache.set("firebase_config", {
      data: this.config,
      timestamp: Date.now(),
    });

    this.initialized = true;
    return this.config;
  }

  // Optimized security checks - run less frequently
  async performSecurityChecks() {
    const now = Date.now();

    // Skip if checked recently (within 30 seconds)
    if (this.securityChecked && now - this.lastSecurityCheck < 30000) {
      return true;
    }

    // Fast domain validation (most important)
    if (!this.isValidDomain()) {
      throw new Error("Application not authorized for this domain");
    }

    // Set flags to avoid repeated checks
    this.securityChecked = true;
    this.lastSecurityCheck = now;

    // Schedule other checks asynchronously (non-blocking)
    setTimeout(() => {
      this.performBackgroundSecurityChecks();
    }, 0);

    return true;
  }

  // Background security checks (non-blocking)
  performBackgroundSecurityChecks() {
    try {
      // Check for developer tools (background) - DISABLED to prevent blocking
      // if (this.isDevToolsOpen()) {
      //   console.warn("Developer tools detected");
      // }

      // Check referrer (background)
      if (!this.isValidReferrer()) {
        console.debug("Invalid referrer detected"); // Changed to debug
      }
    } catch (error) {
      // Silent fail for background checks
      console.debug("Background security check:", error);
    }
  }

  // Optimized dev tools detection
  isDevToolsOpen() {
    const threshold = 160;
    return (
      window.outerWidth - window.innerWidth > threshold ||
      window.outerHeight - window.innerHeight > threshold
    );
  }

  // Cached referrer validation
  isValidReferrer() {
    if (!this.cache.has("referrer_valid")) {
      const allowedReferrers = [
        "localhost",
        "127.0.0.1",
        "letoan0902.github.io",
      ];

      const hostname = window.location.hostname;
      const isValid = allowedReferrers.some((ref) => hostname.includes(ref));

      // Cache result for 5 minutes
      this.cache.set("referrer_valid", {
        data: isValid,
        timestamp: Date.now(),
      });

      return isValid;
    }

    const cached = this.cache.get("referrer_valid");
    if (Date.now() - cached.timestamp < 300000) {
      // 5 minutes
      return cached.data;
    }

    // Re-validate if cache expired
    this.cache.delete("referrer_valid");
    return this.isValidReferrer();
  }

  // Fast domain validation
  isValidDomain() {
    const allowedDomains = ["localhost", "127.0.0.1", "letoan0902.github.io"];

    return allowedDomains.includes(window.location.hostname);
  }
}

// Optimized Rate limiting class
class RateLimiter {
  constructor() {
    this.requests = new Map();
    this.maxRequests = 200; // Increased limit for better UX
    this.windowMs = 60000; // 1 minute window
    this.cleanupInterval = null;
    this.startCleanup();
  }

  // Background cleanup to prevent memory leaks
  startCleanup() {
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 30000); // Cleanup every 30 seconds
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

    // Quick check without full cleanup
    const recentCount = requests.reduce((count, time) => {
      return time > windowStart ? count + 1 : count;
    }, 0);

    if (recentCount >= this.maxRequests) {
      return false;
    }

    // Add current request
    requests.push(now);

    // Lazy cleanup - only clean if array gets too large
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

// Initialize instances with performance monitoring
const configManager = new FirebaseConfigManager();
const rateLimiter = new RateLimiter();

// Performance tracking
window.addEventListener("beforeunload", () => {
  rateLimiter.destroy();
});

// Export for use
window.FirebaseConfigManager = configManager;
window.RateLimiter = rateLimiter;

export { configManager, rateLimiter };
