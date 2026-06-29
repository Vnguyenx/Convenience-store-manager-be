// seedPurchaseOrders.js
// Chạy từ root: node seedPurchaseOrders.js
const { db } = require('./src/config/firebase');

// ── Helper ───────────────────────────────────────────────────────────────────
function addDays(days) {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d.toISOString().split('T')[0];
}

async function getRandomSupplier() {
    const snap = await db.collection('suppliers').where('isActive', '==', true).limit(1).get();
    if (snap.empty) return null;
    return { id: snap.docs[0].id, ...snap.docs[0].data() };
}

async function getRandomProducts(count = 3) {
    const snap = await db.collection('products').limit(count).get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

async function seedPurchaseOrders() {
    console.log('\n📦 Seed PURCHASE ORDERS...');

    const supplier = await getRandomSupplier();
    if (!supplier) {
        console.log('⚠️  Không tìm thấy nhà cung cấp. Hãy chạy seedInventoryData.js trước.');
        return;
    }

    const products = await getRandomProducts(5);
    if (products.length === 0) {
        console.log('⚠️  Không tìm thấy sản phẩm. Hãy chạy seed products trước.');
        return;
    }

    const now = new Date().toISOString();

    // Phiếu 1: Draft
    {
        const orderRef = db.collection('purchaseOrders').doc();
        const poCode = `PO${new Date().getFullYear()}-001`;
        await orderRef.set({
            poCode,
            supplierId: supplier.id,
            supplierName: supplier.name,
            supplierCode: supplier.code,
            status: 'draft',
            note: 'Nhập hàng tuần cho siêu thị',
            createdBy: 'seed-admin',
            confirmedAt: null,
            createdAt: now,
            updatedAt: now,
        });

        const batch = db.batch();
        const items = products.slice(0, 3).map(p => ({
            productId: p.id,
            productCode: p.code || p.ID,
            productName: p.name,
            quantity: Math.floor(Math.random() * 50) + 10,
            unitPrice: Math.floor(Math.random() * 50000) + 10000,
            totalPrice: 0, // sẽ tính sau
            note: '',
        }));
        items.forEach(item => {
            item.totalPrice = item.quantity * item.unitPrice;
            const ref = orderRef.collection('purchaseOrderItems').doc();
            batch.set(ref, item);
        });
        await batch.commit();
        console.log(`  ✅ PO${new Date().getFullYear()}-001 [draft] - ${items.length} sản phẩm`);
    }

    // Phiếu 2: Đã confirmed
    {
        const orderRef = db.collection('purchaseOrders').doc();
        const poCode = `PO${new Date().getFullYear()}-002`;
        const confirmedAt = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
        await orderRef.set({
            poCode,
            supplierId: supplier.id,
            supplierName: supplier.name,
            supplierCode: supplier.code,
            status: 'confirmed',
            note: 'Nhập bổ sung đầu tháng',
            createdBy: 'seed-admin',
            confirmedAt,
            createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
            updatedAt: confirmedAt,
        });

        const batch = db.batch();
        const items = products.slice(2, 5).map(p => ({
            productId: p.id,
            productCode: p.code || p.ID,
            productName: p.name,
            quantity: Math.floor(Math.random() * 30) + 5,
            unitPrice: Math.floor(Math.random() * 40000) + 8000,
            totalPrice: 0,
            note: '',
        }));
        items.forEach(item => {
            item.totalPrice = item.quantity * item.unitPrice;
            const ref = orderRef.collection('purchaseOrderItems').doc();
            batch.set(ref, item);
        });
        await batch.commit();
        console.log(`  ✅ PO${new Date().getFullYear()}-002 [confirmed] - ${items.length} sản phẩm`);
    }

    console.log('\n✨ Seed purchase orders hoàn tất!\n');
}

async function main() {
    console.log('🚀 Bắt đầu seed dữ liệu phiếu nhập...');
    try {
        await seedPurchaseOrders();
    } catch (err) {
        console.error('💥 Lỗi:', err);
    }
    process.exit(0);
}

main();