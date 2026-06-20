// src/services/qrConfigService.js
const { db } = require('../config/firebase');

const QR_COLLECTION = 'qr-config';
const QR_DOC_ID = 'default';

/**
 * Lấy config ngân hàng từ Firestore (server-side, dùng Admin SDK -> không bị chặn bởi rules)
 */
async function getQrConfig() {
    const snap = await db.collection(QR_COLLECTION).doc(QR_DOC_ID).get();
    if (!snap.exists) return null;
    return snap.data();
}

/**
 * Build link ảnh VietQR từ config + số tiền + nội dung chuyển khoản
 */
function buildVietQrUrl(config, amount, description) {
    const { bankId, accountNo, accountName, template } = config;
    return (
        `https://img.vietqr.io/image/${bankId}-${accountNo}-${template}.png` +
        `?amount=${amount}` +
        `&addInfo=${encodeURIComponent(description)}` +
        `&accountName=${encodeURIComponent(accountName)}`
    );
}

/**
 * Hàm tổng hợp: FE chỉ cần gọi 1 API, truyền amount + orderCode -> nhận về link QR
 */
async function generateOrderQr(orderCode, amount) {
    const config = await getQrConfig();
    if (!config) {
        throw new Error('Chưa cấu hình thông tin ngân hàng (qr-config/default)');
    }
    if (config.isActive === false) {
        throw new Error('Cấu hình QR hiện đang tạm ngưng (isActive = false)');
    }

    const description = `${orderCode} THANH TOAN`;
    const qrUrl = buildVietQrUrl(config, amount, description);

    return {
        qrUrl,
        bankId: config.bankId,
        accountNo: config.accountNo,
        accountName: config.accountName,
    };
}

module.exports = {
    getQrConfig,
    buildVietQrUrl,
    generateOrderQr,
};