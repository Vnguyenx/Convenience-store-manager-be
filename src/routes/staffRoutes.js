// src/routes/staffRoutes.js
const express = require('express');
const router  = express.Router();

const requireRole = require('../middlewares/requireRole');
const verifyToken = require('../middlewares/verifyToken');

const staffCtrl      = require('../controllers/admin/staffController');
const shiftCtrl      = require('../controllers/admin/shiftController');
const attendanceCtrl = require('../controllers/admin/attendanceController');
const payrollCtrl    = require('../controllers/admin/payrollController');

// ─── Tất cả routes đều yêu cầu đăng nhập ────────────────────────────────────
router.use(verifyToken);

// ════════════════════════════════════════════════════════════════════════════
//  QUẢN LÝ NHÂN VIÊN  (chỉ admin)
// ════════════════════════════════════════════════════════════════════════════
router.get   ('/staff',                    requireRole('admin'), staffCtrl.getAllStaff);
router.get   ('/staff/:uid',               requireRole('admin'), staffCtrl.getStaffById);
router.post  ('/staff',                    requireRole('admin'), staffCtrl.createStaff);
router.put   ('/staff/:uid',               requireRole('admin'), staffCtrl.updateStaff);
router.delete('/staff/:uid',               requireRole('admin'), staffCtrl.deleteStaff);
router.post  ('/staff/:uid/reset-password',requireRole('admin'), staffCtrl.adminResetPassword);

// ════════════════════════════════════════════════════════════════════════════
//  CA LÀM VIỆC  (chỉ admin)
// ════════════════════════════════════════════════════════════════════════════
router.get   ('/shifts',                requireRole('admin'), shiftCtrl.getAllShifts);
router.post  ('/shifts',                requireRole('admin'), shiftCtrl.createShift);
router.put   ('/shifts/:id',            requireRole('admin'), shiftCtrl.updateShift);
router.delete('/shifts/:id',            requireRole('admin'), shiftCtrl.deleteShift);

// Phân ca
router.get   ('/shift-assignments',     requireRole('admin'), shiftCtrl.getAssignments);
router.post  ('/shift-assignments',     requireRole('admin'), shiftCtrl.createAssignment);
router.delete('/shift-assignments/:id', requireRole('admin'), shiftCtrl.deleteAssignment);

// ════════════════════════════════════════════════════════════════════════════
//  CHẤM CÔNG
// ════════════════════════════════════════════════════════════════════════════

// Staff: tự chấm công + xem lịch sử bản thân
router.post('/attendance/check-in',  attendanceCtrl.checkIn);
router.put ('/attendance/check-out', attendanceCtrl.checkOut);
router.get ('/attendance/me',        attendanceCtrl.getMyAttendance);

// Admin: xem toàn bộ + chỉnh sửa
router.get   ('/attendance',     requireRole('admin'), attendanceCtrl.getAllAttendance);
router.put   ('/attendance/:id', requireRole('admin'), attendanceCtrl.updateAttendance);
router.delete('/attendance/:id', requireRole('admin'), attendanceCtrl.deleteAttendance);

// ════════════════════════════════════════════════════════════════════════════
//  TÍNH LƯƠNG  (chỉ admin)
// ════════════════════════════════════════════════════════════════════════════
router.get ('/payroll',                        requireRole('admin'), payrollCtrl.getPayrolls);
router.post('/payroll/calculate',              requireRole('admin'), payrollCtrl.calculatePayroll);
router.put ('/payroll/:id',                    requireRole('admin'), payrollCtrl.updatePayroll);

// Config mức lương theo giờ
router.get('/payroll/config',                          requireRole('admin'), payrollCtrl.getPayrollConfigs);
router.put('/payroll/config/:staffUidOrDefault',       requireRole('admin'), payrollCtrl.setPayrollConfig);

module.exports = router;