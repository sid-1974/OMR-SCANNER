const express = require('express');
const router = express.Router();
const upload = require('../../common/middleware/upload.middleware');
const { saveAnswerKey, saveResponse, getQpcodes, compareResults } = require('./evaluation.controller');

// Mount at /api so it matches old PHP file names without .php
router.post('/save_answer_key', saveAnswerKey);
router.post('/save_response', upload.single('aligned_image'), saveResponse);
router.get('/get_qpcodes', getQpcodes);
router.get('/compare', compareResults);

module.exports = router;
