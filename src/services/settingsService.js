// src/services/settingsService.js
const { db } = require('../config/firebase');

const SETTINGS_COLLECTION = 'settings';
const EXPIRY_DISCOUNT_DOC_ID = 'expiryDiscount';

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 phút

// Tier mặc định — dùng khi Firestore chưa có config hoặc lỗi đọc
const DEFAULT_EXPIRY_DISCOUNT_TIERS = [
    { maxDays: 1, percent: 50 },
    { maxDays: 3, percent: 30 },
    { maxDays: 7, percent: 15 },
];

// Cache trong RAM — sống theo process, không cần Redis vì quy mô nhỏ
let cache = {
    tiers: null,
    expiresAt: 0,
};

/**
 * Validate cấu trúc tiers trước khi lưu, tránh admin nhập sai làm hỏng tính giá toàn hệ thống.
 */
const validateTiers = (tiers) => {
    if (!Array.isArray(tiers) || tiers.length === 0) {
        throw new Error('Danh sách tier phải là mảng và có ít nhất 1 phần tử');
    }
    for (const t of tiers) {
        if (typeof t.maxDays !== 'number' || t.maxDays < 0) {
            throw new Error('Mỗi tier phải có maxDays là số >= 0');
        }
        if (typeof t.percent !== 'number' || t.percent <= 0 || t.percent > 100) {
            throw new Error('Mỗi tier phải có percent trong khoảng (0, 100]');
        }
    }
};

/**
 * Lấy danh sách tier giảm giá cận date.
 * Có cache RAM 5 phút — chỉ đọc Firestore lại khi cache hết hạn.
 */
const getExpiryDiscountTiers = async () => {
    const now = Date.now();

    if (cache.tiers && cache.expiresAt > now) {
        return cache.tiers;
    }

    try {
        const doc = await db.collection(SETTINGS_COLLECTION).doc(EXPIRY_DISCOUNT_DOC_ID).get();
        const tiers = doc.exists && Array.isArray(doc.data().tiers) && doc.data().tiers.length > 0
            ? doc.data().tiers
            : DEFAULT_EXPIRY_DISCOUNT_TIERS;

        cache = { tiers, expiresAt: now + CACHE_TTL_MS };
        return tiers;
    } catch (err) {
        console.error('Lỗi đọc expiryDiscount settings, dùng tier mặc định:', err.message);
        // Không throw — fallback về tier mặc định để không làm sập luồng bán hàng
        return DEFAULT_EXPIRY_DISCOUNT_TIERS;
    }
};

/**
 * Cập nhật tier giảm giá cận date (chỉ admin gọi).
 * Ghi Firestore + cập nhật cache ngay, không cần chờ TTL cũ hết hạn.
 */
const updateExpiryDiscountTiers = async (tiers, updatedBy = null) => {
    validateTiers(tiers);

    // Sắp xếp theo maxDays tăng dần cho dễ đọc khi admin xem lại
    const sortedTiers = [...tiers].sort((a, b) => a.maxDays - b.maxDays);

    const payload = {
        tiers: sortedTiers,
        updatedAt: new Date().toISOString(),
        updatedBy,
    };

    await db.collection(SETTINGS_COLLECTION).doc(EXPIRY_DISCOUNT_DOC_ID).set(payload);

    // Cập nhật cache ngay để lần đọc kế tiếp có hiệu lực tức thì
    cache = { tiers: sortedTiers, expiresAt: Date.now() + CACHE_TTL_MS };

    return sortedTiers;
};

module.exports = {
    DEFAULT_EXPIRY_DISCOUNT_TIERS,
    getExpiryDiscountTiers,
    updateExpiryDiscountTiers,
};