// src/controllers/admin/shiftController.js
const { db } = require('../../config/firebase');

// Collection: shifts
// Document: {
//   title: string,         "Ca sáng"
//   startTime: string,     "07:00"
//   endTime: string,       "12:00"
//   isActive: boolean,
//   createdAt: string,
//   updatedAt: string
// }

// Collection: shiftAssignments
// Document: {
//   shiftId: string,
//   staffUid: string,
//   date: string,          "2026-06-22"  (YYYY-MM-DD)
//   status: string,        "scheduled" | "completed" | "absent"
//   createdAt: string,
//   updatedAt: string
// }

const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function validateTime(t) { return TIME_REGEX.test(t); }
function validateDate(d) { return DATE_REGEX.test(d) && !isNaN(Date.parse(d)); }

// ── Ca làm việc (Shifts) ─────────────────────────────────────────────────────

/**
 * GET /admin/shifts
 */
exports.getAllShifts = async (req, res) => {
    try {
        const snapshot = await db.collection('shifts').orderBy('startTime').get();
        const shifts = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        res.status(200).json({ total: shifts.length, shifts });
    } catch (err) {
        res.status(500).json({ message: 'Lỗi server: ' + err.message });
    }
};

/**
 * POST /admin/shifts
 * Body: { title, startTime, endTime }
 */
exports.createShift = async (req, res) => {
    const { title, startTime, endTime } = req.body;

    if (!title || !startTime || !endTime)
        return res.status(400).json({ message: 'Thiếu title, startTime hoặc endTime' });
    if (!validateTime(startTime) || !validateTime(endTime))
        return res.status(400).json({ message: 'Thời gian phải có định dạng HH:mm (VD: 07:00)' });
    if (startTime >= endTime)
        return res.status(400).json({ message: 'startTime phải trước endTime' });

    try {
        const now = new Date().toISOString();
        const ref = await db.collection('shifts').add({
            title: title.trim(),
            startTime,
            endTime,
            isActive: true,
            createdAt: now,
            updatedAt: now,
        });
        res.status(201).json({ message: 'Tạo ca thành công', id: ref.id });
    } catch (err) {
        res.status(500).json({ message: 'Lỗi server: ' + err.message });
    }
};

/**
 * PUT /admin/shifts/:id
 */
exports.updateShift = async (req, res) => {
    try {
        const { id } = req.params;
        const { title, startTime, endTime, isActive } = req.body;

        const doc = await db.collection('shifts').doc(id).get();
        if (!doc.exists) return res.status(404).json({ message: 'Không tìm thấy ca' });

        const current = doc.data();
        const newStart = startTime ?? current.startTime;
        const newEnd   = endTime   ?? current.endTime;

        if (!validateTime(newStart) || !validateTime(newEnd))
            return res.status(400).json({ message: 'Thời gian phải có định dạng HH:mm' });
        if (newStart >= newEnd)
            return res.status(400).json({ message: 'startTime phải trước endTime' });

        const updates = { updatedAt: new Date().toISOString() };
        if (title     !== undefined) updates.title     = title.trim();
        if (startTime !== undefined) updates.startTime = startTime;
        if (endTime   !== undefined) updates.endTime   = endTime;
        if (isActive  !== undefined) updates.isActive  = Boolean(isActive);

        await db.collection('shifts').doc(id).update(updates);
        res.status(200).json({ message: 'Cập nhật ca thành công', updates });
    } catch (err) {
        res.status(500).json({ message: 'Lỗi server: ' + err.message });
    }
};

/**
 * DELETE /admin/shifts/:id
 */
