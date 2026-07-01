// src/controllers/settingsController.js
const settingsService = require('../services/settingsService');

/**
 * GET /api/settings/expiry-discount-tiers
 * Xem cấu hình tier giảm giá cận date hiện tại
 */
exports.getExpiryDiscountTiers = async (req, res) => {
    try {
        const tiers = await settingsService.getExpiryDiscountTiers();
        res.json({ success: true, data: tiers });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

/**
 * PUT /api/settings/expiry-discount-tiers
 * Body: { tiers: [{ maxDays: 1, percent: 50 }, ...] }
 * Chỉ admin — nhớ thêm middleware checkRole('admin') ở route
 */
exports.updateExpiryDiscountTiers = async (req, res) => {
    try {
        const { tiers } = req.body;
        const updated = await settingsService.updateExpiryDiscountTiers(tiers, req.user?.uid ?? null);
        res.json({ success: true, message: 'Cập nhật tier giảm giá thành công', data: updated });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
};