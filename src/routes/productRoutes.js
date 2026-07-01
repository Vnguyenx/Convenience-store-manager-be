const express = require('express');
const router = express.Router();

const {
    getAllProducts,
    getProductById,
    createProduct,
    updateProduct,
    deleteProduct,
    getNearExpiryProducts,
    getExpiredProducts,
    writeOffProduct,
} = require('../controllers/productController');

const verifyToken = require('../middlewares/verifyToken');
const requireRole = require('../middlewares/requireRole');

// ⚠️ Route cụ thể ('near-expiry', 'expired') PHẢI đặt TRƯỚC '/:id',
// nếu không Express sẽ hiểu 'near-expiry' là 1 giá trị :id và gọi nhầm getProductById.
router.get('/near-expiry', verifyToken, getNearExpiryProducts);            // Admin + Staff
router.get('/expired', verifyToken, getExpiredProducts);                   // Admin + Staff

router.get('/', verifyToken, getAllProducts);                              // Admin + Staff
router.get('/:id', verifyToken, getProductById);                           // Admin + Staff
router.post('/', verifyToken, requireRole('admin'), createProduct);        // Admin only
router.put('/:id', verifyToken, requireRole('admin'), updateProduct);      // Admin only
router.delete('/:id', verifyToken, requireRole('admin'), deleteProduct);   // Admin only
router.patch('/:id/write-off', verifyToken, requireRole('admin'), writeOffProduct); // Admin only

module.exports = router;