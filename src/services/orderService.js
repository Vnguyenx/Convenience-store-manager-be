// src/services/orderService.js
const { db } = require('../config/firebase');
const { FieldValue } = require('firebase-admin/firestore');
const productService = require('./productService');

const ORDERS_COLLECTION = 'orders';
const COUPONS_COLLECTION = 'coupons';
const PRODUCTS_COLLECTION = 'products';
const USERS_COLLECTION = 'users';
const ATTENDANCES_COLLECTION = 'attendances'; // FIX

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

// FIX: Thêm hàm tính discount dựa trên coupon
function calculateCouponDiscount(couponData, subtotal) {
    if (!couponData) return 0;
    let discount = 0;
    if (couponData.type === 'percentage') {
        discount = (subtotal * couponData.value) / 100;
    } else if (couponData.type === 'fixed') {
        discount = couponData.value;
    }
    // Không giảm quá subtotal
    return Math.min(discount, subtotal);
}

// FIX: Kiểm tra staff có đang trong ca làm việc hôm nay không
// (đã check-in, chưa check-out). Dùng để chặn bán hàng ngoài giờ ca.
async function isCurrentlyOnShift(uid) {
    if (!uid || uid === 'anonymous') return false;
    const date = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }); // YYYY-MM-DD
    const snap = await db.collection(ATTENDANCES_COLLECTION)
        .where('staffUid', '==', uid)
        .where('date', '==', date)
        .limit(1)
        .get();
    if (snap.empty) return false;
    const data = snap.docs[0].data();
    return !!data.checkIn && !data.checkOut;
}

