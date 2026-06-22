const express = require('express');
const router = express.Router();
const couponController = require('../controllers/couponController');
const verifyToken = require('../middlewares/verifyToken');
const requireRole = require('../middlewares/requireRole');

// Tất cả đều yêu cầu xác thực
router.use(verifyToken);

// GET: staff và admin đều được
router.get('/', couponController.getCoupons);
router.get('/:id', couponController.getCouponById);

// POST, PUT, DELETE: chỉ admin
router.post('/', requireRole('admin'), couponController.createCoupon);
router.put('/:id', requireRole('admin'), couponController.updateCoupon);
router.delete('/:id', requireRole('admin'), couponController.deleteCoupon);

module.exports = router;