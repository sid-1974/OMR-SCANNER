const express = require('express');
const router = express.Router();
const upload = require('../../common/middleware/upload.middleware');
const { uploadScan } = require('./scan.controller');

// Mount at /api so it matches /api/upload_scan
router.post('/upload_scan', upload.single('scan_image'), uploadScan);

module.exports = router;
