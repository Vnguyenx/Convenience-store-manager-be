// src/controllers/admin/inventoryController.js
const { db } = require('../../config/firebase');

// Collection: inventoryChecks
// {
//   checkCode: string,        "KK2026-001"
//   note: string,
//   status: string,           "draft" | "confirmed"
//   checkedBy: string,        uid của admin
//   confirmedAt: string | null,
//   createdAt: string,
//   updatedAt: string,
// }

// Collection: inventoryCheckItems  (subcollection của inventoryChecks)
// {
//   productId: string,        docId của product
//   productCode: string,      "SP0001"
//   productName: string,
//   systemQuantity: number,   tồn theo hệ thống lúc kiểm
//   actualQuantity: number,   tồn thực tế nhân viên đếm
//   difference: number,       actualQuantity - systemQuantity
//   note: string,
// }

// ── Helpers ───────────────────────────────────────────────────────────────────

async function generateCheckCode() {
    const year = new Date().getFullYear();
    const prefix = `KK${year}-`;
    const snap = await db.collection('inventoryChecks')
        .where('checkCode', '>=', prefix)
        .where('checkCode', '<',  prefix + '\uf8ff')
        .orderBy('checkCode', 'desc').limit(1).get();
    if (snap.empty) return `${prefix}001`;
    const last = snap.docs[0].data().checkCode;
    const num  = parseInt(last.split('-')[1], 10) + 1;
    return `${prefix}${String(num).padStart(3, '0')}`;
}

// ── Kiểm kê ───────────────────────────────────────────────────────────────────

/**
 * GET /admin/inventory/checks
 * Danh sách phiếu kiểm kê
 */
exports.getAllChecks = async (req, res) => {
    try {
        const { status } = req.query;
        let query = db.collection('inventoryChecks').orderBy('createdAt', 'desc');
        if (status) query = query.where('status', '==', status);

        const snap = await query.get();
        const checks = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        res.status(200).json({ total: checks.length, checks });
    } catch (err) {
        res.status(500).json({ message: 'Lỗi server: ' + err.message });
    }
};

/**
 * GET /admin/inventory/checks/:id
 * Chi tiết 1 phiếu kiểm kê (kèm items)
 */
exports.getCheckById = async (req, res) => {
    try {
        const doc = await db.collection('inventoryChecks').doc(req.params.id).get();
        if (!doc.exists) return res.status(404).json({ message: 'Không tìm thấy phiếu kiểm kê' });

        const itemsSnap = await doc.ref.collection('inventoryCheckItems').get();
        const items = itemsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

        res.status(200).json({ id: doc.id, ...doc.data(), items });
    } catch (err) {
        res.status(500).json({ message: 'Lỗi server: ' + err.message });
    }
};

/**
 * POST /admin/inventory/checks
 * Tạo phiếu kiểm kê mới — tự snapshot tồn kho hệ thống hiện tại
 * Body: { note?, productIds?: string[] }  (nếu không có productIds → lấy tất cả)
 */
exports.createCheck = async (req, res) => {
    try {
        const { note = '', productIds } = req.body;
        const uid = req.user.uid;

        // Lấy sản phẩm cần kiểm
        let productsSnap;
        if (productIds && productIds.length > 0) {
            // Firestore 'in' giới hạn 30 items/query
            const chunks = [];
            for (let i = 0; i < productIds.length; i += 30)
                chunks.push(productIds.slice(i, i + 30));
            const docs = (await Promise.all(
                chunks.map(chunk =>
                    db.collection('products').where('__name__', 'in', chunk).get()
                )
            )).flatMap(s => s.docs);
            productsSnap = { docs };
        } else {
            productsSnap = await db.collection('products').orderBy('code').get();
        }

        const checkCode = await generateCheckCode();
        const now       = new Date().toISOString();

        // Tạo phiếu
        const checkRef = db.collection('inventoryChecks').doc();
        await checkRef.set({
            checkCode,
            note,
            status: 'draft',
            checkedBy: uid,
            confirmedAt: null,
            createdAt: now,
            updatedAt: now,
        });

        // Tạo items với systemQuantity snapshot từ Firestore
        const batch = db.batch();
        for (const pDoc of productsSnap.docs) {
            const p = pDoc.data();
            const itemRef = checkRef.collection('inventoryCheckItems').doc();
            batch.set(itemRef, {
                productId:      pDoc.id,
                productCode:    p.code || p.ID || pDoc.id,
                productName:    p.name,
                systemQuantity: p.stockQuantity ?? 0,
                actualQuantity: null,   // nhân viên sẽ điền
                difference:     null,
                note:           '',
            });
        }
        await batch.commit();

        res.status(201).json({
            message: 'Tạo phiếu kiểm kê thành công',
            id: checkRef.id,
            checkCode,
            itemCount: productsSnap.docs.length,
        });
    } catch (err) {
        res.status(500).json({ message: 'Lỗi server: ' + err.message });
    }
};

