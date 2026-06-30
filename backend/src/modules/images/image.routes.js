const express = require('express');
const router = express.Router();
const { getImage } = require('./image.controller');

router.get('/images/:id', getImage);

module.exports = router;
