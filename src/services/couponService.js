const { db } = require('../config/firebase');
const admin = require('firebase-admin');

const COLLECTION = 'coupons';

/**
 * Lấy tất cả coupon (có thể lọc theo active)
 * @param {boolean} onlyActive - nếu true chỉ lấy isActive == true
 */
const getCoupons = async (onlyActive = false) => {
    let query = db.collection(COLLECTION);
    if (onlyActive) {
        query = query.where('isActive', '==', true);
    }
    const snapshot = await query.get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
};

/**
 * Lấy coupon theo id
 */
const getCouponById = async (id) => {
    const doc = await db.collection(COLLECTION).doc(id).get();
    if (!doc.exists) return null;
    return { id: doc.id, ...doc.data() };
};

/**
 * Tạo coupon mới
 */
const createCoupon = async (data) => {
    const { code, type, value, description, minOrderValue, maxDiscount, startDate, expiryDate, usageLimit, isActive } = data;
    const now = new Date().toISOString();
    const newCoupon = {
        code: code.toUpperCase().trim(),
        type,
        value,
        description: description || '',
        minOrderValue: minOrderValue || 0,
        maxDiscount: maxDiscount || null,
        startDate: startDate || null,
        expiryDate: expiryDate || null,
        usageLimit: usageLimit || null,
        usedCount: 0,
        isActive: isActive !== undefined ? isActive : true,
        createdAt: now,
        updatedAt: now,
    };
    const docRef = await db.collection(COLLECTION).add(newCoupon);
    return { id: docRef.id, ...newCoupon };
};

/**
 * Cập nhật coupon
 */
const updateCoupon = async (id, data) => {
    const docRef = db.collection(COLLECTION).doc(id);
    const doc = await docRef.get();
    if (!doc.exists) return null;

    const updateData = {
        ...data,
        updatedAt: new Date().toISOString(),
    };
    // Không cho phép cập nhật code? Có thể cho phép nhưng cần kiểm tra trùng
    await docRef.update(updateData);
    const updated = await docRef.get();
    return { id: updated.id, ...updated.data() };
};

/**
 * Xóa coupon (xóa cứng hoặc set isActive = false? Tôi sẽ xóa cứng)
 */
const deleteCoupon = async (id) => {
    const docRef = db.collection(COLLECTION).doc(id);
    const doc = await docRef.get();
    if (!doc.exists) return false;
    await docRef.delete();
    return true;
};



module.exports = {
    getCoupons,
    getCouponById,
    createCoupon,
    updateCoupon,
    deleteCoupon,
};