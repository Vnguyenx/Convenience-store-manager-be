// src/controllers/admin/payrollController.js
const { db } = require('../../config/firebase');

// Collection: payrollConfig
// Document ID: "default" (hoặc theo staffUid để có mức lương riêng)
// {
//   staffUid: string | "default",
//   hourlyRate: number,    VD: 25000 (VNĐ/giờ)
//   updatedAt: string
// }

// Collection: payrolls
// Document: {
//   staffUid: string,
//   month: string,         "2026-06"
//   totalHours: number,
//   hourlyRate: number,
//   baseSalary: number,    totalHours * hourlyRate
//   bonus: number,
//   deduction: number,
//   finalSalary: number,   baseSalary + bonus - deduction
//   status: string,        "draft" | "confirmed" | "paid"
//   note: string,
//   createdAt: string,
//   updatedAt: string
// }

const MONTH_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/;
function validateMonth(m) { return MONTH_REGEX.test(m); }

// ── Config lương ─────────────────────────────────────────────────────────────

/**
 * GET /admin/payroll/config
 * Lấy tất cả cấu hình lương (default + riêng từng staff)
 */
exports.getPayrollConfigs = async (req, res) => {
    try {
        const snap = await db.collection('payrollConfig').get();
        const configs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        res.status(200).json({ configs });
    } catch (err) {
        res.status(500).json({ message: 'Lỗi server: ' + err.message });
    }
};

/**
 * PUT /admin/payroll/config/:staffUidOrDefault
 * Đặt mức lương theo giờ cho 1 nhân viên hoặc mức mặc định
 * Body: { hourlyRate }
 */
exports.setPayrollConfig = async (req, res) => {
    try {
        const { staffUidOrDefault } = req.params;
        const { hourlyRate } = req.body;

        if (hourlyRate === undefined || isNaN(Number(hourlyRate)) || Number(hourlyRate) < 0)
            return res.status(400).json({ message: 'hourlyRate phải là số không âm' });

        // Nếu không phải "default" thì kiểm tra staff có tồn tại không
        if (staffUidOrDefault !== 'default') {
            const staffDoc = await db.collection('users').doc(staffUidOrDefault).get();
            if (!staffDoc.exists)
                return res.status(404).json({ message: 'Không tìm thấy nhân viên' });
        }

        await db.collection('payrollConfig').doc(staffUidOrDefault).set({
            staffUid: staffUidOrDefault,
            hourlyRate: Number(hourlyRate),
            updatedAt: new Date().toISOString(),
        }, { merge: true });

        res.status(200).json({ message: 'Cập nhật cấu hình lương thành công' });
    } catch (err) {
        res.status(500).json({ message: 'Lỗi server: ' + err.message });
    }
};

// ── Tính lương ────────────────────────────────────────────────────────────────

/**
 * POST /admin/payroll/calculate
 * Tính lương tháng cho 1 hoặc tất cả nhân viên từ dữ liệu chấm công
 * Body: { month: "2026-06", staffUid?: "xxx" }
 */
