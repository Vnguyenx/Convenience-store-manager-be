const express = require('express');
const router = express.Router();

const {
    getExpiryDiscountTiers,
    updateExpiryDiscountTiers,
} = require('../controllers/settingsController');

const verifyToken = require('../middlewares/verifyToken');
const requireRole = require('../middlewares/requireRole');

// GET cho Admin + Staff xem (staff cần biết % giảm hiện tại khi bán hàng)
router.get('/expiry-discount-tiers', verifyToken, getExpiryDiscountTiers);
// PUT chỉ Admin — quyết định chính sách giảm giá
router.put('/expiry-discount-tiers', verifyToken, requireRole('admin'), updateExpiryDiscountTiers);

module.exports = router;