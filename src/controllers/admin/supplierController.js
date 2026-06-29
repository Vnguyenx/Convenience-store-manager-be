// src/controllers/admin/supplierController.js
const { db } = require('../../config/firebase');

// Collection: suppliers
// {
//   code: string,          "NCC001"
//   name: string,          "Công ty TNHH Coca-Cola VN"
//   phone: string,
//   email: string,
//   address: string,
//   contactPerson: string, tên người liên hệ
//   note: string,
//   isActive: boolean,
//   createdAt: string,
//   updatedAt: string,
// }

const PHONE_REGEX = /^(0|\+84)[0-9]{9}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const NAME_MAX_LENGTH           = 200;
const ADDRESS_MAX_LENGTH        = 300;
const CONTACT_PERSON_MAX_LENGTH = 100;
const NOTE_MAX_LENGTH           = 500;

/**
 * Validate field cơ bản (name/phone/email) — dùng cho cả create và update
 */
function validate({ name, phone, email }) {
    const errors = [];

    if (!name || typeof name !== 'string' || name.trim().length < 2)
        errors.push('Tên nhà cung cấp phải có ít nhất 2 ký tự');
    else if (name.trim().length > NAME_MAX_LENGTH)
        errors.push(`Tên nhà cung cấp không được vượt quá ${NAME_MAX_LENGTH} ký tự`);

    if (phone !== undefined && phone !== null && phone !== '') {
        if (typeof phone !== 'string')
            errors.push('Số điện thoại phải là chuỗi ký tự');
        else if (!PHONE_REGEX.test(phone))
            errors.push('Số điện thoại không hợp lệ (VD: 0912345678)');
    }

    if (email !== undefined && email !== null && email !== '') {
        if (typeof email !== 'string')
            errors.push('Email phải là chuỗi ký tự');
        else if (!EMAIL_REGEX.test(email))
            errors.push('Email không hợp lệ');
    }

    return errors;
}

/**
 * Validate các field tuỳ chọn còn lại (address/contactPerson/note)
 */
function validateOptionalFields({ address, contactPerson, note }) {
    const errors = [];

    if (address !== undefined && address !== null && address !== '') {
        if (typeof address !== 'string')
            errors.push('Địa chỉ phải là chuỗi ký tự');
        else if (address.length > ADDRESS_MAX_LENGTH)
            errors.push(`Địa chỉ không được vượt quá ${ADDRESS_MAX_LENGTH} ký tự`);
    }

    if (contactPerson !== undefined && contactPerson !== null && contactPerson !== '') {
        if (typeof contactPerson !== 'string')
            errors.push('Người liên hệ phải là chuỗi ký tự');
        else if (contactPerson.length > CONTACT_PERSON_MAX_LENGTH)
            errors.push(`Tên người liên hệ không được vượt quá ${CONTACT_PERSON_MAX_LENGTH} ký tự`);
    }

    if (note !== undefined && note !== null && note !== '') {
        if (typeof note !== 'string')
            errors.push('Ghi chú phải là chuỗi ký tự');
        else if (note.length > NOTE_MAX_LENGTH)
            errors.push(`Ghi chú không được vượt quá ${NOTE_MAX_LENGTH} ký tự`);
    }

    return errors;
}

/**
 * Validate isActive (dùng khi update) — chỉ chấp nhận boolean thật,
 * tránh trường hợp truyền chuỗi "false" bị Boolean() ép thành true.
 */
function validateIsActive(isActive) {
    if (isActive === undefined) return null;
    if (typeof isActive !== 'boolean')
        return 'isActive phải là kiểu boolean (true/false)';
    return null;
}

// ── Auto-generate supplier code ───────────────────────────────────────────────
async function generateSupplierCode() {
    const snap = await db.collection('suppliers')
        .orderBy('code', 'desc').limit(1).get();
    if (snap.empty) return 'NCC001';
    const last = snap.docs[0].data().code || 'NCC000';
    const num = parseInt(last.replace('NCC', ''), 10) + 1;
    return `NCC${String(num).padStart(3, '0')}`;
}

/**
 * GET /admin/suppliers
 * Query: ?isActive=true|false&search=xxx
 */
