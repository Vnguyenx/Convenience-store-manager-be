// src/routes/purchaseOrderRoutes.js
// Mounted tại: app.use('/admin', purchaseOrderRoutes)  →  /admin/purchase-orders
const express = require('express');
const router = express.Router();

const purchaseOrderCtrl = require('../controllers/admin/purchaseOrderController');
const verifyToken = require('../middlewares/verifyToken');
const requireRole = require('../middlewares/requireRole');

router.use(verifyToken);
router.use(requireRole('admin')); // toàn bộ nghiệp vụ nhập kho chỉ admin thao tác

// ── Purchase Orders ────────────────────────────────────────────────
router.get   ('/purchase-orders',             purchaseOrderCtrl.getAllPurchaseOrders);
router.get   ('/purchase-orders/:id',         purchaseOrderCtrl.getPurchaseOrderById);
router.post  ('/purchase-orders',             purchaseOrderCtrl.createPurchaseOrder);
router.put   ('/purchase-orders/:id',         purchaseOrderCtrl.updatePurchaseOrder);
router.post  ('/purchase-orders/:id/confirm', purchaseOrderCtrl.confirmPurchaseOrder);
router.put   ('/purchase-orders/:id/cancel',  purchaseOrderCtrl.cancelPurchaseOrder);
router.delete('/purchase-orders/:id',         purchaseOrderCtrl.deletePurchaseOrder);

module.exports = router;