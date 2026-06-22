// src/services/orderService.js
const { db } = require('../config/firebase');
const { FieldValue } = require('firebase-admin/firestore');

const ORDERS_COLLECTION = 'orders';
const COUPONS_COLLECTION = 'coupons';
const PRODUCTS_COLLECTION = 'products';
const USERS_COLLECTION = 'users';

function generateOrderCode() {
    const ts = Date.now().toString().slice(-5);
    return `DH${ts}`;
}

async function getUserFullName(uid) {
    if (!uid || uid === 'anonymous') return 'Không xác định';
    try {
        const snap = await db.collection(USERS_COLLECTION).doc(uid).get();
        if (!snap.exists) return 'Không xác định';
        return snap.data().fullName || 'Không xác định';
    } catch (err) {
        console.error('getUserFullName error:', err.message);
        return 'Không xác định';
    }
}

async function createOrder(payload) {
    const {
        items,
        subtotal,
        coupon = null,
        couponDiscount = 0,
        total,
        paymentMethod,
        cashierUID,
        customerNote = '',
    } = payload;

    if (!Array.isArray(items) || items.length === 0) {
        throw new Error('Đơn hàng phải có ít nhất 1 sản phẩm');
    }
    if (!paymentMethod) {
        throw new Error('Thiếu phương thức thanh toán');
    }

    const orderCode = generateOrderCode();
    const cashierName = await getUserFullName(cashierUID);

    const orderData = {
        orderCode,
        status: 'completed',
        paymentMethod,
        cashierUID: cashierUID || 'anonymous',
        cashierName,
        subtotal: Number(subtotal) || 0,
        couponDiscount: Number(couponDiscount) || 0,
        total: Number(total) || 0,
        coupon: coupon
            ? { id: coupon.id, code: coupon.code, type: coupon.type, value: coupon.value }
            : null,
        items: items.map((i) => ({
            id: i.id,
            name: i.name,
            unitPrice: i.unitPrice,
            discountPrice: i.discountPrice ?? null,
            quantity: i.quantity,
        })),
        customerNote,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    };

    const orderRef = db.collection(ORDERS_COLLECTION).doc();

    await db.runTransaction(async (transaction) => {
        // 1. Lấy thông tin sản phẩm theo field ID
        const productRefs = [];
        const productSnaps = [];
        for (const item of items) {
            const query = db.collection(PRODUCTS_COLLECTION)
                .where('ID', '==', item.id)
                .limit(1);
            const snap = await transaction.get(query);
            if (snap.empty) {
                throw new Error(`Sản phẩm "${item.name}" không tồn tại hoặc đã bị xoá`);
            }
            const doc = snap.docs[0];
            productRefs.push(doc.ref);
            productSnaps.push(doc);
        }

        // 2. Kiểm tra coupon (nếu có)
        let couponRef = null;
        let couponData = null;
        if (coupon?.id) {
            couponRef = db.collection(COUPONS_COLLECTION).doc(coupon.id);
            const couponSnap = await transaction.get(couponRef);
            if (!couponSnap.exists) {
                throw new Error('Mã giảm giá không tồn tại hoặc đã bị xoá');
            }
            couponData = couponSnap.data();
            if (couponData.usageLimit != null && couponData.usedCount >= couponData.usageLimit) {
                throw new Error('Mã giảm giá đã hết lượt sử dụng');
            }
            if (couponData.isActive === false) {
                throw new Error('Mã giảm giá hiện đã bị khoá');
            }
        }

        // 3. Kiểm tra tồn kho
        items.forEach((item, idx) => {
            const stock = productSnaps[idx].data().stockQuantity ?? 0;
            if (stock < item.quantity) {
                throw new Error(`Sản phẩm "${item.name}" không đủ tồn kho (còn ${stock})`);
            }
        });

        // 4. Ghi order
        transaction.set(orderRef, orderData);

        // 5. Trừ kho
        items.forEach((item, idx) => {
            transaction.update(productRefs[idx], {
                stockQuantity: FieldValue.increment(-item.quantity),
                updatedAt: new Date().toISOString(),
            });
        });

        // 6. Tăng usedCount coupon
        if (couponRef) {
            transaction.update(couponRef, {
                usedCount: FieldValue.increment(1),
                updatedAt: new Date().toISOString(),
            });
        }
    });

    return { docId: orderRef.id, ...orderData };
}

