// src/services/productService.js

// ⚠️ Tier giảm giá KHÔNG còn hardcode ở đây — đã chuyển ra Firestore (collection 'settings',
// doc 'expiryDiscount') để admin chỉnh tay. Xem src/services/settingsService.js.
// Các hàm dưới đây nhận `tiers` từ ngoài truyền vào (caller tự lấy qua
// settingsService.getExpiryDiscountTiers() rồi truyền xuống — tránh đọc Firestore N lần cho N sản phẩm).

const NEAR_EXPIRY_THRESHOLD_DAYS = 7; // ngưỡng để coi là "cận hạn"

/**
 * Tính số ngày còn lại đến khi hết hạn.
 * > 0: còn hạn X ngày | 0: hết hạn hôm nay | < 0: đã hết hạn X ngày trước | null: không có expiryDate
 */
const getDaysUntilExpiry = (expiryDate) => {
    if (!expiryDate) return null;

    const now = new Date();
    const expiry = new Date(expiryDate);

    // So sánh theo mốc ngày (00:00), tránh lệch do giờ trong ngày
    const nowDateOnly = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const expiryDateOnly = new Date(expiry.getFullYear(), expiry.getMonth(), expiry.getDate());

    const diffMs = expiryDateOnly - nowDateOnly;
    return Math.round(diffMs / (1000 * 60 * 60 * 24));
};

/**
 * Sản phẩm đã hết hạn hay chưa (ngày hiện tại đã vượt qua expiryDate).
 */
const isExpired = (product) => {
    const daysLeft = getDaysUntilExpiry(product?.expiryDate);
    return daysLeft != null && daysLeft < 0;
};

/**
 * Tính giá bán thực tế theo % giảm giá cận date.
 * KHÔNG sửa sellPrice/discountPrice gốc trong Firestore — chỉ tính tạm khi trả về FE.
 * @param {object} product - dữ liệu sản phẩm (cần field sellPrice, expiryDate)
 * @param {Array<{maxDays: number, percent: number}>} tiers - lấy từ settingsService.getExpiryDiscountTiers()
 */
const getEffectivePrice = (product, tiers) => {
    const daysLeft = getDaysUntilExpiry(product.expiryDate);

    if (daysLeft == null) {
        return { effectivePrice: product.sellPrice, expiryDiscountPercent: 0, daysLeft: null, isExpired: false };
    }

    if (daysLeft < 0) {
        return { effectivePrice: product.sellPrice, expiryDiscountPercent: 0, daysLeft, isExpired: true };
    }

    // Chọn tier có % giảm cao nhất trong các tier thoả điều kiện daysLeft <= maxDays
    const matchedTier = (tiers || [])
        .filter((t) => daysLeft <= t.maxDays)
        .reduce((best, t) => (t.percent > (best?.percent ?? -1) ? t : best), null);

    if (!matchedTier) {
        return { effectivePrice: product.sellPrice, expiryDiscountPercent: 0, daysLeft, isExpired: false };
    }

    const effectivePrice = Math.round(product.sellPrice * (1 - matchedTier.percent / 100));
    return { effectivePrice, expiryDiscountPercent: matchedTier.percent, daysLeft, isExpired: false };
};

/**
 * Gắn thêm thông tin cận date/hết hạn vào 1 product object (dùng cho response API).
 */
const enrichWithExpiryInfo = (product, tiers) => {
    const { effectivePrice, expiryDiscountPercent, daysLeft, isExpired: expired } = getEffectivePrice(product, tiers);
    return { ...product, effectivePrice, expiryDiscountPercent, daysLeft, isExpired: expired };
};

/**
 * Lấy danh sách sản phẩm cận hạn (daysLeft trong khoảng [0, NEAR_EXPIRY_THRESHOLD_DAYS])
 * KHÔNG bao gồm sản phẩm đã hết hạn hẳn (daysLeft < 0) — phần đó xử lý riêng ở getExpiredProducts.
 */
const filterNearExpiry = (products, tiers) => {
    return products
        .map((p) => enrichWithExpiryInfo(p, tiers))
        .filter((p) => p.daysLeft != null && p.daysLeft >= 0 && p.daysLeft <= NEAR_EXPIRY_THRESHOLD_DAYS);
};

/**
 * Lấy danh sách sản phẩm đã hết hạn (cần huỷ / không được bán).
 */
const filterExpired = (products, tiers) => {
    return products.map((p) => enrichWithExpiryInfo(p, tiers)).filter((p) => p.isExpired);
};

/**
 * Chặn bán hàng hết hạn — gọi trong luồng tạo order, trước khi trừ stockQuantity.
 * Throw error để controller/orderService bắt và trả 400.
 */
const assertNotExpired = (product) => {
    if (isExpired(product)) {
        const err = new Error(`Sản phẩm "${product.name}" (${product.ID}) đã hết hạn, không thể bán`);
        err.statusCode = 400;
        throw err;
    }
};

module.exports = {
    NEAR_EXPIRY_THRESHOLD_DAYS,
    getDaysUntilExpiry,
    isExpired,
    getEffectivePrice,
    enrichWithExpiryInfo,
    filterNearExpiry,
    filterExpired,
    assertNotExpired,
};