# 🔥 DEPLOY FIRESTORE RULES MANUAL - VIA FIREBASE CONSOLE

## **📋 CÁC BƯỚC DEPLOY:**

### **BƯỚC 1: Mở Firebase Console**
```
https://console.firebase.google.com/project/letoancheckduplicates/firestore/rules
```

### **BƯỚC 2: Copy Rules từ file local**
Copy toàn bộ nội dung từ file `firestore.rules` (dưới đây):

```javascript
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    // Helper functions for validation
    function isValidEmail(email) {
      return email.matches('.*@.*\\..*');
    }
    
    function isValidUserData(data) {
      // More flexible validation - check required fields exist
      return data.keys().hasAll(['email', 'name', 'role', 'isActive']) &&
             data.role in ['admin', 'user'] &&
             data.isActive is bool &&
             data.email is string &&
             data.name is string &&
             // Allow additional fields like username, password, etc.
             (data.username is string || !data.keys().hasAny(['username'])) &&
             (data.password is string || !data.keys().hasAny(['password']));
    }
    
    function isValidAssignmentData(data) {
      return data.keys().hasAll(['userId', 'fieldId']) &&
             data.userId is string &&
             data.fieldId is string;
    }
    
    function isValidFieldData(data) {
      return data.keys().hasAll(['name']) &&
             data.name is string;
    }
    
    function isAdmin() {
      return request.auth != null && 
             request.auth.token.role == 'admin';
    }
    
    function isUser() {
      return request.auth != null && 
             request.auth.token.role == 'user';
    }
    
    function isOwner(userId) {
      return request.auth != null && 
             request.auth.uid == userId;
    }

    // Users collection
    match /users/{userId} {
      // Allow read for authenticated users (to check assignments)
      allow read: if request.auth != null;
      
      // Allow create for authenticated users with valid data
      allow create: if request.auth != null && 
                       isValidUserData(request.resource.data);
      
      // Allow update/delete for admins or self
      allow update, delete: if isAdmin() || isOwner(userId);
    }

    // Fields collection  
    match /fields/{fieldId} {
      // Allow read for authenticated users
      allow read: if request.auth != null;
      
      // Allow create/update/delete for admins only
      allow create, update, delete: if isAdmin() && 
                                       isValidFieldData(request.resource.data);
    }

    // User-field assignments
    match /assignments/{assignmentId} {
      // Allow read for authenticated users (for checking permissions)
      allow read: if request.auth != null;
      
      // Allow create/update/delete for admins only  
      allow create, update, delete: if isAdmin() && 
                                       isValidAssignmentData(request.resource.data);
    }
    
    // Rate limiting collection (for security system)
    match /rate_limits/{limitId} {
      // Allow read/write for any authenticated user (for rate limiting)
      allow read, write: if request.auth != null;
    }
  }
}
```

### **BƯỚC 3: Paste vào Firebase Console**
1. Xóa toàn bộ nội dung hiện tại trong editor
2. Paste rules mới vào
3. Click **"Publish"** để deploy

### **BƯỚC 4: Kiểm tra**
- Rules sẽ có hiệu lực trong vòng 1-2 phút
- Test tạo user mới để xác nhận

## ✅ **HOÀN THÀNH!**
User creation sẽ hoạt động ngay sau khi deploy rules mới. 