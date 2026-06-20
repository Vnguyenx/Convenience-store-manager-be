const express = require('express');
const router = express.Router();

const {
    getAllProducts,
    getProductById,
    createProduct,
    updateProduct,
    deleteProduct,
} = require('../controllers/productController');

const verifyToken = require('../middlewares/verifyToken');
const requireRole = require('../middlewares/requireRole');

router.get('/', verifyToken, getAllProducts);                              // Admin + Staff
router.get('/:id', verifyToken, getProductById);                           // Admin + Staff
router.post('/', verifyToken, requireRole('admin'), createProduct);        // Admin only
router.put('/:id', verifyToken, requireRole('admin'), updateProduct);      // Admin only
router.delete('/:id', verifyToken, requireRole('admin'), deleteProduct);   // Admin only

module.exports = router;