async function createOrder(payload) {
    const {
        items,
        subtotal: clientSubtotal,        // FIX: lưu tạm để so sánh nếu cần, nhưng không dùng
        coupon = null,
        couponDiscount: clientCouponDiscount, // FIX: không dùng
        total: clientTotal,
        paymentMethod,
        cashierUID,
        customerNote = '',
        requestingUser = null, // FIX: dùng để check role + quyền vào ca
    } = payload;

    if (!Array.isArray(items) || items.length === 0) {
        throw new Error('Đơn hàng phải có ít nhất 1 sản phẩm');
    }
    if (!paymentMethod) {
        throw new Error('Thiếu phương thức thanh toán');
    }

    // FIX: Staff phải đang trong ca (đã check-in, chưa check-out) mới được bán hàng.
    // Admin không bị ràng buộc bởi ca làm việc.
    if (requestingUser && requestingUser.role !== 'admin') {
        const onShift = await isCurrentlyOnShift(cashierUID);
        if (!onShift) {
            throw new Error('Bạn cần check-in ca làm việc trước khi bán hàng');
        }
    }

    // FIX: Validate từng item
    for (const item of items) {
        if (!item.id || typeof item.id !== 'string') {
            throw new Error('Mỗi sản phẩm phải có ID hợp lệ');
        }
        if (!item.name) {
            throw new Error('Mỗi sản phẩm phải có tên');
        }
        // FIX: quantity phải là số nguyên dương
        const qty = Number(item.quantity);
        if (!Number.isInteger(qty) || qty <= 0) {
            throw new Error(`Sản phẩm "${item.name}" có số lượng không hợp lệ (phải là số nguyên dương)`);
        }
        // FIX: unitPrice phải là số dương
        const price = Number(item.unitPrice);
        if (isNaN(price) || price < 0) {
            throw new Error(`Sản phẩm "${item.name}" có giá không hợp lệ`);
        }
        // FIX: discountPrice nếu có phải >= 0
        if (item.discountPrice !== undefined && item.discountPrice !== null) {
            const disc = Number(item.discountPrice);
            if (isNaN(disc) || disc < 0) {
                throw new Error(`Sản phẩm "${item.name}" có giá giảm không hợp lệ`);
            }
        }
    }

    // FIX: Ta sẽ tự tính subtotal, couponDiscount, total ở server
    let computedSubtotal = 0;
    // Tính subtotal từ items (dùng unitPrice, chưa trừ discount)
    for (const item of items) {
        const qty = Number(item.quantity);
        const price = Number(item.unitPrice);
        computedSubtotal += price * qty;
    }

    // FIX: Bỏ qua couponDiscount client gửi, sẽ tính lại sau khi có couponData
    // Lưu ý: vẫn giữ logic kiểm tra coupon trong transaction

    const orderCode = generateOrderCode();
    const cashierName = await getUserFullName(cashierUID);

    // Tạo orderData cơ bản, chưa có items (sẽ gán sau), và chưa có subtotal/total
    const orderData = {
        orderCode,
        status: 'completed',
        paymentMethod,
        cashierUID: cashierUID || 'anonymous',
        cashierName,
        subtotal: 0,          // sẽ gán sau
        couponDiscount: 0,    // sẽ gán sau
        total: 0,             // sẽ gán sau
        coupon: null,
        items: [],
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

        // 2. ✅ Chặn bán hàng đã hết hạn — kiểm tra ngay sau khi có dữ liệu sản phẩm thật từ DB
        //    (không tin item.name/expiryDate mà client gửi lên, luôn đọc lại từ productSnaps)
        productSnaps.forEach((doc, idx) => {
            productService.assertNotExpired(doc.data());
        });

        // 3. Kiểm tra coupon (nếu có)
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

        // 4. Kiểm tra tồn kho
        items.forEach((item, idx) => {
            const stock = productSnaps[idx].data().stockQuantity ?? 0;
            const qty = Number(item.quantity);
            if (stock < qty) {
                throw new Error(`Sản phẩm "${item.name}" không đủ tồn kho (còn ${stock})`);
            }
        });

        // FIX: Tính lại couponDiscount dựa trên subtotal vừa tính và couponData
        const computedCouponDiscount = calculateCouponDiscount(couponData, computedSubtotal);
        const computedTotal = computedSubtotal - computedCouponDiscount;

        // FIX: (Tùy chọn) So sánh với client gửi để log cảnh báo nếu lệch nhiều, nhưng vẫn dùng giá trị tự tính
        // Ở đây ta bỏ qua client values, chỉ dùng computed

        // 5. Gắn costPrice và xây dựng items cho order
        orderData.items = items.map((item, idx) => ({
            id: item.id,
            name: item.name,
            unitPrice: Number(item.unitPrice),
            discountPrice: item.discountPrice != null ? Number(item.discountPrice) : null,
            quantity: Number(item.quantity),
            costPrice: productSnaps[idx].data().importPrice ?? null,
        }));

        // FIX: Gán các giá trị đã tính lại
        orderData.subtotal = computedSubtotal;
        orderData.couponDiscount = computedCouponDiscount;
        orderData.total = computedTotal;
        if (couponData) {
            orderData.coupon = {
                id: coupon.id,
                code: couponData.code,
                type: couponData.type,
                value: couponData.value,
            };
        }

        // Lưu đơn hàng
        transaction.set(orderRef, orderData);

        // 6. Trừ kho
        items.forEach((item, idx) => {
            transaction.update(productRefs[idx], {
                stockQuantity: FieldValue.increment(-Number(item.quantity)),
                updatedAt: new Date().toISOString(),
            });
        });

        // 7. Tăng usedCount coupon
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
            // FIX: kiểm tra item.id tồn tại trước khi query
            if (!item.id) {
                // nếu không có id thì bỏ qua, không khôi phục kho
                productRefs.push(null);
                productSnaps.push(null);
                continue;
            }
            const query = db.collection(PRODUCTS_COLLECTION)
                .where('ID', '==', item.id)
                .limit(1);
            const snap = await transaction.get(query);
            if (!snap.empty) {
                const doc = snap.docs[0];
                productRefs.push(doc.ref);
                productSnaps.push(doc);
            } else {
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
                    stockQuantity: FieldValue.increment(item.quantity || 0),
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