exports.deleteShift = async (req, res) => {
    try {
        const { id } = req.params;
        const doc = await db.collection('shifts').doc(id).get();
        if (!doc.exists) return res.status(404).json({ message: 'Không tìm thấy ca' });

        // Kiểm tra có assignment chưa hoàn thành không
        const pendingSnap = await db.collection('shiftAssignments')
            .where('shiftId', '==', id)
            .where('status', '==', 'scheduled')
            .limit(1)
            .get();

        if (!pendingSnap.empty)
            return res.status(409).json({ message: 'Ca này còn phân công chưa hoàn thành, không thể xóa' });

        await db.collection('shifts').doc(id).delete();
        res.status(200).json({ message: 'Đã xóa ca' });
    } catch (err) {
        res.status(500).json({ message: 'Lỗi server: ' + err.message });
    }
};

// ── Phân ca (Shift Assignments) ───────────────────────────────────────────────

/**
 * GET /admin/shift-assignments
 * Query: ?date=YYYY-MM-DD  &staffUid=xxx  &shiftId=xxx
 */
exports.getAssignments = async (req, res) => {
    try {
        const { date, staffUid, shiftId } = req.query;
        let query = db.collection('shiftAssignments');

        if (date) {
            if (!validateDate(date))
                return res.status(400).json({ message: 'date phải có định dạng YYYY-MM-DD' });
            query = query.where('date', '==', date);
        }
        if (staffUid) query = query.where('staffUid', '==', staffUid);
        if (shiftId)  query = query.where('shiftId',  '==', shiftId);

        const snapshot = await query.orderBy('date', 'desc').get();
        const assignments = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));

        res.status(200).json({ total: assignments.length, assignments });
    } catch (err) {
        res.status(500).json({ message: 'Lỗi server: ' + err.message });
    }
};

/**
 * POST /admin/shift-assignments
 * Body: { shiftId, staffUid, date }
 */
exports.createAssignment = async (req, res) => {
    const { shiftId, staffUid, date } = req.body;

    if (!shiftId || !staffUid || !date)
        return res.status(400).json({ message: 'Thiếu shiftId, staffUid hoặc date' });
    if (!validateDate(date))
        return res.status(400).json({ message: 'date phải có định dạng YYYY-MM-DD' });

    try {
        // Kiểm tra shift và staff tồn tại
        const [shiftDoc, staffDoc] = await Promise.all([
            db.collection('shifts').doc(shiftId).get(),
            db.collection('users').doc(staffUid).get(),
        ]);
        if (!shiftDoc.exists)  return res.status(404).json({ message: 'Không tìm thấy ca làm việc' });
        if (!staffDoc.exists)  return res.status(404).json({ message: 'Không tìm thấy nhân viên' });
        if (!staffDoc.data().isActive) return res.status(400).json({ message: 'Nhân viên đã bị vô hiệu hóa' });

        // Kiểm tra trùng ca trong ngày
        const dupSnap = await db.collection('shiftAssignments')
            .where('shiftId',  '==', shiftId)
            .where('staffUid', '==', staffUid)
            .where('date',     '==', date)
            .limit(1).get();
        if (!dupSnap.empty)
            return res.status(409).json({ message: 'Nhân viên đã được phân ca này trong ngày' });

        const now = new Date().toISOString();
        const ref = await db.collection('shiftAssignments').add({
            shiftId, staffUid, date,
            status: 'scheduled',
            createdAt: now, updatedAt: now,
        });

        res.status(201).json({ message: 'Phân ca thành công', id: ref.id });
    } catch (err) {
        res.status(500).json({ message: 'Lỗi server: ' + err.message });
    }
};

/**
 * DELETE /admin/shift-assignments/:id
 */
exports.deleteAssignment = async (req, res) => {
    try {
        const { id } = req.params;
        const doc = await db.collection('shiftAssignments').doc(id).get();
        if (!doc.exists) return res.status(404).json({ message: 'Không tìm thấy phân ca' });
        if (doc.data().status !== 'scheduled')
            return res.status(409).json({ message: 'Chỉ xóa được phân ca ở trạng thái "scheduled"' });

        await db.collection('shiftAssignments').doc(id).delete();
        res.status(200).json({ message: 'Đã xóa phân ca' });
    } catch (err) {
        res.status(500).json({ message: 'Lỗi server: ' + err.message });
    }
};