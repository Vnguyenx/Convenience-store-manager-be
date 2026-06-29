// src/routes/statisticsRoutes.js
// Mounted tại: app.use('/admin', statisticsRoutes)  →  /admin/statistics/*
const express = require('express');
const router = express.Router();

const statisticsCtrl = require('../controllers/admin/statisticsController');
const verifyToken = require('../middlewares/verifyToken');
const requireRole = require('../middlewares/requireRole');

router.use(verifyToken);
router.use(requireRole('admin')); // thống kê doanh thu chỉ admin xem được

router.get('/statistics/revenue/overview',          statisticsCtrl.getRevenueOverview);
router.get('/statistics/revenue/by-time',           statisticsCtrl.getRevenueByTime);
router.get('/statistics/revenue/by-payment-method', statisticsCtrl.getRevenueByPaymentMethod);
router.get('/statistics/revenue/top-products',      statisticsCtrl.getTopProducts);
router.get('/statistics/revenue/by-staff',          statisticsCtrl.getRevenueByStaff);
router.get('/statistics/revenue/by-category',       statisticsCtrl.getRevenueByCategory);

module.exports = router;