const { auth, db } = require('../config/firebase');

const verifyToken = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ message: 'Không có token xác thực' });
    }

    const token = authHeader.split('Bearer ')[1];

    try {
        const decoded = await auth.verifyIdToken(token);
        const userDoc = await db.collection('users').doc(decoded.uid).get();

        if (!userDoc.exists) {
            return res.status(404).json({ message: 'Không tìm thấy thông tin người dùng' });
        }

        req.user = { uid: decoded.uid, ...userDoc.data() };
        next();
    } catch (err) {
        return res.status(401).json({ message: 'Token không hợp lệ hoặc đã hết hạn' });
    }
};

module.exports = verifyToken;