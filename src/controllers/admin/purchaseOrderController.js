// src/controllers/admin/purchaseOrderController.js
const { db } = require('../../config/firebase');
const { FieldValue } = require('firebase-admin/firestore');

// Collection: purchaseOrders
// {
//   orderCode: string,           "PO2026-001"
//   supplierId: string,          docId của nhà cung cấp
//   supplierName: string,        denormalized
//   note: string,
//   status: string,              "draft" | "confirmed" | "cancelled"
//   totalAmount: number,         tổng tiền (tính từ items)
//   createdBy: string,           uid của admin
//   confirmedAt: string | null,
//   createdAt: string,
//   updatedAt: string,
// }

// Collection: purchaseOrderItems  (subcollection của purchaseOrders)
// {
//   productId: string,
//   productCode: string,
//   productName: string,
//   quantity: number,
//   unitPrice: number,           giá nhập (có thể lấy từ product hoặc nhập tay)
//   totalPrice: number,          quantity * unitPrice
//   note: string,
// }

const NOTE_MAX_LENGTH = 500;
const ITEM_NOTE_MAX_LENGTH = 200;
const REASON_MAX_LENGTH = 300;
const MAX_QUANTITY = 1000000;
const MAX_UNIT_PRICE = 1000000000;
const FIRESTORE_IN_LIMIT = 30;

// ── Helpers ──────────────────────────────────────────────────────────────────

async function generateOrderCode() {
    const year = new Date().getFullYear();
    const prefix = `PO${year}-`;
    const snap = await db.collection('purchaseOrders')
        .where('orderCode', '>=', prefix)
        .where('orderCode', '<',  prefix + '\uf8ff')
        .orderBy('orderCode', 'desc')
        .limit(1).get();
    if (snap.empty) return `${prefix}001`;
    const last = snap.docs[0].data().orderCode;
    const num = parseInt(last.split('-')[1], 10) + 1;
    return `${prefix}${String(num).padStart(3, '0')}`;
}

function validateNote(note) {
    if (note === undefined || note === null) return;
    if (typeof note !== 'string')
        throw new Error('note phải là chuỗi ký tự');
    if (note.length > NOTE_MAX_LENGTH)
        throw new Error(`Ghi chú không được vượt quá ${NOTE_MAX_LENGTH} ký tự`);
}

function validateReason(reason) {
    if (reason === undefined || reason === null) return;
    if (typeof reason !== 'string')
        throw new Error('reason phải là chuỗi ký tự');
    if (reason.length > REASON_MAX_LENGTH)
        throw new Error(`Lý do hủy không được vượt quá ${REASON_MAX_LENGTH} ký tự`);
}

/**
 * Validate danh sách items đầu vào (createPurchaseOrder / updatePurchaseOrder)
 * Trả về mảng lỗi (rỗng nếu hợp lệ)
 */
function validateItems(items) {
    const errors = [];

    if (!items || !Array.isArray(items) || items.length === 0) {
        errors.push('Phải có ít nhất 1 sản phẩm');
        return errors;
    }

    if (items.length > FIRESTORE_IN_LIMIT) {
        errors.push(`Chỉ được nhập tối đa ${FIRESTORE_IN_LIMIT} sản phẩm trong 1 phiếu`);
    }

    const seenProductIds = new Set();

    items.forEach((item, index) => {
        const pos = `Sản phẩm #${index + 1}`;

        if (!item || typeof item !== 'object') {
            errors.push(`${pos}: dữ liệu không hợp lệ`);
            return;
        }

        // productId
        if (!item.productId || typeof item.productId !== 'string') {
            errors.push(`${pos}: thiếu productId hoặc không hợp lệ`);
        } else if (seenProductIds.has(item.productId)) {
            errors.push(`${pos}: productId "${item.productId}" bị trùng trong phiếu`);
        } else {
            seenProductIds.add(item.productId);
        }

        // quantity
        const quantity = item.quantity;
        if (quantity === undefined || quantity === null || isNaN(Number(quantity))) {
            errors.push(`${pos}: quantity phải là số`);
        } else {
            const q = Number(quantity);
            if (!Number.isInteger(q) || q <= 0)
                errors.push(`${pos}: quantity phải là số nguyên dương`);
            else if (q > MAX_QUANTITY)
                errors.push(`${pos}: quantity vượt quá giới hạn cho phép (${MAX_QUANTITY})`);
        }

        // unitPrice
        const unitPrice = item.unitPrice;
        if (unitPrice === undefined || unitPrice === null || isNaN(Number(unitPrice))) {
            errors.push(`${pos}: unitPrice phải là số`);
        } else {
            const up = Number(unitPrice);
            if (up < 0)
                errors.push(`${pos}: unitPrice không được âm`);
            else if (up > MAX_UNIT_PRICE)
                errors.push(`${pos}: unitPrice vượt quá giới hạn cho phép (${MAX_UNIT_PRICE})`);
        }

        // note (tùy chọn)
        if (item.note !== undefined && item.note !== null) {
            if (typeof item.note !== 'string')
                errors.push(`${pos}: note phải là chuỗi ký tự`);
            else if (item.note.length > ITEM_NOTE_MAX_LENGTH)
                errors.push(`${pos}: note không được vượt quá ${ITEM_NOTE_MAX_LENGTH} ký tự`);
        }
    });

    return errors;
}

