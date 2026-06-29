// seedInventoryData.js  (chạy từ root: node seedInventoryData.js)
const { db } = require('./src/config/firebase');

// ── Helpers ───────────────────────────────────────────────────────────────────
function addDays(days) {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d.toISOString().split('T')[0];
}

// ── 1. NHÀ CUNG CẤP ──────────────────────────────────────────────────────────
const suppliers = [
    {
        code: 'NCC001',
        name: 'Công ty TNHH Nước Giải Khát Coca-Cola Việt Nam',
        phone: '0281234567',
        email: 'order@coca-cola.vn',
        address: 'KCN Việt Nam Singapore, Bình Dương',
        contactPerson: 'Nguyễn Minh Tuấn',
        note: 'Đặt hàng tối thiểu 200 thùng, giao trong 3 ngày',
        isActive: true,
    },
    {
        code: 'NCC002',
        name: 'Công ty CP Hàng Tiêu Dùng Masan',
        phone: '0289876543',
        email: 'supply@masan.vn',
        address: '289 Trần Hưng Đạo, Q.1, TP.HCM',
        contactPerson: 'Trần Thị Lan',
        note: 'Cung cấp mì gói Omachi, Hảo Hảo',
        isActive: true,
    },
    {
        code: 'NCC003',
        name: 'Công ty TNHH Vinamilk',
        phone: '0283456789',
        email: 'kd@vinamilk.com.vn',
        address: '10 Tân Trào, Q.7, TP.HCM',
        contactPerson: 'Lê Văn Bình',
        note: 'Sản phẩm sữa, giao hàng 2 lần/tuần',
        isActive: true,
    },
    {
        code: 'NCC004',
        name: 'Công ty TNHH TM Bách Hóa Xanh',
        phone: '0284567890',
        email: 'nhaphang@bachhoaxanh.vn',
        address: '221 Đinh Tiên Hoàng, Q.Bình Thạnh, TP.HCM',
        contactPerson: 'Phạm Quốc Cường',
        note: 'Hóa phẩm gia dụng, đồ dùng thiết yếu',
        isActive: true,
    },
    {
        code: 'NCC005',
        name: 'Công ty TNHH Sabeco (Bia Sài Gòn)',
        phone: '0285678901',
        email: 'trade@sabeco.com.vn',
        address: '6 Hai Bà Trưng, Q.1, TP.HCM',
        contactPerson: 'Hoàng Văn Dũng',
        note: 'Bia Tiger, Bia Sài Gòn',
        isActive: true,
    },
    {
        code: 'NCC006',
        name: 'Hộ kinh doanh Trứng Gà Sạch Miền Tây',
        phone: '0906789012',
        email: '',
        address: 'Xã An Bình, Huyện Long Hồ, Vĩnh Long',
        contactPerson: 'Nguyễn Văn Sáu',
        note: 'Trứng gà ta tươi, giao 3 ngày/lần',
        isActive: false, // test case ngừng hợp tác
    },
];

// ── 2. PHIẾU KIỂM KÊ ─────────────────────────────────────────────────────────
// Lấy tất cả products từ Firestore để tạo items

async function seedSuppliers() {
    console.log('\n🏭 Seed SUPPLIERS...');
    for (const s of suppliers) {
        try {
            const ref = db.collection('suppliers').doc();
            const now = new Date().toISOString();
            await ref.set({ ...s, createdAt: now, updatedAt: now });
            console.log(`  ✅ ${s.code} - ${s.name}`);
        } catch (err) {
            console.error(`  ❌ Lỗi tạo supplier ${s.code}:`, err.message);
        }
    }
}

async function seedInventoryChecks() {
    console.log('\n📋 Seed INVENTORY CHECKS...');

    // Lấy tất cả products
    const productsSnap = await db.collection('products').get();
    if (productsSnap.empty) {
        console.log('  ⚠️  Không có sản phẩm nào. Hãy chạy seedproducts.js trước.');
        return;
    }
    const products = productsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    const now = new Date().toISOString();

    // Phiếu 1: Đã xác nhận tháng trước
    {
        const checkRef = db.collection('inventoryChecks').doc();
        await checkRef.set({
            checkCode: `KK${new Date().getFullYear()}-001`,
            note: 'Kiểm kê cuối tháng trước',
            status: 'confirmed',
            checkedBy: 'seed-admin',
            confirmedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
            createdAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(),
            updatedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
        });

        const batch = db.batch();
        for (const p of products) {
            const actual = Math.max(0, (p.stockQuantity ?? 0) + Math.floor(Math.random() * 5 - 2));
            const itemRef = checkRef.collection('inventoryCheckItems').doc();
            batch.set(itemRef, {
                productId:      p.id,
                productCode:    p.code || p.ID || p.id,
                productName:    p.name,
                systemQuantity: (p.stockQuantity ?? 0) + Math.floor(Math.random() * 3),
                actualQuantity: actual,
                difference:     actual - ((p.stockQuantity ?? 0) + Math.floor(Math.random() * 3)),
                note: '',
            });
        }
        await batch.commit();
        console.log(`  ✅ KK${new Date().getFullYear()}-001 [confirmed] - ${products.length} sản phẩm`);
    }

    // Phiếu 2: Draft (đang kiểm kê) - chỉ 1 số sản phẩm đã nhập
    {
        const checkRef = db.collection('inventoryChecks').doc();
        await checkRef.set({
            checkCode: `KK${new Date().getFullYear()}-002`,
            note: 'Kiểm kê đột xuất — phát hiện lệch tồn kho',
            status: 'draft',
            checkedBy: 'seed-admin',
            confirmedAt: null,
            createdAt: now,
            updatedAt: now,
        });

        const batch = db.batch();
        for (let i = 0; i < products.length; i++) {
            const p = products[i];
            // Chỉ 1/3 đầu đã nhập actualQuantity
            const hasActual = i < Math.ceil(products.length / 3);
            const actual    = hasActual
                ? Math.max(0, (p.stockQuantity ?? 0) + Math.floor(Math.random() * 6 - 3))
                : null;
            const itemRef = checkRef.collection('inventoryCheckItems').doc();
            batch.set(itemRef, {
                productId:      p.id,
                productCode:    p.code || p.ID || p.id,
                productName:    p.name,
                systemQuantity: p.stockQuantity ?? 0,
                actualQuantity: actual,
                difference:     actual !== null ? actual - (p.stockQuantity ?? 0) : null,
                note: '',
            });
        }
        await batch.commit();
        console.log(`  ✅ KK${new Date().getFullYear()}-002 [draft] - ${products.length} sản phẩm (${Math.ceil(products.length / 3)} đã nhập)`);
    }
}

async function main() {
    console.log('🚀 Bắt đầu seed dữ liệu kho...');
    try {
        await seedSuppliers();
        await seedInventoryChecks();
        console.log('\n✨ Seed hoàn tất!\n');
    } catch (err) {
        console.error('\n💥 Lỗi:', err);
    }
    process.exit(0);
}

main();