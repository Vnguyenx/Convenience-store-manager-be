// src/routes/orderRoutes.js
const express = require('express');
const router = express.Router();

const orderController = require('../controllers/orderController');
const verifyToken = require('../middlewares/verifyToken');
const requireRole = require('../middlewares/requireRole');

// Tất cả route order đều cần đăng nhập
router.use(verifyToken);

// Tạo đơn hàng - admin & staff đều được (staff bán hàng tại quầy)
router.post('/', orderController.createOrder);

// Xem danh sách đơn hàng - admin & staff
router.get('/', orderController.getOrders);

// Xem chi tiết 1 đơn - admin & staff
router.get('/:orderCode', orderController.getOrderById);

// Sửa đơn hàng (ví dụ sửa note, items trước khi in hóa đơn...) - admin & staff
router.put('/:orderCode', orderController.updateOrder);

// Hủy đơn hàng - chỉ admin (theo bảng độ ưu tiên: "Trả hàng/Đổi hàng" -> Duyệt do admin)
router.patch('/:orderCode/cancel', requireRole('admin'), orderController.cancelOrder);

// Xóa cứng đơn hàng - chỉ admin, hạn chế dùng
router.delete('/:orderCode', requireRole('admin'), orderController.deleteOrder);

module.exports = router;