/**
 * PUT /admin/inventory/checks/:id/items/:itemId
 * Nhập tồn thực tế cho 1 dòng
 * Body: { actualQuantity, note? }
 */
exports.updateCheckItem = async (req, res) => {
    try {
        const { id, itemId } = req.params;
        const { actualQuantity, note } = req.body;

        if (actualQuantity === undefined || actualQuantity === null || isNaN(Number(actualQuantity)))
            return res.status(400).json({ message: 'actualQuantity phải là số' });
        if (Number(actualQuantity) < 0)
            return res.status(400).json({ message: 'Số lượng thực tế không được âm' });

        const checkDoc = await db.collection('inventoryChecks').doc(id).get();
        if (!checkDoc.exists) return res.status(404).json({ message: 'Không tìm thấy phiếu kiểm kê' });
        if (checkDoc.data().status === 'confirmed')
            return res.status(409).json({ message: 'Phiếu đã xác nhận, không thể sửa' });

        const itemRef = checkDoc.ref.collection('inventoryCheckItems').doc(itemId);
        const itemDoc = await itemRef.get();
        if (!itemDoc.exists) return res.status(404).json({ message: 'Không tìm thấy dòng kiểm kê' });

        const actual     = Number(actualQuantity);
        const difference = actual - (itemDoc.data().systemQuantity ?? 0);

        await itemRef.update({ actualQuantity: actual, difference, note: note || '' });
        await checkDoc.ref.update({ updatedAt: new Date().toISOString() });

        res.status(200).json({ message: 'Cập nhật thành công', actualQuantity: actual, difference });
    } catch (err) {
        res.status(500).json({ message: 'Lỗi server: ' + err.message });
    }
};

/**
 * POST /admin/inventory/checks/:id/confirm
 * Xác nhận phiếu kiểm kê → cập nhật stockQuantity trên products
 */
exports.confirmCheck = async (req, res) => {
    try {
        const checkDoc = await db.collection('inventoryChecks').doc(req.params.id).get();
        if (!checkDoc.exists) return res.status(404).json({ message: 'Không tìm thấy phiếu kiểm kê' });
        if (checkDoc.data().status === 'confirmed')
            return res.status(409).json({ message: 'Phiếu đã được xác nhận rồi' });

        const itemsSnap = await checkDoc.ref.collection('inventoryCheckItems').get();

        // Kiểm tra tất cả items đã nhập actualQuantity chưa
        const unfinished = itemsSnap.docs.filter(d => d.data().actualQuantity === null);
        if (unfinished.length > 0)
            return res.status(400).json({
                message: `Còn ${unfinished.length} sản phẩm chưa nhập số lượng thực tế`,
                unfinished: unfinished.map(d => d.data().productCode),
            });

        // Batch update stockQuantity trên products
        const batch = db.batch();
        const now   = new Date().toISOString();

        for (const itemDoc of itemsSnap.docs) {
            const item = itemDoc.data();
            const productRef = db.collection('products').doc(item.productId);
            batch.update(productRef, {
                stockQuantity: item.actualQuantity,
                updatedAt: now,
            });
        }

        batch.update(checkDoc.ref, {
            status: 'confirmed',
            confirmedAt: now,
            updatedAt: now,
        });

        await batch.commit();
        res.status(200).json({ message: 'Xác nhận kiểm kê thành công, tồn kho đã được cập nhật' });
    } catch (err) {
        res.status(500).json({ message: 'Lỗi server: ' + err.message });
    }
};

