// src/controllers/authController.js
const { auth, db } = require('../config/firebase'); // Đảm bảo đường dẫn đúng tới file cấu hình Firebase

// Regex giống hệt utils/validator.ts ở frontend
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_REGEX = /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z0-9]{8,}$/;

// Đăng ký tài khoản (staff)
exports.registerUser = async (req, res) => {
    const { email, password, fullName, phone } = req.body;

    // 1. Kiểm tra dữ liệu bắt buộc
    if (!email || !password || !fullName) {
        return res.status(400).json({ message: 'Thiếu thông tin bắt buộc' });
    }

    // 2. Validate email
    if (!EMAIL_REGEX.test(email)) {
        return res.status(400).json({ message: 'Email không hợp lệ' });
    }

    // 3. Validate mật khẩu (khớp với frontend)
    if (!PASSWORD_REGEX.test(password)) {
        return res.status(400).json({ message: 'Mật khẩu phải tối thiểu 8 ký tự, gồm cả chữ và số, không chứa ký tự đặc biệt' });
    }

    try {
        // Tạo user trên Firebase Authentication
        const userRecord = await auth.createUser({
            email,
            password,
            displayName: fullName,
        });

        // Lưu thông tin bổ sung vào Firestore
        await db.collection('users').doc(userRecord.uid).set({
            email,
            fullName,
            phone: phone || '',
            role: 'staff',          // mặc định staff
            isActive: true,
            createdAt: new Date().toISOString(),
            photoURL: '',
        });

        // Trả về thành công
        res.status(201).json({
            message: 'Đăng ký thành công',
            user: {
                uid: userRecord.uid,
                email,
                fullName,
                role: 'staff',
                photoURL: '',
            },
        });
    } catch (err) {
        if (err.code === 'auth/email-already-exists') {
            return res.status(409).json({ message: 'Email đã được sử dụng' });
        }
        // Lỗi khác (ví dụ mật khẩu yếu, network...)
        res.status(400).json({ message: err.message });
    }
};

// Lấy thông tin user hiện tại (dựa trên token đã xác thực)
exports.getMe = async (req, res) => {
    try {
        // `req.user` được gán bởi middleware verifyToken
        const uid = req.user.uid;
        const userDoc = await db.collection('users').doc(uid).get();

        if (!userDoc.exists) {
            return res.status(404).json({ message: 'Không tìm thấy thông tin user' });
        }

        const userData = userDoc.data();
        res.status(200).json({
            uid,
            email: userData.email,
            fullName: userData.fullName,
            phone: userData.phone || '',
            role: userData.role,
            isActive: userData.isActive,
            createdAt: userData.createdAt,
            photoURL: userData.photoURL || '',
        });
    } catch (err) {
        res.status(500).json({ message: 'Lỗi server: ' + err.message });
    }
};

// Đăng xuất (chỉ đơn giản là phía client xoá token, nhưng có thể thêm logic blacklist nếu cần)
exports.logout = async (req, res) => {
    try {
        // Với JWT stateless, logout thường do client tự huỷ token.
        // Tuy nhiên có thể ghi log hoặc thêm token vào blacklist ở đây.
        // Hiện tại chỉ trả về thành công.
        res.status(200).json({ message: 'Đăng xuất thành công' });
    } catch (err) {
        res.status(500).json({ message: 'Lỗi server: ' + err.message });
    }
};

// Cập nhật thông tin cá nhân (fullName, phone, photoURL)
exports.updateProfile = async (req, res) => {
    try {
        const uid = req.user.uid;
        const { fullName, phone, photoURL } = req.body;

        const updates = {};
        if (fullName !== undefined) updates.fullName = fullName;
        if (phone    !== undefined) updates.phone    = phone;
        if (photoURL !== undefined) updates.photoURL = photoURL;

        // Cập nhật displayName + photoURL trên Firebase Auth
        const authUpdates = {};
        if (fullName  !== undefined) authUpdates.displayName = fullName;
        if (photoURL  !== undefined) authUpdates.photoURL    = photoURL;
        if (Object.keys(authUpdates).length) {
            await auth.updateUser(uid, authUpdates);
        }

        // Cập nhật Firestore
        await db.collection('users').doc(uid).update({
            ...updates,
            updatedAt: new Date().toISOString(),
        });

        res.status(200).json({ message: 'Cập nhật thành công', updates });
    } catch (err) {
        res.status(500).json({ message: 'Lỗi server: ' + err.message });
    }
};

// Reset mật khẩu (cần biết mật khẩu cũ để xác thực phía client trước, backend chỉ set mới)
exports.resetPassword = async (req, res) => {
    try {
        const uid = req.user.uid;
        const { newPassword } = req.body;

        if (!newPassword) {
            return res.status(400).json({ message: 'Thiếu mật khẩu mới' });
        }

        const PASSWORD_REGEX = /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z0-9]{8,}$/;
        if (!PASSWORD_REGEX.test(newPassword)) {
            return res.status(400).json({
                message: 'Mật khẩu phải tối thiểu 8 ký tự, gồm cả chữ và số, không chứa ký tự đặc biệt',
            });
        }

        await auth.updateUser(uid, { password: newPassword });

        res.status(200).json({ message: 'Đổi mật khẩu thành công' });
    } catch (err) {
        res.status(500).json({ message: 'Lỗi server: ' + err.message });
    }
};