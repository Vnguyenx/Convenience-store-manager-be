const express = require('express');
const router = express.Router();

const authRoutes = require('./authRoutes');
const productRoutes = require('./productRoutes');
const orderRoutes = require('./orderRoutes');
const qrConfigRoutes = require('./qrConfigRoutes');
const couponRoutes = require('./couponRoutes');
const staffRoutes   = require('./staffRoutes');



router.use('/auth', authRoutes);
router.use('/products', productRoutes);
router.use('/orders', orderRoutes);
router.use('/qr-config', qrConfigRoutes);
router.use('/coupons', couponRoutes);
router.use('/admin',    staffRoutes);


module.exports = router;