/**
 * Lấy product map từ danh sách productId (tự chia chunk theo giới hạn 'in' của Firestore)
 */
async function getProductMap(productIds) {
    const uniqueIds = [...new Set(productIds)];
    const chunks = [];
    for (let i = 0; i < uniqueIds.length; i += FIRESTORE_IN_LIMIT)
        chunks.push(uniqueIds.slice(i, i + FIRESTORE_IN_LIMIT));

    const snaps = await Promise.all(
        chunks.map(chunk => db.collection('products').where('__name__', 'in', chunk).get())
    );

    const productMap = {};
    snaps.forEach(snap => {
        snap.docs.forEach(d => {
            productMap[d.id] = { id: d.id, ...d.data() };
        });
    });
    return productMap;
}

// ── Controllers ──────────────────────────────────────────────────────────────

/**
 * GET /admin/purchase-orders
 * Danh sách phiếu nhập kho
 * Query: ?status=draft|confirmed|cancelled&supplierId=xxx
 */
exports.getAllPurchaseOrders = async (req, res) => {
    try {
        const { status, supplierId } = req.query;
        let query = db.collection('purchaseOrders').orderBy('createdAt', 'desc');

        if (status) {
            const valid = ['draft', 'confirmed', 'cancelled'];
            if (!valid.includes(status))
                return res.status(400).json({ message: `status phải là: ${valid.join(', ')}` });
            query = query.where('status', '==', status);
        }
        if (supplierId) {
            if (typeof supplierId !== 'string')
                return res.status(400).json({ message: 'supplierId không hợp lệ' });
            query = query.where('supplierId', '==', supplierId);
        }

        const snap = await query.get();
        const orders = snap.docs.map(d => ({ id: d.id, ...d.data() }));

        res.status(200).json({ total: orders.length, purchaseOrders: orders });
    } catch (err) {
        res.status(500).json({ message: 'Lỗi server: ' + err.message });
    }
};

/**
 * GET /admin/purchase-orders/:id
 * Chi tiết phiếu nhập (kèm items)
 */
exports.getPurchaseOrderById = async (req, res) => {
    try {
        const { id } = req.params;
        if (!id || typeof id !== 'string')
            return res.status(400).json({ message: 'id phiếu nhập không hợp lệ' });

        const doc = await db.collection('purchaseOrders').doc(id).get();
        if (!doc.exists)
            return res.status(404).json({ message: 'Không tìm thấy phiếu nhập' });

        const itemsSnap = await doc.ref.collection('purchaseOrderItems').get();
        const items = itemsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

        res.status(200).json({ id: doc.id, ...doc.data(), items });
    } catch (err) {
        res.status(500).json({ message: 'Lỗi server: ' + err.message });
    }
};

/**
 * POST /admin/purchase-orders
 * Tạo phiếu nhập mới (draft)
 * Body: { supplierId, note?, items: [{ productId, quantity, unitPrice, note? }] }
 */
