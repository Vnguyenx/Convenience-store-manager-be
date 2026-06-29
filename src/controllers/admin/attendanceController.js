// src/controllers/admin/attendanceController.js
const { db } = require('../../config/firebase');

// Collection: attendances
// Document: {
//   staffUid: string,
//   assignmentId: string | null,  // liên kết shiftAssignment nếu có
//   date: string,                 "2026-06-22"
//   checkIn: string | null,       ISO timestamp
//   checkOut: string | null,      ISO timestamp
//   hoursWorked: number | null,   tính khi checkout
//   note: string,
//   createdAt: string,
//   updatedAt: string
// }

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
function validateDate(d) { return DATE_REGEX.test(d) && !isNaN(Date.parse(d)); }
function todayVN() {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }); // YYYY-MM-DD
}

// ── Staff: tự chấm công ───────────────────────────────────────────────────────

/**
 * POST /attendance/check-in
 * Staff tự check-in cho hôm nay
 */
const NOTE_MAX_LENGTH = 200;
const ALLOW_EARLY_MINUTES = 15; // phút

// Helper chuyển "HH:mm" thành số phút trong ngày
function timeToMinutes(timeStr) {
    const [h, m] = timeStr.split(':').map(Number);
    return h * 60 + m;
}

// ── Staff: tự chấm công ───────────────────────────────────────────────────────

exports.checkIn = async (req, res) => {
    try {
        const uid  = req.user.uid;
        const date = todayVN();
        const note = req.body.note || '';

        // Validate note
        if (note.length > NOTE_MAX_LENGTH) {
            return res.status(400).json({ message: `Ghi chú không được vượt quá ${NOTE_MAX_LENGTH} ký tự` });
        }

        // Kiểm tra đã check-in hôm nay chưa
        const existing = await db.collection('attendances')
            .where('staffUid', '==', uid)
            .where('date', '==', date)
            .limit(1).get();

        if (!existing.empty)
            return res.status(409).json({ message: 'Bạn đã check-in hôm nay rồi' });

        // ── BẮT BUỘC CÓ PHÂN CA HÔM NAY ──
        const assignSnap = await db.collection('shiftAssignments')
            .where('staffUid', '==', uid)
            .where('date', '==', date)
            .where('status', '==', 'scheduled')
            .limit(1).get();

        if (assignSnap.empty) {
            return res.status(403).json({ message: 'Bạn không có ca làm việc hôm nay, không thể check-in' });
        }

        const assignmentId = assignSnap.docs[0].id;
        const assignmentData = assignSnap.docs[0].data();

        // Lấy thông tin ca làm việc
        const shiftDoc = await db.collection('shifts').doc(assignmentData.shiftId).get();
        if (!shiftDoc.exists) {
            return res.status(404).json({ message: 'Ca làm việc không tồn tại' });
        }
        const shift = shiftDoc.data();

        // Kiểm tra ca có đang hoạt động
        if (shift.isActive === false) {
            return res.status(403).json({ message: 'Ca làm việc đã bị vô hiệu hóa' });
        }

        // ── KIỂM TRA GIỜ CHECK-IN ──
        const startMinutes = timeToMinutes(shift.startTime);
        const endMinutes = timeToMinutes(shift.endTime);

        // Lấy giờ hiện tại theo múi giờ VN
        const nowVN = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));
        const currentMinutes = nowVN.getHours() * 60 + nowVN.getMinutes();

        // Cho phép check-in sớm tối đa 15 phút
        if (currentMinutes < startMinutes - ALLOW_EARLY_MINUTES) {
            return res.status(403).json({
                message: `Chưa đến giờ check-in. Bạn có thể check-in từ ${shift.startTime} (sớm nhất ${ALLOW_EARLY_MINUTES} phút)`
            });
        }

        // Không cho check-in sau giờ kết thúc ca
        if (currentMinutes > endMinutes) {
            return res.status(403).json({
                message: `Ca làm việc đã kết thúc lúc ${shift.endTime}. Không thể check-in`
            });
        }

        // ── TẠO BẢN GHI CHẤM CÔNG ──
        const now = new Date().toISOString();
        const ref = await db.collection('attendances').add({
            staffUid: uid,
            assignmentId,
            date,
            checkIn: now,
            checkOut: null,
            hoursWorked: null,
            note: note,
            createdAt: now,
            updatedAt: now,
        });

        res.status(201).json({ message: 'Check-in thành công', id: ref.id, checkIn: now });
    } catch (err) {
        res.status(500).json({ message: 'Lỗi server: ' + err.message });
    }
};

/**
 * PUT /attendance/check-out
 * Staff tự check-out cho hôm nay
 */
exports.checkOut = async (req, res) => {
    try {
        const uid  = req.user.uid;
        const date = todayVN();
        const note = req.body.note || '';

        if (note.length > NOTE_MAX_LENGTH) {
            return res.status(400).json({ message: `Ghi chú không được vượt quá ${NOTE_MAX_LENGTH} ký tự` });
        }

        const snap = await db.collection('attendances')
            .where('staffUid', '==', uid)
            .where('date', '==', date)
            .limit(1).get();

        if (snap.empty)
            return res.status(404).json({ message: 'Bạn chưa check-in hôm nay' });

        const doc = snap.docs[0];
        const data = doc.data();

        if (data.checkOut)
            return res.status(409).json({ message: 'Bạn đã check-out hôm nay rồi' });

        const now = new Date();
        const checkInTime = new Date(data.checkIn);
        const hoursWorked = parseFloat(
            ((now - checkInTime) / (1000 * 60 * 60)).toFixed(2)
        );

        await doc.ref.update({
            checkOut: now.toISOString(),
            hoursWorked,
            note: req.body.note || data.note,
            updatedAt: now.toISOString(),
        });

        // Cập nhật trạng thái shiftAssignment → completed
        if (data.assignmentId) {
            await db.collection('shiftAssignments').doc(data.assignmentId).update({
                status: 'completed',
                updatedAt: now.toISOString(),
            });
        }

        res.status(200).json({ message: 'Check-out thành công', hoursWorked });
    } catch (err) {
        res.status(500).json({ message: 'Lỗi server: ' + err.message });
    }
};

