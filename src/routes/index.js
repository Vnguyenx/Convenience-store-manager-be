const express = require('express');
const router = express.Router();

const authRoutes = require('./authRoutes');
const productRoutes = require('./productRoutes');
const orderRoutes = require('./orderRoutes');
const qrConfigRoutes = require('./qrConfigRoutes');
const couponRoutes = require('./couponRoutes');
const staffRoutes   = require('./staffRoutes');
const inventoryRoutes = require('./inventoryRoutes');
const purchaseOrderRoutes = require('./purchaseOrderRoutes');
const statisticsRoutes = require('./statisticsRoutes');
const settingsRoutes = require('./settingsRoutes');



router.use('/auth', authRoutes);
router.use('/products', productRoutes);
router.use('/orders', orderRoutes);
router.use('/qr-config', qrConfigRoutes);
router.use('/coupons', couponRoutes);
router.use('/admin',    staffRoutes);
router.use('/admin', inventoryRoutes);
router.use('/admin', purchaseOrderRoutes);
router.use('/admin', statisticsRoutes);
router.use('/admin/settings', settingsRoutes);

module.exports = router;