exports.createPurchaseOrder = async (req, res) => {
    try {
        const { supplierId, note, items } = req.body;
        const uid = req.user.uid;

        // Validate supplierId
        if (!supplierId || typeof supplierId !== 'string')
            return res.status(400).json({ message: 'Thiếu supplierId hoặc không hợp lệ' });

        // Validate note
        try {
            validateNote(note);
        } catch (e) {
            return res.status(400).json({ message: e.message });
        }

        // Validate items (format)
        const itemErrors = validateItems(items);
        if (itemErrors.length)
            return res.status(400).json({ message: itemErrors.join('; ') });

        // Validate supplier tồn tại + đang hoạt động
        const supplierDoc = await db.collection('suppliers').doc(supplierId).get();
        if (!supplierDoc.exists)
            return res.status(404).json({ message: 'Không tìm thấy nhà cung cấp' });
        if (supplierDoc.data().isActive === false)
            return res.status(400).json({ message: 'Nhà cung cấp đã ngừng hợp tác' });

        // Get product details
        const productIds = items.map(i => i.productId);
        const productMap = await getProductMap(productIds);

        // Check missing products
        const missing = productIds.filter(id => !productMap[id]);
        if (missing.length)
            return res.status(404).json({ message: `Sản phẩm không tồn tại: ${missing.join(', ')}` });

        // Calculate total
        let totalAmount = 0;
        const orderItems = items.map(item => {
            const p = productMap[item.productId];
            const quantity = Number(item.quantity);
            const unitPrice = Number(item.unitPrice);
            const total = unitPrice * quantity;
            totalAmount += total;
            return {
                productId: item.productId,
                productCode: p.code || p.ID || '',
                productName: p.name,
                quantity,
                unitPrice,
                totalPrice: total,
                note: item.note || '',
            };
        });

        // Create order
        const orderCode = await generateOrderCode();
        const now = new Date().toISOString();
        const orderRef = db.collection('purchaseOrders').doc();
        await orderRef.set({
            orderCode,
            supplierId,
            supplierName: supplierDoc.data().name,
            note: note || '',
            status: 'draft',
            totalAmount,
            createdBy: uid,
            confirmedAt: null,
            createdAt: now,
            updatedAt: now,
        });

        // Create items subcollection
        const batch = db.batch();
        for (const item of orderItems) {
            const itemRef = orderRef.collection('purchaseOrderItems').doc();
            batch.set(itemRef, item);
        }
        await batch.commit();

        res.status(201).json({
            message: 'Tạo phiếu nhập thành công',
            id: orderRef.id,
            orderCode,
            totalAmount,
            itemCount: orderItems.length,
        });
    } catch (err) {
        res.status(500).json({ message: 'Lỗi server: ' + err.message });
    }
};

/**
 * PUT /admin/purchase-orders/:id
 * Cập nhật phiếu nhập (chỉ khi draft)
 * Body: { supplierId?, note?, items? }  (items sẽ replace toàn bộ)
 */
exports.updatePurchaseOrder = async (req, res) => {
    try {
        const { id } = req.params;
        const { supplierId, note, items } = req.body;

        if (!id || typeof id !== 'string')
            return res.status(400).json({ message: 'id phiếu nhập không hợp lệ' });

        // Validate format trước khi đọc DB
        if (supplierId !== undefined && (!supplierId || typeof supplierId !== 'string'))
            return res.status(400).json({ message: 'supplierId không hợp lệ' });

        try {
            validateNote(note);
        } catch (e) {
            return res.status(400).json({ message: e.message });
        }

        if (items !== undefined) {
            const itemErrors = validateItems(items);
            if (itemErrors.length)
                return res.status(400).json({ message: itemErrors.join('; ') });
        }

        const doc = await db.collection('purchaseOrders').doc(id).get();
        if (!doc.exists)
            return res.status(404).json({ message: 'Không tìm thấy phiếu nhập' });
        if (doc.data().status !== 'draft')
            return res.status(409).json({ message: 'Chỉ sửa được phiếu ở trạng thái draft' });

        const updates = { updatedAt: new Date().toISOString() };

        // Update supplier
        if (supplierId !== undefined) {
            const supplierDoc = await db.collection('suppliers').doc(supplierId).get();
            if (!supplierDoc.exists)
                return res.status(404).json({ message: 'Không tìm thấy nhà cung cấp' });
            if (supplierDoc.data().isActive === false)
                return res.status(400).json({ message: 'Nhà cung cấp đã ngừng hợp tác' });
            updates.supplierId = supplierId;
            updates.supplierName = supplierDoc.data().name;
        }

        if (note !== undefined) {
            updates.note = note;
        }

        // Update items (if provided)
        if (items !== undefined) {
            // Get product details
            const productIds = items.map(i => i.productId);
            const productMap = await getProductMap(productIds);
            const missing = productIds.filter(id => !productMap[id]);
            if (missing.length)
                return res.status(404).json({ message: `Sản phẩm không tồn tại: ${missing.join(', ')}` });

            // Recalculate total
            let totalAmount = 0;
            const orderItems = items.map(item => {
                const p = productMap[item.productId];
                const quantity = Number(item.quantity);
                const unitPrice = Number(item.unitPrice);
                const total = unitPrice * quantity;
                totalAmount += total;
                return {
                    productId: item.productId,
                    productCode: p.code || p.ID || '',
                    productName: p.name,
                    quantity,
                    unitPrice,
                    totalPrice: total,
                    note: item.note || '',
                };
            });

            // Replace items: delete old, add new
            const batch = db.batch();
            const oldItemsSnap = await doc.ref.collection('purchaseOrderItems').get();
            oldItemsSnap.docs.forEach(d => batch.delete(d.ref));
            for (const item of orderItems) {
                const itemRef = doc.ref.collection('purchaseOrderItems').doc();
                batch.set(itemRef, item);
            }
            updates.totalAmount = totalAmount;
            await batch.commit();
        }

        await doc.ref.update(updates);
        res.status(200).json({ message: 'Cập nhật phiếu nhập thành công', updates });
    } catch (err) {
        res.status(500).json({ message: 'Lỗi server: ' + err.message });
    }
};