exports.getAllSuppliers = async (req, res) => {
    try {
        const { isActive, search } = req.query;
        let query = db.collection('suppliers').orderBy('createdAt', 'desc');

        if (isActive !== undefined) {
            if (isActive !== 'true' && isActive !== 'false')
                return res.status(400).json({ message: 'isActive phải là "true" hoặc "false"' });
            query = query.where('isActive', '==', isActive === 'true');
        }

        const snap = await query.get();
        let suppliers = snap.docs.map(d => ({ id: d.id, ...d.data() }));

        if (search) {
            const q = search.toLowerCase();
            suppliers = suppliers.filter(s =>
                s.name.toLowerCase().includes(q) ||
                (s.code || '').toLowerCase().includes(q) ||
                (s.phone || '').includes(q) ||
                (s.email || '').toLowerCase().includes(q)
            );
        }

        res.status(200).json({ total: suppliers.length, suppliers });
    } catch (err) {
        res.status(500).json({ message: 'Lỗi server: ' + err.message });
    }
};

/**
 * GET /admin/suppliers/:id
 */
exports.getSupplierById = async (req, res) => {
    try {
        const { id } = req.params;
        if (!id || typeof id !== 'string')
            return res.status(400).json({ message: 'id nhà cung cấp không hợp lệ' });

        const doc = await db.collection('suppliers').doc(id).get();
        if (!doc.exists) return res.status(404).json({ message: 'Không tìm thấy nhà cung cấp' });
        res.status(200).json({ id: doc.id, ...doc.data() });
    } catch (err) {
        res.status(500).json({ message: 'Lỗi server: ' + err.message });
    }
};

/**
 * POST /admin/suppliers
 * Body: { name, phone?, email?, address?, contactPerson?, note? }
 */
exports.createSupplier = async (req, res) => {
    const { name, phone, email, address, contactPerson, note } = req.body;

    const errors = [
        ...validate({ name, phone, email }),
        ...validateOptionalFields({ address, contactPerson, note }),
    ];
    if (errors.length) return res.status(400).json({ message: errors.join('; ') });

    try {
        const code = await generateSupplierCode();
        const now  = new Date().toISOString();
        const ref  = db.collection('suppliers').doc();

        await ref.set({
            code,
            name: name.trim(),
            phone:         phone         || '',
            email:         email         || '',
            address:       address       || '',
            contactPerson: contactPerson || '',
            note:          note          || '',
            isActive: true,
            createdAt: now,
            updatedAt: now,
        });

        res.status(201).json({ message: 'Tạo nhà cung cấp thành công', id: ref.id, code });
    } catch (err) {
        res.status(500).json({ message: 'Lỗi server: ' + err.message });
    }
};

/**
 * PUT /admin/suppliers/:id
 */
exports.updateSupplier = async (req, res) => {
    try {
        const { id } = req.params;
        if (!id || typeof id !== 'string')
            return res.status(400).json({ message: 'id nhà cung cấp không hợp lệ' });

        const doc = await db.collection('suppliers').doc(id).get();
        if (!doc.exists) return res.status(404).json({ message: 'Không tìm thấy nhà cung cấp' });

        const { name, phone, email, address, contactPerson, note, isActive } = req.body;
        const errors = [
            ...validate({
                name:  name  ?? doc.data().name,
                phone: phone ?? doc.data().phone,
                email: email ?? doc.data().email,
            }),
            ...validateOptionalFields({ address, contactPerson, note }),
        ];
        const isActiveError = validateIsActive(isActive);
        if (isActiveError) errors.push(isActiveError);
        if (errors.length) return res.status(400).json({ message: errors.join('; ') });

        const updates = { updatedAt: new Date().toISOString() };
        if (name          !== undefined) updates.name          = name.trim();
        if (phone         !== undefined) updates.phone         = phone;
        if (email         !== undefined) updates.email         = email;
        if (address       !== undefined) updates.address       = address;
        if (contactPerson !== undefined) updates.contactPerson = contactPerson;
        if (note          !== undefined) updates.note          = note;
        if (isActive      !== undefined) updates.isActive      = isActive;

        await doc.ref.update(updates);
        res.status(200).json({ message: 'Cập nhật thành công', updates });
    } catch (err) {
        res.status(500).json({ message: 'Lỗi server: ' + err.message });
    }
};

/**
 * DELETE /admin/suppliers/:id  (xóa mềm)
 */
exports.deleteSupplier = async (req, res) => {
    try {
        const { id } = req.params;
        if (!id || typeof id !== 'string')
            return res.status(400).json({ message: 'id nhà cung cấp không hợp lệ' });

        const doc = await db.collection('suppliers').doc(id).get();
        if (!doc.exists) return res.status(404).json({ message: 'Không tìm thấy nhà cung cấp' });

        await doc.ref.update({ isActive: false, updatedAt: new Date().toISOString() });
        res.status(200).json({ message: 'Đã vô hiệu hóa nhà cung cấp' });
    } catch (err) {
        res.status(500).json({ message: 'Lỗi server: ' + err.message });
    }
};