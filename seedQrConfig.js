// seedQrConfig.js
// Chạy: node seedQrConfig.js
// Tạo collection "qr-config" chứa thông tin ngân hàng để hiển thị QR thanh toán

const { db } = require('./src/config/firebase');

async function seedQrConfig() {
    try {
        await db.collection('qr-config').doc('default').set({
            bankId: 'BIDV',                    // Mã ngân hàng theo VietQR (MB, VCB, TCB, ACB...)
            accountNo: '6150729528',         // Số tài khoản
            accountName: 'NGUYEN HOANG ANH VU',     // Tên người thụ hưởng (IN HOA, không dấu)
            template: 'compact2',            // compact | compact2 | qr_only | print
            isActive: true,
            updatedAt: new Date().toISOString(),
        });

        console.log('✅ Tạo qr-config/default thành công');
    } catch (err) {
        console.error('❌ Lỗi:', err.message);
    }
    process.exit(0);
}

seedQrConfig();