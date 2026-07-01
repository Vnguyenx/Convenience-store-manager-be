const { db } = require('../config/firebase');
const productService = require('../services/productService');
const settingsService = require('../services/settingsService');

const COLLECTION = 'products';

// Danh sách field hợp lệ — chặn field rác khi update
const ALLOWED_FIELDS = [
    'ID', 'name', 'category', 'unit',
    'importPrice', 'sellPrice', 'discountPrice',
    'stockQuantity', 'minStockThreshold',
    'expiryDate', 'imageURL',
];

const isProductCodeTaken = async (code, excludeDocId = null) => {
    const snapshot = await db.collection(COLLECTION).where('ID', '==', code).get();
    if (snapshot.empty) return false;
    if (excludeDocId) {
        return snapshot.docs.some((doc) => doc.id !== excludeDocId);
    }
    return true;
};

// Lọc body, chỉ giữ field hợp lệ
const filterAllowedFields = (body) => {
    const result = {};
    for (const key of ALLOWED_FIELDS) {
        if (body[key] !== undefined) result[key] = body[key];
    }
    return result;
};

// Validate giá tiền (dùng chung cho create + update)
const validatePrices = (importPrice, sellPrice) => {
    if (importPrice != null && importPrice < 0) {
        return 'Giá nhập không được âm';
    }
    if (sellPrice != null && sellPrice <= 0) {
        return 'Giá bán phải lớn hơn 0';
    }
    return null;
};

