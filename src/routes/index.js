const express = require('express');
const router = express.Router();

const authRoutes = require('./authRoutes');
const productRoutes = require('./productRoutes');

router.use('/auth', authRoutes);
router.use('/products', productRoutes);

module.exports = router;