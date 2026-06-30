const express = require('express');
const router = express.Router();

const templateRoutes = require('../modules/templates/template.routes');
const scanRoutes = require('../modules/scans/scan.routes');
const evaluationRoutes = require('../modules/evaluation/evaluation.routes');
const imageRoutes = require('../modules/images/image.routes');

// Mount all modular routes directly to maintain backward compatibility 
// with the frontend which expects /api/get_templates instead of /api/templates/get_templates
router.use('/', templateRoutes);
router.use('/', scanRoutes);
router.use('/', evaluationRoutes);
router.use('/', imageRoutes);

module.exports = router;