exports.calculatePayroll = async (req, res) => {
    try {
        const { month, staffUid } = req.body;

        if (!month || !validateMonth(month))
            return res.status(400).json({ message: 'month phải có định dạng YYYY-MM' });

        const from = `${month}-01`;
        const [year, mon] = month.split('-').map(Number);
        const lastDay = new Date(year, mon, 0).getDate();
        const to   = `${month}-${String(lastDay).padStart(2, '0')}`;

        // Lấy chấm công trong tháng
        let attQuery = db.collection('attendances')
            .where('date', '>=', from)
            .where('date', '<=', to);
        if (staffUid) attQuery = attQuery.where('staffUid', '==', staffUid);

        const attSnap = await attQuery.get();
        if (attSnap.empty)
            return res.status(200).json({ message: 'Không có dữ liệu chấm công trong tháng này', payrolls: [] });

        // Group theo staffUid
        const hoursMap = {};
        for (const doc of attSnap.docs) {
            const d = doc.data();
            if (!hoursMap[d.staffUid]) hoursMap[d.staffUid] = 0;
            hoursMap[d.staffUid] += d.hoursWorked || 0;
        }

        // Lấy config lương
        const configSnap = await db.collection('payrollConfig').get();
        const configMap = {};
        configSnap.docs.forEach(d => { configMap[d.id] = d.data().hourlyRate; });
        const defaultRate = configMap['default'] ?? 0;

        const now = new Date().toISOString();
        const batch = db.batch();
        const results = [];

        for (const [uid, totalHours] of Object.entries(hoursMap)) {
            const hourlyRate = configMap[uid] ?? defaultRate;
            const baseSalary = parseFloat((totalHours * hourlyRate).toFixed(0));

            // Kiểm tra đã có payroll chưa
            const existing = await db.collection('payrolls')
                .where('staffUid', '==', uid)
                .where('month', '==', month)
                .limit(1).get();

            if (!existing.empty && existing.docs[0].data().status === 'paid') {
                results.push({ staffUid: uid, skipped: true, reason: 'Đã thanh toán' });
                continue;
            }

            const payrollData = {
                staffUid: uid,
                month,
                totalHours: parseFloat(totalHours.toFixed(2)),
                hourlyRate,
                baseSalary,
                bonus: existing.empty ? 0 : (existing.docs[0].data().bonus || 0),
                deduction: existing.empty ? 0 : (existing.docs[0].data().deduction || 0),
                status: 'draft',
                note: '',
                updatedAt: now,
            };
            payrollData.finalSalary = payrollData.baseSalary + payrollData.bonus - payrollData.deduction;

            if (existing.empty) {
                payrollData.createdAt = now;
                const ref = db.collection('payrolls').doc();
                batch.set(ref, payrollData);
                results.push({ staffUid: uid, id: ref.id, ...payrollData });
            } else {
                batch.update(existing.docs[0].ref, payrollData);
                results.push({ staffUid: uid, id: existing.docs[0].id, ...payrollData });
            }
        }

        await batch.commit();
        res.status(200).json({ message: 'Tính lương thành công', month, payrolls: results });
    } catch (err) {
        res.status(500).json({ message: 'Lỗi server: ' + err.message });
    }
};

/**
 * GET /admin/payroll
 * Lấy danh sách bảng lương
 * Query: ?month=2026-06&staffUid=xxx&status=draft|confirmed|paid
 */
exports.getPayrolls = async (req, res) => {
    try {
        const { month, staffUid, status } = req.query;
        let query = db.collection('payrolls');

        if (month) {
            if (!validateMonth(month)) return res.status(400).json({ message: 'month phải là YYYY-MM' });
            query = query.where('month', '==', month);
        }
        if (staffUid) query = query.where('staffUid', '==', staffUid);
        if (status)   query = query.where('status', '==', status);

        const snap = await query.orderBy('month', 'desc').get();
        const payrolls = snap.docs.map(d => ({ id: d.id, ...d.data() }));

        res.status(200).json({ total: payrolls.length, payrolls });
    } catch (err) {
        res.status(500).json({ message: 'Lỗi server: ' + err.message });
    }
};

/**
 * PUT /admin/payroll/:id
 * Admin chỉnh bonus, deduction, status, note
 * Body: { bonus?, deduction?, status?, note? }
 */
exports.updatePayroll = async (req, res) => {
    try {
        const { id } = req.params;
        const { bonus, deduction, status, note } = req.body;

        const VALID_STATUSES = ['draft', 'confirmed', 'paid'];
        if (status && !VALID_STATUSES.includes(status))
            return res.status(400).json({ message: `status phải là: ${VALID_STATUSES.join(', ')}` });

        const doc = await db.collection('payrolls').doc(id).get();
        if (!doc.exists) return res.status(404).json({ message: 'Không tìm thấy bảng lương' });

        const current = doc.data();
        if (current.status === 'paid' && status !== 'paid')
            return res.status(409).json({ message: 'Không thể chỉnh sửa bảng lương đã thanh toán' });

        const newBonus     = bonus     !== undefined ? Number(bonus)     : current.bonus;
        const newDeduction = deduction !== undefined ? Number(deduction) : current.deduction;

        const updates = {
            bonus: newBonus,
            deduction: newDeduction,
            finalSalary: current.baseSalary + newBonus - newDeduction,
            updatedAt: new Date().toISOString(),
        };
        if (status !== undefined) updates.status = status;
        if (note   !== undefined) updates.note   = note;

        await doc.ref.update(updates);
        res.status(200).json({ message: 'Cập nhật bảng lương thành công', updates });
    } catch (err) {
        res.status(500).json({ message: 'Lỗi server: ' + err.message });
    }
};