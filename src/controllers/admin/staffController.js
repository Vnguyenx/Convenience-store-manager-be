// src/controllers/admin/staffController.js
const { auth, db } = require('../../config/firebase');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_REGEX = /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z0-9]{8,}$/;
const PHONE_REGEX = /^(0|\+84)[0-9]{9}$/;
const VALID_ROLES = ['admin', 'staff'];

// ── Helpers ──────────────────────────────────────────────────────────────────

function validateStaffInput({ email, fullName, phone, role }) {
    const errors = [];
    if (!email || !EMAIL_REGEX.test(email))
        errors.push('Email không hợp lệ');
    if (!fullName || fullName.trim().length < 2)
        errors.push('Họ tên phải có ít nhất 2 ký tự');
    if (phone && !PHONE_REGEX.test(phone))
        errors.push('Số điện thoại không hợp lệ (VD: 0912345678)');
    if (role && !VALID_ROLES.includes(role))
        errors.push(`Vai trò phải là một trong: ${VALID_ROLES.join(', ')}`);
    return errors;
}

// ── Controllers ───────────────────────────────────────────────────────────────

/**
 * GET /admin/staff
 * Lấy danh sách tất cả nhân viên (có thể lọc theo role, isActive)
 */
exports.getAllStaff = async (req, res) => {
    try {
        const { role, isActive } = req.query;
        let query = db.collection('users');

        if (role) {
            if (!VALID_ROLES.includes(role))
                return res.status(400).json({ message: `role phải là: ${VALID_ROLES.join(', ')}` });
            query = query.where('role', '==', role);
        }
        if (isActive !== undefined) {
            query = query.where('isActive', '==', isActive === 'true');
        }

        const snapshot = await query.orderBy('createdAt', 'desc').get();
        const staff = snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() }));

        res.status(200).json({ total: staff.length, staff });
    } catch (err) {
        res.status(500).json({ message: 'Lỗi server: ' + err.message });
    }
};

/**
 * GET /admin/staff/:uid
 * Lấy thông tin 1 nhân viên
 */
exports.getStaffById = async (req, res) => {
    try {
        const { uid } = req.params;
        const doc = await db.collection('users').doc(uid).get();

        if (!doc.exists)
            return res.status(404).json({ message: 'Không tìm thấy nhân viên' });

        res.status(200).json({ uid: doc.id, ...doc.data() });
    } catch (err) {
        res.status(500).json({ message: 'Lỗi server: ' + err.message });
    }
};

/**
 * POST /admin/staff
 * Tạo nhân viên mới (admin tạo thay cho staff)
 */
exports.createStaff = async (req, res) => {
    const { email, password, fullName, phone, role = 'staff' } = req.body;

    if (!password)
        return res.status(400).json({ message: 'Thiếu mật khẩu' });
    if (!PASSWORD_REGEX.test(password))
        return res.status(400).json({
            message: 'Mật khẩu phải tối thiểu 8 ký tự, gồm cả chữ và số, không chứa ký tự đặc biệt',
        });

    const errors = validateStaffInput({ email, fullName, phone, role });
    if (errors.length) return res.status(400).json({ message: errors.join('; ') });

    try {
        const userRecord = await auth.createUser({ email, password, displayName: fullName });

        const now = new Date().toISOString();
        await db.collection('users').doc(userRecord.uid).set({
            email,
            fullName: fullName.trim(),
            phone: phone || '',
            role,
            isActive: true,
            photoURL: '',
            createdAt: now,
            updatedAt: now,
        });

        res.status(201).json({
            message: 'Tạo nhân viên thành công',
            user: { uid: userRecord.uid, email, fullName, role },
        });
    } catch (err) {
        if (err.code === 'auth/email-already-exists')
            return res.status(409).json({ message: 'Email đã được sử dụng' });
        res.status(400).json({ message: err.message });
    }
};

/**
 * PUT /admin/staff/:uid
 * Cập nhật thông tin nhân viên (fullName, phone, role, isActive)
 */
exports.updateStaff = async (req, res) => {
    try {
        const { uid } = req.params;
        const { fullName, phone, role, isActive } = req.body;

        const doc = await db.collection('users').doc(uid).get();
        if (!doc.exists)
            return res.status(404).json({ message: 'Không tìm thấy nhân viên' });

        // Không cho admin tự hạ quyền chính mình
        if (uid === req.user.uid && role && role !== 'admin')
            return res.status(403).json({ message: 'Admin không thể tự hạ quyền chính mình' });

        const errors = validateStaffInput({
            email: doc.data().email, // email không đổi → dùng để pass validate
            fullName: fullName ?? doc.data().fullName,
            phone: phone ?? doc.data().phone,
            role: role ?? doc.data().role,
        });
        if (errors.length) return res.status(400).json({ message: errors.join('; ') });

        const updates = { updatedAt: new Date().toISOString() };
        if (fullName  !== undefined) updates.fullName  = fullName.trim();
        if (phone     !== undefined) updates.phone     = phone;
        if (role      !== undefined) updates.role      = role;
        if (isActive  !== undefined) updates.isActive  = Boolean(isActive);

        await db.collection('users').doc(uid).update(updates);

        // Sync displayName trên Firebase Auth nếu đổi fullName
        if (fullName !== undefined)
            await auth.updateUser(uid, { displayName: fullName.trim() });

        res.status(200).json({ message: 'Cập nhật thành công', updates });
    } catch (err) {
        res.status(500).json({ message: 'Lỗi server: ' + err.message });
    }
};

/**
 * DELETE /admin/staff/:uid
 * Xóa mềm (isActive = false) hoặc xóa cứng nếu có ?hard=true
 */
exports.deleteStaff = async (req, res) => {
    try {
        const { uid } = req.params;
        const hard = req.query.hard === 'true';

        if (uid === req.user.uid)
            return res.status(403).json({ message: 'Không thể xóa chính mình' });

        const doc = await db.collection('users').doc(uid).get();
        if (!doc.exists)
            return res.status(404).json({ message: 'Không tìm thấy nhân viên' });

        if (hard) {
            await auth.deleteUser(uid);
            await db.collection('users').doc(uid).delete();
            return res.status(200).json({ message: 'Đã xóa vĩnh viễn nhân viên' });
        }

        await db.collection('users').doc(uid).update({
            isActive: false,
            updatedAt: new Date().toISOString(),
        });
        await auth.updateUser(uid, { disabled: true });

        res.status(200).json({ message: 'Đã vô hiệu hóa nhân viên' });
    } catch (err) {
        res.status(500).json({ message: 'Lỗi server: ' + err.message });
    }
};

/**
 * POST /admin/staff/:uid/reset-password
 * Admin reset mật khẩu cho nhân viên (trường hợp staff quên, không thể tự reset)
 */
exports.adminResetPassword = async (req, res) => {
    try {
        const { uid } = req.params;
        const { newPassword } = req.body;

        if (!newPassword)
            return res.status(400).json({ message: 'Thiếu mật khẩu mới' });
        if (!PASSWORD_REGEX.test(newPassword))
            return res.status(400).json({
                message: 'Mật khẩu phải tối thiểu 8 ký tự, gồm cả chữ và số, không chứa ký tự đặc biệt',
            });

        const doc = await db.collection('users').doc(uid).get();
        if (!doc.exists)
            return res.status(404).json({ message: 'Không tìm thấy nhân viên' });

        await auth.updateUser(uid, { password: newPassword });

        res.status(200).json({ message: 'Reset mật khẩu thành công' });
    } catch (err) {
        res.status(500).json({ message: 'Lỗi server: ' + err.message });
    }
};