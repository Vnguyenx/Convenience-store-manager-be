// src/routes/inventoryRoutes.js
// Mounted tại: app.use('/admin', inventoryRoutes)  →  /admin/suppliers, /admin/inventory/*
const express = require('express');
const router = express.Router();

const supplierCtrl  = require('../controllers/admin/supplierController');
const inventoryCtrl = require('../controllers/admin/inventoryController');
const verifyToken = require('../middlewares/verifyToken');
const requireRole = require('../middlewares/requireRole');

// Mọi request đều cần đăng nhập
router.use(verifyToken);

// ════════════════════════════════════════════════════════════════════════════
//  NHÀ CUNG CẤP  (chỉ admin được quản lý nhà cung cấp)
// ════════════════════════════════════════════════════════════════════════════
router.get   ('/suppliers',     requireRole('admin'), supplierCtrl.getAllSuppliers);
router.get   ('/suppliers/:id', requireRole('admin'), supplierCtrl.getSupplierById);
router.post  ('/suppliers',     requireRole('admin'), supplierCtrl.createSupplier);
router.put   ('/suppliers/:id', requireRole('admin'), supplierCtrl.updateSupplier);
router.delete('/suppliers/:id', requireRole('admin'), supplierCtrl.deleteSupplier);

// ════════════════════════════════════════════════════════════════════════════
//  CẢNH BÁO KHO  (admin + staff đều xem được; đặt trước /checks/:id để không bị conflict route)
// ════════════════════════════════════════════════════════════════════════════
router.get('/inventory/alerts', requireRole('admin'), inventoryCtrl.getAlerts);

// ════════════════════════════════════════════════════════════════════════════
//  KIỂM KÊ KHO
//  - Tạo / xác nhận / xóa phiếu: chỉ admin
//  - Xem danh sách / chi tiết / nhập số lượng thực tế: staff
// ════════════════════════════════════════════════════════════════════════════
router.get   ('/inventory/checks',                   requireRole('admin'),  inventoryCtrl.getAllChecks);
router.get   ('/inventory/checks/:id',                requireRole('admin'), inventoryCtrl.getCheckById);
router.post  ('/inventory/checks',                    requireRole('admin'), inventoryCtrl.createCheck);
router.put   ('/inventory/checks/:id/items/:itemId',  requireRole('admin'), inventoryCtrl.updateCheckItem);
router.post  ('/inventory/checks/:id/confirm',        requireRole('admin'), inventoryCtrl.confirmCheck);
router.delete('/inventory/checks/:id',                requireRole('admin'), inventoryCtrl.deleteCheck);

module.exports = router;