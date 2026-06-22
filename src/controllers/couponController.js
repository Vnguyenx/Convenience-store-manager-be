const couponService = require('../services/couponService');

/**
 * GET /api/coupons
 * Lấy danh sách coupon (mặc định chỉ active)
 * Staff & Admin đều dùng
 */
exports.getCoupons = async (req, res) => {
    try {
        const onlyActive = req.query.active !== 'false'; // mặc định true
        const coupons = await couponService.getCoupons(onlyActive);
        res.json({ success: true, data: coupons });
    } catch (error) {
        console.error('Lỗi lấy coupon:', error);
        res.status(500).json({ success: false, message: 'Lỗi server' });
    }
};

/**
 * GET /api/coupons/:id
 * Lấy chi tiết coupon
 */
exports.getCouponById = async (req, res) => {
    try {
        const { id } = req.params;
        const coupon = await couponService.getCouponById(id);
        if (!coupon) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy coupon' });
        }
        res.json({ success: true, data: coupon });
    } catch (error) {
        console.error('Lỗi lấy coupon:', error);
        res.status(500).json({ success: false, message: 'Lỗi server' });
    }
};

/**
 * POST /api/coupons
 * Tạo coupon mới (chỉ admin)
 */
exports.createCoupon = async (req, res) => {
    try {
        const data = req.body;
        // Kiểm tra các trường bắt buộc
        if (!data.code || !data.type || data.value === undefined) {
            return res.status(400).json({ success: false, message: 'Thiếu code, type hoặc value' });
        }
        // Kiểm tra trùng code
        const existing = await couponService.getCoupons(false);
        if (existing.some(c => c.code.toUpperCase() === data.code.toUpperCase().trim())) {
            return res.status(400).json({ success: false, message: 'Mã coupon đã tồn tại' });
        }
        const newCoupon = await couponService.createCoupon(data);
        res.status(201).json({ success: true, data: newCoupon });
    } catch (error) {
        console.error('Lỗi tạo coupon:', error);
        res.status(500).json({ success: false, message: 'Lỗi server' });
    }
};

/**
 * PUT /api/coupons/:id
 * Cập nhật coupon (chỉ admin)
 */
exports.updateCoupon = async (req, res) => {
    try {
        const { id } = req.params;
        const data = req.body;
        const updated = await couponService.updateCoupon(id, data);
        if (!updated) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy coupon' });
        }
        res.json({ success: true, data: updated });
    } catch (error) {
        console.error('Lỗi cập nhật coupon:', error);
        res.status(500).json({ success: false, message: 'Lỗi server' });
    }
};

/**
 * DELETE /api/coupons/:id
 * Xóa coupon (chỉ admin)
 */
exports.deleteCoupon = async (req, res) => {
    try {
        const { id } = req.params;
        const deleted = await couponService.deleteCoupon(id);
        if (!deleted) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy coupon' });
        }
        res.json({ success: true, message: 'Xóa thành công' });
    } catch (error) {
        console.error('Lỗi xóa coupon:', error);
        res.status(500).json({ success: false, message: 'Lỗi server' });
    }
};