/**
 * DELETE /admin/inventory/checks/:id
 * Chỉ xóa được phiếu còn draft
 */
exports.deleteCheck = async (req, res) => {
    try {
        const checkDoc = await db.collection('inventoryChecks').doc(req.params.id).get();
        if (!checkDoc.exists) return res.status(404).json({ message: 'Không tìm thấy phiếu kiểm kê' });
        if (checkDoc.data().status === 'confirmed')
            return res.status(409).json({ message: 'Không thể xóa phiếu đã xác nhận' });

        // Xóa subcollection items trước
        const itemsSnap = await checkDoc.ref.collection('inventoryCheckItems').get();
        const batch = db.batch();
        itemsSnap.docs.forEach(d => batch.delete(d.ref));
        batch.delete(checkDoc.ref);
        await batch.commit();

        res.status(200).json({ message: 'Đã xóa phiếu kiểm kê' });
    } catch (err) {
        res.status(500).json({ message: 'Lỗi server: ' + err.message });
    }
};

// ── Cảnh báo kho ─────────────────────────────────────────────────────────────

/**
 * GET /admin/inventory/alerts
 * Trả về 3 nhóm cảnh báo:
 *   - lowStock:      stockQuantity <= minStockThreshold
 *   - nearExpiry:    expiryDate trong vòng N ngày (default 30)
 *   - expired:       expiryDate đã qua
 */
exports.getAlerts = async (req, res) => {
    try {
        const daysAhead = parseInt(req.query.days || '30', 10);
        const today     = new Date();
        today.setHours(0, 0, 0, 0);
        const limitDate = new Date(today);
        limitDate.setDate(limitDate.getDate() + daysAhead);

        const todayStr  = today.toISOString().split('T')[0];
        const limitStr  = limitDate.toISOString().split('T')[0];

        const snap = await db.collection('products').get();
        const lowStock   = [];
        const nearExpiry = [];
        const expired    = [];

        for (const doc of snap.docs) {
            const p = { id: doc.id, ...doc.data() };

            // Tồn kho thấp
            if (
                p.stockQuantity !== undefined &&
                p.minStockThreshold !== undefined &&
                p.stockQuantity <= p.minStockThreshold
            ) {
                lowStock.push({
                    id: p.id,
                    code: p.code || p.ID,
                    name: p.name,
                    stockQuantity: p.stockQuantity,
                    minStockThreshold: p.minStockThreshold,
                    shortage: p.minStockThreshold - p.stockQuantity,
                });
            }

            // Cận HSD / hết HSD
            if (p.expiryDate) {
                if (p.expiryDate < todayStr) {
                    expired.push({
                        id: p.id,
                        code: p.code || p.ID,
                        name: p.name,
                        expiryDate: p.expiryDate,
                        stockQuantity: p.stockQuantity,
                        daysExpired: Math.ceil((today - new Date(p.expiryDate)) / (1000 * 60 * 60 * 24)),
                    });
                } else if (p.expiryDate <= limitStr) {
                    nearExpiry.push({
                        id: p.id,
                        code: p.code || p.ID,
                        name: p.name,
                        expiryDate: p.expiryDate,
                        stockQuantity: p.stockQuantity,
                        daysLeft: Math.ceil((new Date(p.expiryDate) - today) / (1000 * 60 * 60 * 24)),
                    });
                }
            }
        }

        // Sắp xếp: tồn thấp nhất trước, hết hạn sớm nhất trước
        lowStock.sort((a, b) => a.stockQuantity - b.stockQuantity);
        nearExpiry.sort((a, b) => a.daysLeft - b.daysLeft);
        expired.sort((a, b) => a.daysExpired - b.daysExpired);

        res.status(200).json({
            summary: {
                lowStock:   lowStock.length,
                nearExpiry: nearExpiry.length,
                expired:    expired.length,
                total:      lowStock.length + nearExpiry.length + expired.length,
            },
            lowStock,
            nearExpiry,
            expired,
        });
    } catch (err) {
        res.status(500).json({ message: 'Lỗi server: ' + err.message });
    }
};