/**
 * GET /attendance/me
 * Staff xem lịch sử chấm công của bản thân
 * Query: ?from=YYYY-MM-DD&to=YYYY-MM-DD
 */
exports.getMyAttendance = async (req, res) => {
    try {
        const uid = req.user.uid;
        const { from, to } = req.query;

        let query = db.collection('attendances').where('staffUid', '==', uid);
        if (from) {
            if (!validateDate(from)) return res.status(400).json({ message: 'from phải là YYYY-MM-DD' });
            query = query.where('date', '>=', from);
        }
        if (to) {
            if (!validateDate(to)) return res.status(400).json({ message: 'to phải là YYYY-MM-DD' });
            query = query.where('date', '<=', to);
        }

        const snap = await query.orderBy('date', 'desc').get();
        const records = snap.docs.map(d => ({ id: d.id, ...d.data() }));

        const totalHours = records.reduce((sum, r) => sum + (r.hoursWorked || 0), 0);
        res.status(200).json({ total: records.length, totalHours: parseFloat(totalHours.toFixed(2)), records });
    } catch (err) {
        res.status(500).json({ message: 'Lỗi server: ' + err.message });
    }
};

// ── Admin: xem và quản lý chấm công ──────────────────────────────────────────

/**
 * GET /admin/attendance
 * Admin xem toàn bộ hoặc lọc theo staffUid / khoảng ngày
 * Query: ?staffUid=xxx&from=YYYY-MM-DD&to=YYYY-MM-DD
 */
exports.getAllAttendance = async (req, res) => {
    try {
        const { staffUid, from, to } = req.query;
        let query = db.collection('attendances');

        if (staffUid) query = query.where('staffUid', '==', staffUid);
        if (from) {
            if (!validateDate(from)) return res.status(400).json({ message: 'from phải là YYYY-MM-DD' });
            query = query.where('date', '>=', from);
        }
        if (to) {
            if (!validateDate(to)) return res.status(400).json({ message: 'to phải là YYYY-MM-DD' });
            query = query.where('date', '<=', to);
        }

        const snap = await query.orderBy('date', 'desc').get();
        const records = snap.docs.map(d => ({ id: d.id, ...d.data() }));

        // Tổng hợp theo nhân viên
        const summary = {};
        for (const r of records) {
            if (!summary[r.staffUid]) summary[r.staffUid] = { staffUid: r.staffUid, totalHours: 0, days: 0 };
            summary[r.staffUid].totalHours += r.hoursWorked || 0;
            summary[r.staffUid].days++;
        }
        Object.values(summary).forEach(s => { s.totalHours = parseFloat(s.totalHours.toFixed(2)); });

        res.status(200).json({ total: records.length, summary: Object.values(summary), records });
    } catch (err) {
        res.status(500).json({ message: 'Lỗi server: ' + err.message });
    }
};

/**
 * PUT /admin/attendance/:id
 * Admin chỉnh sửa bản ghi chấm công (chỉnh giờ, thêm ghi chú)
 * Body: { checkIn?, checkOut?, note? }
 */
exports.updateAttendance = async (req, res) => {
    try {
        const { id } = req.params;
        const { checkIn, checkOut, note } = req.body;

        const doc = await db.collection('attendances').doc(id).get();
        if (!doc.exists) return res.status(404).json({ message: 'Không tìm thấy bản ghi' });

        const data = doc.data();
        const updates = { updatedAt: new Date().toISOString() };

        if (checkIn  !== undefined) updates.checkIn  = checkIn;
        if (checkOut !== undefined) updates.checkOut = checkOut;
        if (note     !== undefined) updates.note     = note;

        // Tính lại hoursWorked nếu cả 2 có
        const finalIn  = checkIn  ?? data.checkIn;
        const finalOut = checkOut ?? data.checkOut;
        if (finalIn && finalOut) {
            updates.hoursWorked = parseFloat(
                ((new Date(finalOut) - new Date(finalIn)) / (1000 * 60 * 60)).toFixed(2)
            );
        }

        await doc.ref.update(updates);
        res.status(200).json({ message: 'Cập nhật chấm công thành công', updates });
    } catch (err) {
        res.status(500).json({ message: 'Lỗi server: ' + err.message });
    }
};

/**
 * DELETE /admin/attendance/:id
 * Admin xóa bản ghi chấm công sai
 */
exports.deleteAttendance = async (req, res) => {
    try {
        const { id } = req.params;
        const doc = await db.collection('attendances').doc(id).get();
        if (!doc.exists) return res.status(404).json({ message: 'Không tìm thấy bản ghi' });

        await doc.ref.delete();
        res.status(200).json({ message: 'Đã xóa bản ghi chấm công' });
    } catch (err) {
        res.status(500).json({ message: 'Lỗi server: ' + err.message });
    }
};