exports.getAllProducts = async (req, res) => {
    try {
        const snapshot = await db.collection(COLLECTION).orderBy('createdAt', 'desc').get();
        const products = snapshot.docs.map((doc) => ({ docId: doc.id, ...doc.data() }));

        // ✅ Lấy tier 1 LẦN (có cache RAM 5 phút trong settingsService), rồi dùng cho toàn bộ list
        const tiers = await settingsService.getExpiryDiscountTiers();
        const enriched = products.map((p) => productService.enrichWithExpiryInfo(p, tiers));

        res.json({ products: enriched });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

exports.getProductById = async (req, res) => {
    try {
        const doc = await db.collection(COLLECTION).doc(req.params.id).get();
        if (!doc.exists) return res.status(404).json({ message: 'Không tìm thấy sản phẩm' });

        const tiers = await settingsService.getExpiryDiscountTiers();
        const product = productService.enrichWithExpiryInfo({ docId: doc.id, ...doc.data() }, tiers);
        res.json({ product });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// ✅ MỚI: GET /api/products/near-expiry
// Danh sách sản phẩm cận hạn (còn hạn nhưng sắp hết) — dùng cho tab riêng ở trang quản lý
exports.getNearExpiryProducts = async (req, res) => {
    try {
        const snapshot = await db.collection(COLLECTION).get();
        const products = snapshot.docs.map((doc) => ({ docId: doc.id, ...doc.data() }));

        const tiers = await settingsService.getExpiryDiscountTiers();
        const nearExpiry = productService.filterNearExpiry(products, tiers);
        res.json({ products: nearExpiry });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// ✅ MỚI: GET /api/products/expired
// Danh sách sản phẩm đã hết hạn — dùng để cảnh báo/huỷ hàng, KHÔNG dùng để bán
exports.getExpiredProducts = async (req, res) => {
    try {
        const snapshot = await db.collection(COLLECTION).get();
        const products = snapshot.docs.map((doc) => ({ docId: doc.id, ...doc.data() }));

        const tiers = await settingsService.getExpiryDiscountTiers();
        const expired = productService.filterExpired(products, tiers);
        res.json({ products: expired });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

exports.createProduct = async (req, res) => {
    const {
        ID, name, category, unit,
        importPrice, sellPrice, discountPrice,
        stockQuantity, minStockThreshold, expiryDate, imageURL,
    } = req.body;

    if (!ID || !name || !category || !unit || importPrice == null || sellPrice == null) {
        return res.status(400).json({ message: 'Thiếu thông tin bắt buộc (ID, name, category, unit, importPrice, sellPrice)' });
    }

    const priceError = validatePrices(importPrice, sellPrice);
    if (priceError) return res.status(400).json({ message: priceError });

    try {
        const taken = await isProductCodeTaken(ID);
        if (taken) return res.status(409).json({ message: `Mã sản phẩm "${ID}" đã tồn tại` });

        const now = new Date().toISOString();
        const productData = {
            ID, name, category, unit,
            importPrice, sellPrice,
            discountPrice: discountPrice ?? null,
            stockQuantity: stockQuantity ?? 0,
            minStockThreshold: minStockThreshold ?? 0,
            expiryDate: expiryDate || null,
            imageURL: imageURL || '',
            createdAt: now,
            updatedAt: now,
        };

        const docRef = await db.collection(COLLECTION).add(productData);
        res.status(201).json({ message: 'Thêm sản phẩm thành công', product: { docId: docRef.id, ...productData } });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

exports.updateProduct = async (req, res) => {
    const docId = req.params.id;
    const updateFields = filterAllowedFields(req.body); // ✅ lọc field lạ

    try {
        const docRef = db.collection(COLLECTION).doc(docId);
        const doc = await docRef.get();
        if (!doc.exists) return res.status(404).json({ message: 'Không tìm thấy sản phẩm' });

        const priceError = validatePrices(updateFields.importPrice, updateFields.sellPrice); // ✅ validate giá
        if (priceError) return res.status(400).json({ message: priceError });

        if (updateFields.ID && updateFields.ID !== doc.data().ID) {
            const taken = await isProductCodeTaken(updateFields.ID, docId);
            if (taken) return res.status(409).json({ message: `Mã sản phẩm "${updateFields.ID}" đã tồn tại` });
        }

        const now = new Date().toISOString();
        await docRef.update({ ...updateFields, updatedAt: now });

        const updatedDoc = await docRef.get();
        const tiers = await settingsService.getExpiryDiscountTiers();
        const product = productService.enrichWithExpiryInfo({ docId, ...updatedDoc.data() }, tiers);
        res.json({ message: 'Cập nhật sản phẩm thành công', product });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

exports.deleteProduct = async (req, res) => {
    try {
        const docRef = db.collection(COLLECTION).doc(req.params.id);
        const doc = await docRef.get();
        if (!doc.exists) return res.status(404).json({ message: 'Không tìm thấy sản phẩm' });

        await docRef.delete();
        res.json({ message: `Xóa sản phẩm "${doc.data().ID}" thành công` });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// ✅ MỚI: PATCH /api/products/:id/write-off
// Huỷ hàng hết hạn/hư hỏng — giảm stockQuantity, KHÔNG xoá sản phẩm khỏi hệ thống
exports.writeOffProduct = async (req, res) => {
    const { quantity, reason } = req.body;

    if (!quantity || quantity <= 0) {
        return res.status(400).json({ message: 'Số lượng huỷ phải lớn hơn 0' });
    }

    try {
        const docRef = db.collection(COLLECTION).doc(req.params.id);
        const doc = await docRef.get();
        if (!doc.exists) return res.status(404).json({ message: 'Không tìm thấy sản phẩm' });

        const product = doc.data();
        const currentStock = product.stockQuantity ?? 0;
        const writeOffQty = Math.min(quantity, currentStock);

        await docRef.update({
            stockQuantity: currentStock - writeOffQty,
            updatedAt: new Date().toISOString(),
        });

        // Ghi log hao hụt để phục vụ báo cáo thống kê sau này
        await db.collection('stockWriteOffs').add({
            productDocId: req.params.id,
            productID: product.ID,
            productName: product.name,
            quantity: writeOffQty,
            reason: reason || 'expired',
            createdAt: new Date().toISOString(),
            createdBy: req.user?.uid ?? null, // nếu có middleware auth gắn req.user
        });

        res.json({ message: `Đã huỷ ${writeOffQty} ${product.unit || 'sản phẩm'} "${product.name}"` });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};