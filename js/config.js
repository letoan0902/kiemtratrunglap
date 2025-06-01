// Firebase Configuration Manager
class FirebaseConfigManager {
  constructor() {
    this.config = null;
    this.initialized = false;
  }

  // Obfuscated config loader
  async getConfig() {
    if (this.config) return this.config;

    // Decode configuration (simple obfuscation)
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

    try {
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

      // Validate configuration
      if (!this.validateConfig(this.config)) {
        throw new Error("Invalid configuration");
      }

      this.initialized = true;
      return this.config;
    } catch (error) {
      console.error("Configuration error:", error);
      throw new Error("Failed to load application configuration");
    }
  }

  validateConfig(config) {
    const required = ["apiKey", "authDomain", "projectId"];
    return required.every((key) => config[key] && config[key].length > 0);
  }

  // Security checks
  async performSecurityChecks() {
    // Check for developer tools
    if (this.isDevToolsOpen()) {
      console.warn("Developer tools detected");
      // Could implement additional security measures here
    }

    // Check referrer
    if (!this.isValidReferrer()) {
      console.warn("Invalid referrer detected");
    }

    // Domain validation
    if (!this.isValidDomain()) {
      throw new Error("Application not authorized for this domain");
    }

    return true;
  }

  isDevToolsOpen() {
    const threshold = 160;
    return (
      window.outerWidth - window.innerWidth > threshold ||
      window.outerHeight - window.innerHeight > threshold
    );
  }

  isValidReferrer() {
    const allowedReferrers = [
      "localhost",
      "127.0.0.1",
      "letoan0902.github.io",
      "your-domain.com", // Add your actual domain
    ];

    const hostname = window.location.hostname;
    return allowedReferrers.some((ref) => hostname.includes(ref));
  }

  isValidDomain() {
    const allowedDomains = [
      "localhost",
      "127.0.0.1",
      "letoan0902.github.io", // GitHub Pages domain
    ];

    return allowedDomains.includes(window.location.hostname);
  }
}

// Rate limiting class
class RateLimiter {
  constructor() {
    this.requests = new Map();
    this.maxRequests = 100; // Max requests per minute
    this.windowMs = 60000; // 1 minute window
  }

  isAllowed(identifier = "default") {
    const now = Date.now();
    const windowStart = now - this.windowMs;

    if (!this.requests.has(identifier)) {
      this.requests.set(identifier, []);
    }

    const requests = this.requests.get(identifier);

    // Remove old requests
    const validRequests = requests.filter((time) => time > windowStart);
    this.requests.set(identifier, validRequests);

    // Check if under limit
    if (validRequests.length >= this.maxRequests) {
      return false;
    }

    // Add current request
    validRequests.push(now);
    return true;
  }
}

// Initialize instances
const configManager = new FirebaseConfigManager();
const rateLimiter = new RateLimiter();

// Export for use
window.FirebaseConfigManager = configManager;
window.RateLimiter = rateLimiter;

export { configManager, rateLimiter };
