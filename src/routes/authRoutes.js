const express = require('express');
const router = express.Router();

const { registerUser, getMe, logout } = require('../controllers/authController');
const verifyToken = require('../middlewares/verifyToken');

router.post('/register', registerUser);     // ← không cần token nữa, ai cũng gọi được
router.get('/me', verifyToken, getMe);
router.post('/logout', verifyToken, logout);

module.exports = router;