async function getOrders(filters = {}) {
    let query = db.collection(ORDERS_COLLECTION);

    if (filters.status) {
        query = query.where('status', '==', filters.status);
    }
    if (filters.paymentMethod) {
        query = query.where('paymentMethod', '==', filters.paymentMethod);
    }
    if (filters.cashierUID) {
        query = query.where('cashierUID', '==', filters.cashierUID);
    }

    const snap = await query.orderBy('createdAt', 'desc').get();
    return snap.docs.map((d) => ({ docId: d.id, ...d.data() }));
}

async function getOrderById(orderCode) {
    const snap = await db.collection(ORDERS_COLLECTION)
        .where('orderCode', '==', orderCode)
        .limit(1)
        .get();
    if (snap.empty) return null;
    const d = snap.docs[0];
    return { docId: d.id, ...d.data() };
}

async function updateOrder(orderCode, updates) {
    const found = await getOrderById(orderCode);
    if (!found) {
        throw new Error('Không tìm thấy đơn hàng');
    }
    const docRef = db.collection(ORDERS_COLLECTION).doc(found.docId);

    const allowedFields = [
        'items', 'subtotal', 'coupon', 'couponDiscount',
        'total', 'paymentMethod', 'customerNote', 'status',
    ];
    const safeUpdates = {};
    for (const key of allowedFields) {
        if (updates[key] !== undefined) safeUpdates[key] = updates[key];
    }
    safeUpdates.updatedAt = new Date().toISOString();

    await docRef.update(safeUpdates);
    const updatedSnap = await docRef.get();
    return { docId: updatedSnap.id, ...updatedSnap.data() };
}

async function cancelOrder(orderCode, reason = '', requestingUser = null) {
    const found = await getOrderById(orderCode);
    if (!found) {
        throw new Error('Không tìm thấy đơn hàng');
    }

    if (requestingUser && requestingUser.role !== 'admin') {
        if (found.cashierUID !== requestingUser.uid) {
            throw new Error('Bạn không có quyền huỷ đơn hàng này');
        }
    }

    const orderRef = db.collection(ORDERS_COLLECTION).doc(found.docId);

    await db.runTransaction(async (transaction) => {
        const orderSnap = await transaction.get(orderRef);
        if (!orderSnap.exists) {
            throw new Error('Không tìm thấy đơn hàng');
        }
        const orderData = orderSnap.data();

        if (orderData.status === 'cancelled') {
            throw new Error('Đơn hàng đã được huỷ trước đó');
        }

        const items = orderData.items || [];

        // Lấy sản phẩm theo field ID
        const productRefs = [];
        const productSnaps = [];
        for (const item of items) {
            const query = db.collection(PRODUCTS_COLLECTION)
                .where('ID', '==', item.id)
                .limit(1);
            const snap = await transaction.get(query);
            // Nếu sản phẩm đã bị xoá thì bỏ qua khi khôi phục kho
            if (!snap.empty) {
                const doc = snap.docs[0];
                productRefs.push(doc.ref);
                productSnaps.push(doc);
            } else {
                // vẫn push null để giữ vị trí tương ứng với items, nhưng bỏ qua cập nhật
                productRefs.push(null);
                productSnaps.push(null);
            }
        }

        let couponRef = null;
        let couponSnap = null;
        if (orderData.coupon?.id) {
            couponRef = db.collection(COUPONS_COLLECTION).doc(orderData.coupon.id);
            couponSnap = await transaction.get(couponRef);
            if (!couponSnap.exists) {
                couponRef = null;
            }
        }

        // Cập nhật trạng thái đơn
        transaction.update(orderRef, {
            status: 'cancelled',
            cancelReason: reason,
            updatedAt: new Date().toISOString(),
        });

        // Khôi phục kho
        items.forEach((item, idx) => {
            if (productRefs[idx]) {
                transaction.update(productRefs[idx], {
                    stockQuantity: FieldValue.increment(item.quantity),
                    updatedAt: new Date().toISOString(),
                });
            }
        });

        // Trả lại lượt dùng coupon
        if (couponRef) {
            const currentUsedCount = couponSnap.data().usedCount || 0;
            transaction.update(couponRef, {
                usedCount: Math.max(0, currentUsedCount - 1),
                updatedAt: new Date().toISOString(),
            });
        }
    });

    const updatedSnap = await orderRef.get();
    return { docId: updatedSnap.id, ...updatedSnap.data() };
}

async function deleteOrder(orderCode) {
    const found = await getOrderById(orderCode);
    if (!found) {
        throw new Error('Không tìm thấy đơn hàng');
    }
    await db.collection(ORDERS_COLLECTION).doc(found.docId).delete();
    return { docId: found.docId, orderCode };
}

module.exports = {
    createOrder,
    getOrders,
    getOrderById,
    updateOrder,
    cancelOrder,
    deleteOrder,
};