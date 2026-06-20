// src/controllers/orderController.js
const orderService = require('../services/orderService');

/**
 * POST /api/orders
 * Body: { items, subtotal, coupon, couponDiscount, total, paymentMethod, customerNote }
 * Yêu cầu: đã verifyToken -> req.user chứa { uid, role }
 */
async function createOrder(req, res) {
    try {
        const { items, subtotal, coupon, couponDiscount, total, paymentMethod, customerNote } = req.body;

        const order = await orderService.createOrder({
            items,
            subtotal,
            coupon,
            couponDiscount,
            total,
            paymentMethod,
            customerNote,
            cashierUID: req.user?.uid || 'anonymous',
        });

        return res.status(201).json({ success: true, data: order });
    } catch (err) {
        console.error('createOrder error:', err.message);
        return res.status(400).json({ success: false, message: err.message });
    }
}

/**
 * GET /api/orders
 * Query: ?status=completed&paymentMethod=cash&cashierUID=xxx
 */
async function getOrders(req, res) {
    try {
        const { status, paymentMethod, cashierUID } = req.query;
        const orders = await orderService.getOrders({ status, paymentMethod, cashierUID });
        return res.status(200).json({ success: true, data: orders });
    } catch (err) {
        console.error('getOrders error:', err.message);
        return res.status(500).json({ success: false, message: 'Lỗi server khi lấy danh sách đơn hàng' });
    }
}

/**
 * GET /api/orders/:orderCode
 */
async function getOrderById(req, res) {
    try {
        const { orderCode } = req.params;
        const order = await orderService.getOrderById(orderCode);
        if (!order) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy đơn hàng' });
        }
        return res.status(200).json({ success: true, data: order });
    } catch (err) {
        console.error('getOrderById error:', err.message);
        return res.status(500).json({ success: false, message: 'Lỗi server' });
    }
}

/**
 * PUT /api/orders/:orderCode
 * Body: các field được phép sửa (items, total, customerNote, status...)
 */
async function updateOrder(req, res) {
    try {
        const { orderCode } = req.params;
        const updated = await orderService.updateOrder(orderCode, req.body);
        return res.status(200).json({ success: true, data: updated });
    } catch (err) {
        console.error('updateOrder error:', err.message);
        return res.status(400).json({ success: false, message: err.message });
    }
}

/**
 * PATCH /api/orders/:orderCode/cancel
 * Body: { reason }
 * Chỉ admin được hủy đơn (check ở route bằng requireRole)
 */
async function cancelOrder(req, res) {
    try {
        const { orderCode } = req.params;
        const { reason } = req.body;
        const cancelled = await orderService.cancelOrder(orderCode, reason);
        return res.status(200).json({ success: true, data: cancelled });
    } catch (err) {
        console.error('cancelOrder error:', err.message);
        return res.status(400).json({ success: false, message: err.message });
    }
}

/**
 * DELETE /api/orders/:orderCode
 * Chỉ admin, hạn chế dùng (xóa cứng)
 */
async function deleteOrder(req, res) {
    try {
        const { orderCode } = req.params;
        const result = await orderService.deleteOrder(orderCode);
        return res.status(200).json({ success: true, data: result });
    } catch (err) {
        console.error('deleteOrder error:', err.message);
        return res.status(400).json({ success: false, message: err.message });
    }
}

module.exports = {
    createOrder,
    getOrders,
    getOrderById,
    updateOrder,
    cancelOrder,
    deleteOrder,
};