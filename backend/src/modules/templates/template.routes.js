const express = require('express');
const router = express.Router();
const upload = require('../../common/middleware/upload.middleware');
const { getTemplates, saveTemplate, deleteTemplate } = require('./template.controller');

// To maintain backward compatibility with flat endpoint names:
// We mount this router at /api so it responds to /api/get_templates
router.get('/get_templates', getTemplates);
router.post('/save_template', upload.single('blank_image'), saveTemplate);
router.delete('/delete_template/:id', deleteTemplate);

module.exports = router;
