// src/routes/qrConfigRoutes.js
const express = require('express');
const router = express.Router();

const qrConfigController = require('../controllers/qrConfigController');
const verifyToken = require('../middlewares/verifyToken');

router.use(verifyToken);

router.get('/', qrConfigController.getConfig);
router.post('/generate', qrConfigController.generateQr);

module.exports = router;