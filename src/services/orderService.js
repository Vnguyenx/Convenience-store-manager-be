// src/services/orderService.js
const { db } = require('../config/firebase');

const ORDERS_COLLECTION = 'orders';
// Đổi lại tên collection này nếu project bạn lưu user ở collection khác
const USERS_COLLECTION = 'users';

/**
 * Sinh mã đơn hàng dạng DH00001 dựa trên số đơn hiện có.
 * (Đơn giản: dùng timestamp; nếu cần tăng dần thật, nên dùng counter doc riêng)
 */
function generateOrderCode() {
    const ts = Date.now().toString().slice(-5);
    return `DH${ts}`;
}

/**
 * Lấy fullName của nhân viên dựa trên uid (Firebase Auth uid).
 * Trả về 'Không xác định' nếu không tìm thấy hoặc uid là 'anonymous'.
 */
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

/**
 * Tạo đơn hàng mới
 * @param {Object} payload - { items, subtotal, coupon, couponDiscount, total, paymentMethod, cashierUID, customerNote }
 */
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

    // Lấy tên nhân viên NGAY LÚC TẠO ĐƠN -> lưu cố định (denormalize).
    // Lý do: nếu sau này nhân viên đổi tên / nghỉ việc / bị xoá account,
    // hóa đơn cũ vẫn giữ đúng tên người đã bán tại thời điểm đó.
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
            ? { code: coupon.code, type: coupon.type, value: coupon.value }
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

    // Dùng auto-ID của Firestore làm docId, orderCode chỉ là field hiển thị
    const docRef = await db.collection(ORDERS_COLLECTION).add(orderData);

    return { docId: docRef.id, ...orderData };
}

/**
 * Lấy danh sách đơn hàng (có thể filter theo status, paymentMethod, khoảng ngày)
 */
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

/**
 * Lấy 1 đơn hàng theo orderCode (field, không phải docId nữa)
 */
async function getOrderById(orderCode) {
    const snap = await db.collection(ORDERS_COLLECTION)
        .where('orderCode', '==', orderCode)
        .limit(1)
        .get();
    if (snap.empty) return null;
    const d = snap.docs[0];
    return { docId: d.id, ...d.data() };
}

/**
 * Cập nhật đơn hàng (sửa thông tin chung: customerNote, items, total... KHÔNG cho sửa orderCode)
 */
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

/**
 * Hủy đơn hàng (soft delete: đổi status -> 'cancelled', không xóa hẳn để giữ lịch sử/audit)
 */
async function cancelOrder(orderCode, reason = '') {
    const found = await getOrderById(orderCode);
    if (!found) {
        throw new Error('Không tìm thấy đơn hàng');
    }
    const docRef = db.collection(ORDERS_COLLECTION).doc(found.docId);

    await docRef.update({
        status: 'cancelled',
        cancelReason: reason,
        updatedAt: new Date().toISOString(),
    });

    const updatedSnap = await docRef.get();
    return { docId: updatedSnap.id, ...updatedSnap.data() };
}

/**
 * Xóa cứng đơn hàng (chỉ dùng cho admin/dọn dữ liệu test, hạn chế dùng trong thực tế)
 */
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