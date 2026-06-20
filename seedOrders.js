const { db } = require('./src/config/firebase');

function daysAgo(days) {
    const d = new Date();
    d.setDate(d.getDate() - days);
    return d.toISOString();
}

const orders = [
    {
        orderCode: 'DH00001',
        status: 'completed',
        paymentMethod: 'cash',
        cashierUID: 'seed',
        subtotal: 67000,
        couponDiscount: 0,
        total: 67000,
        coupon: null,
        items: [
            { id: 'SP0001', name: 'Coca-Cola lon 330ml',          unitPrice: 10000, discountPrice: null,  quantity: 2 },
            { id: 'SP0006', name: 'Mì gói Hảo Hảo tôm chua cay', unitPrice: 5000,  discountPrice: null,  quantity: 5 },
            { id: 'SP0005', name: 'Sữa chua uống Yakult 5 chai',  unitPrice: 25000, discountPrice: 22000, quantity: 1 },
        ],
        createdAt: daysAgo(5),
    },
    {
        orderCode: 'DH00002',
        status: 'completed',
        paymentMethod: 'qr',
        cashierUID: 'seed',
        subtotal: 45000,
        couponDiscount: 4500,
        total: 40500,
        coupon: { code: 'SALE10', type: 'percent', value: 10 },
        items: [
            { id: 'SP0003', name: 'Trà xanh Không Độ 500ml',   unitPrice: 12000, discountPrice: null,  quantity: 2 },
            { id: 'SP0008', name: 'Bánh quy Cosy bơ sữa 270g', unitPrice: 21000, discountPrice: 18000, quantity: 1 },
        ],
        createdAt: daysAgo(4),
    },
    {
        orderCode: 'DH00003',
        status: 'completed',
        paymentMethod: 'vnpay',
        cashierUID: 'seed',
        subtotal: 31000,
        couponDiscount: 5000,
        total: 26000,
        coupon: { code: 'GIAM5K', type: 'fixed', value: 5000 },
        items: [
            { id: 'SP0004', name: 'Sữa tươi Vinamilk có đường 220ml', unitPrice: 8000,  discountPrice: null, quantity: 2 },
            { id: 'SP0007', name: 'Mì ly Omachi xốt bò hầm',          unitPrice: 13000, discountPrice: null, quantity: 1 },
        ],
        createdAt: daysAgo(3),
    },
    {
        orderCode: 'DH00004',
        status: 'completed',
        paymentMethod: 'cash',
        cashierUID: 'seed',
        subtotal: 19000,
        couponDiscount: 0,
        total: 19000,
        coupon: null,
        items: [
            { id: 'SP0002', name: 'Pepsi lon 330ml',              unitPrice: 10000, discountPrice: 9000, quantity: 1 },
            { id: 'SP0006', name: 'Mì gói Hảo Hảo tôm chua cay', unitPrice: 5000,  discountPrice: null, quantity: 2 },
        ],
        createdAt: daysAgo(2),
    },
    {
        orderCode: 'DH00005',
        status: 'cancelled',
        paymentMethod: 'cash',
        cashierUID: 'seed',
        subtotal: 22000,
        couponDiscount: 0,
        total: 22000,
        coupon: null,
        items: [
            { id: 'SP0005', name: 'Sữa chua uống Yakult 5 chai', unitPrice: 25000, discountPrice: 22000, quantity: 1 },
        ],
        createdAt: daysAgo(1),
    },
    {
        orderCode: 'DH00006',
        status: 'completed',
        paymentMethod: 'cash',
        cashierUID: 'seed',
        subtotal: 83000,
        couponDiscount: 0,
        total: 83000,
        coupon: null,
        items: [
            { id: 'SP0011', name: 'Nước suối Aquafina 500ml',      unitPrice: 6000,  discountPrice: null, quantity: 4 },
            { id: 'SP0020', name: 'Bia Tiger lon 330ml',            unitPrice: 17000, discountPrice: null, quantity: 3 },
            { id: 'SP0010', name: "Snack khoai tây Lay's vị muối", unitPrice: 13000, discountPrice: null, quantity: 1 },
        ],
        createdAt: daysAgo(0),
    },
];

async function seedOrders() {
    let count = 0;

    for (const order of orders) {
        try {
            // Dùng orderCode làm document ID để tránh trùng lặp khi chạy lại
            await db.collection('orders').doc(order.orderCode).set({
                ...order,
                updatedAt: new Date().toISOString(),
            });

            console.log(`✅ Tạo đơn hàng thành công:`, order.orderCode, '-', order.paymentMethod, '-', order.total.toLocaleString('vi-VN') + 'đ');
            count++;
        } catch (err) {
            console.error(`❌ Lỗi tạo đơn ${order.orderCode}:`, err.message);
        }
    }

    console.log(`\nSeed xong: ${count}/${orders.length} đơn hàng`);
    process.exit(0);
}

seedOrders();