// scripts/seedExpiryDiscountSettings.js
//
// CÁCH CHẠY:
//   1. Đặt file này vào thư mục gốc backend (cùng cấp với file dùng require('../config/firebase') bên trong)
//   2. Chạy: node scripts/seedExpiryDiscountSettings.js
//   3. Kiểm tra lại trên Firebase Console: collection 'settings' -> doc 'expiryDiscount'
//   4. Sau khi chạy xong, có thể xoá file này hoặc giữ lại để tái sử dụng khi cần reset về mặc định.

const { db } = require('./src/config/firebase');

const DEFAULT_TIERS = [
    { maxDays: 1, percent: 50 },
    { maxDays: 3, percent: 30 },
    { maxDays: 7, percent: 15 },
];

async function seed() {
    try {
        const docRef = db.collection('settings').doc('expiryDiscount');
        const existing = await docRef.get();

        if (existing.exists) {
            console.log('⚠️  Document settings/expiryDiscount đã tồn tại, dữ liệu hiện tại:');
            console.log(JSON.stringify(existing.data(), null, 2));
            console.log('Nếu muốn ghi đè lại tier mặc định, xoá document trên Console rồi chạy lại script này.');
            process.exit(0);
        }

        await docRef.set({
            tiers: DEFAULT_TIERS,
            updatedAt: new Date().toISOString(),
            updatedBy: null,
        });

        console.log('✅ Đã tạo settings/expiryDiscount thành công với tier mặc định:');
        console.log(JSON.stringify(DEFAULT_TIERS, null, 2));
        process.exit(0);
    } catch (err) {
        console.error('❌ Lỗi khi tạo document:', err.message);
        process.exit(1);
    }
}

seed();