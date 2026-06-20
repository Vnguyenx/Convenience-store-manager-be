const express = require('express');
const router = express.Router();

const { registerUser, getMe, logout, resetPassword, updateProfile } = require('../controllers/authController');
const verifyToken = require('../middlewares/verifyToken');

router.post('/register', registerUser);     // ← không cần token nữa, ai cũng gọi được
router.get('/me', verifyToken, getMe);
router.post('/logout', verifyToken, logout);
router.put('/profile',        verifyToken, updateProfile);
router.put('/reset-password', verifyToken, resetPassword);

module.exports = router;