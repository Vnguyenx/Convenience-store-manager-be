const express = require('express');
const router = express.Router();

const authRoutes = require('./authRoutes');
const productRoutes = require('./productRoutes');
const orderRoutes = require('./orderRoutes');
const qrConfigRoutes = require('./qrConfigRoutes');

router.use('/auth', authRoutes);
router.use('/products', productRoutes);
router.use('/orders', orderRoutes);
router.use('/qr-config', qrConfigRoutes);

module.exports = router;