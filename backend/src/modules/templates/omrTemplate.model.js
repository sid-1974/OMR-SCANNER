const mongoose = require('mongoose');

const omrTemplateSchema = new mongoose.Schema({
  template_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Template', required: true },
  name: { type: String, required: true },
  blank_image_path: { type: String, required: true },
  width: { type: Number, required: true },
  height: { type: Number, required: true },
  anchors_json: { type: Object, required: true },
  regno_config: { type: Object, default: null },
  sheetno_config: { type: Object, default: null },
  qpcode: { type: String, default: null },
  qpcode_config: { type: Object, default: null },
  questions_config: { type: Object, required: true },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('OMRTemplate', omrTemplateSchema);
