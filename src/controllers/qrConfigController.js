// src/controllers/qrConfigController.js
const qrConfigService = require('../services/qrConfigService');

/**
 * GET /api/qr-config
 * Trả về config thô (dùng nếu FE cần hiển thị tên NH, số TK riêng)
 */
async function getConfig(req, res) {
    try {
        const config = await qrConfigService.getQrConfig();
        if (!config) {
            return res.status(404).json({ success: false, message: 'Chưa cấu hình thông tin ngân hàng' });
        }
        return res.status(200).json({ success: true, data: config });
    } catch (err) {
        console.error('getConfig error:', err.message);
        return res.status(500).json({ success: false, message: 'Lỗi server' });
    }
}

/**
 * POST /api/qr-config/generate
 * Body: { orderCode, amount }
 * Trả về link ảnh QR đã build sẵn -> FE chỉ cần <img src={qrUrl} />
 */
async function generateQr(req, res) {
    try {
        const { orderCode, amount } = req.body;

        if (!orderCode || !amount) {
            return res.status(400).json({ success: false, message: 'Thiếu orderCode hoặc amount' });
        }

        const result = await qrConfigService.generateOrderQr(orderCode, Number(amount));
        return res.status(200).json({ success: true, data: result });
    } catch (err) {
        console.error('generateQr error:', err.message);
        return res.status(400).json({ success: false, message: err.message });
    }
}

module.exports = {
    getConfig,
    generateQr,
};