/**
 * POST /admin/purchase-orders/:id/confirm
 * Xác nhận phiếu nhập → cập nhật tồn kho products
 */
exports.confirmPurchaseOrder = async (req, res) => {
    try {
        const { id } = req.params;
        if (!id || typeof id !== 'string')
            return res.status(400).json({ message: 'id phiếu nhập không hợp lệ' });

        const doc = await db.collection('purchaseOrders').doc(id).get();
        if (!doc.exists)
            return res.status(404).json({ message: 'Không tìm thấy phiếu nhập' });
        if (doc.data().status !== 'draft')
            return res.status(409).json({ message: 'Phiếu đã được xác nhận hoặc hủy' });

        const itemsSnap = await doc.ref.collection('purchaseOrderItems').get();
        if (itemsSnap.empty)
            return res.status(400).json({ message: 'Phiếu nhập không có sản phẩm nào' });

        // Update product stock
        const batch = db.batch();
        const now = new Date().toISOString();
        for (const itemDoc of itemsSnap.docs) {
            const item = itemDoc.data();
            const productRef = db.collection('products').doc(item.productId);
            // Tăng stockQuantity
            batch.update(productRef, {
                stockQuantity: FieldValue.increment(item.quantity),
                updatedAt: now,
            });
        }

        // Update order status
        batch.update(doc.ref, {
            status: 'confirmed',
            confirmedAt: now,
            updatedAt: now,
        });

        await batch.commit();

        res.status(200).json({ message: 'Xác nhận phiếu nhập thành công, tồn kho đã được cập nhật' });
    } catch (err) {
        res.status(500).json({ message: 'Lỗi server: ' + err.message });
    }
};

/**
 * PUT /admin/purchase-orders/:id/cancel
 * Hủy phiếu nhập (chỉ draft)
 * Body: { reason? }
 */
exports.cancelPurchaseOrder = async (req, res) => {
    try {
        const { id } = req.params;
        const { reason } = req.body;

        if (!id || typeof id !== 'string')
            return res.status(400).json({ message: 'id phiếu nhập không hợp lệ' });

        try {
            validateReason(reason);
        } catch (e) {
            return res.status(400).json({ message: e.message });
        }

        const doc = await db.collection('purchaseOrders').doc(id).get();
        if (!doc.exists)
            return res.status(404).json({ message: 'Không tìm thấy phiếu nhập' });
        if (doc.data().status !== 'draft')
            return res.status(409).json({ message: 'Chỉ hủy được phiếu ở trạng thái draft' });

        await doc.ref.update({
            status: 'cancelled',
            note: (doc.data().note || '') + (reason ? `\nLý do hủy: ${reason}` : ''),
            updatedAt: new Date().toISOString(),
        });

        res.status(200).json({ message: 'Đã hủy phiếu nhập' });
    } catch (err) {
        res.status(500).json({ message: 'Lỗi server: ' + err.message });
    }
};

/**
 * DELETE /admin/purchase-orders/:id
 * Xóa phiếu nhập (chỉ draft)
 */
exports.deletePurchaseOrder = async (req, res) => {
    try {
        const { id } = req.params;
        if (!id || typeof id !== 'string')
            return res.status(400).json({ message: 'id phiếu nhập không hợp lệ' });

        const doc = await db.collection('purchaseOrders').doc(id).get();
        if (!doc.exists)
            return res.status(404).json({ message: 'Không tìm thấy phiếu nhập' });
        if (doc.data().status !== 'draft')
            return res.status(409).json({ message: 'Chỉ xóa được phiếu ở trạng thái draft' });

        // Delete subcollection items
        const itemsSnap = await doc.ref.collection('purchaseOrderItems').get();
        const batch = db.batch();
        itemsSnap.docs.forEach(d => batch.delete(d.ref));
        batch.delete(doc.ref);
        await batch.commit();

        res.status(200).json({ message: 'Đã xóa phiếu nhập' });
    } catch (err) {
        res.status(500).json({ message: 'Lỗi server: ' + err.message });
    }
};