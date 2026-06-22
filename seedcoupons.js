const { db } = require('./src/config/firebase');

// Helper: tạo ngày ISO từ hôm nay + số ngày (âm = ngày trong quá khứ)
function addDays(days) {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d.toISOString().split('T')[0]; // yyyy-mm-dd
}

const coupons = [
    {
        code: 'SALE10',
        type: 'percent',
        value: 10,
        description: 'Giảm 10% cho đơn từ 100.000đ, tối đa 50.000đ',
        minOrderValue: 100000,
        maxDiscount: 50000,
        usageLimit: 100,
        usedCount: 0,
        startDate: addDays(0),
        expiryDate: addDays(30),
        isActive: true,
    },
    {
        code: 'GIAM5K',
        type: 'fixed',
        value: 5000,
        description: 'Giảm trực tiếp 5.000đ cho mọi đơn hàng',
        minOrderValue: 0,
        maxDiscount: null,
        usageLimit: null, // không giới hạn số lần dùng
        usedCount: 0,
        startDate: addDays(0),
        expiryDate: addDays(60),
        isActive: true,
    },
    {
        code: 'VIP20',
        type: 'percent',
        value: 20,
        description: 'Giảm 20% cho đơn từ 300.000đ, tối đa 100.000đ',
        minOrderValue: 300000,
        maxDiscount: 100000,
        usageLimit: 50,
        usedCount: 0,
        startDate: addDays(0),
        expiryDate: addDays(15),
        isActive: true,
    },
    {
        code: 'SAPRAMAT',
        type: 'fixed',
        value: 10000,
        description: 'Mã sắp hết hạn (test case hết hạn)',
        minOrderValue: 0,
        maxDiscount: null,
        usageLimit: null,
        usedCount: 0,
        startDate: addDays(-10),
        expiryDate: addDays(-1), // đã hết hạn
        isActive: true,
    },
    {
        code: 'TAMKHOA',
        type: 'percent',
        value: 15,
        description: 'Mã đang bị khoá (test case isActive=false)',
        minOrderValue: 0,
        maxDiscount: 30000,
        usageLimit: 20,
        usedCount: 0,
        startDate: addDays(0),
        expiryDate: addDays(30),
        isActive: false, // không thể áp dụng dù còn hạn
    },
];

async function seedCoupons() {
    for (const c of coupons) {
        try {
            // Dùng auto-ID của Firestore cho document, nhưng lưu lại chính ID đó vào field "id"
            const ref = db.collection('coupons').doc();
            await ref.set({
                ...c,
                id: ref.id,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            });

            console.log(`✅ Tạo coupon thành công:`, c.code, '- docId:', ref.id);
        } catch (err) {
            console.error(`❌ Lỗi tạo coupon ${c.code}:`, err.message);
        }
    }
    process.exit(0);
}

seedCoupons();