const mongoose = require('mongoose');

const scannedSheetSchema = new mongoose.Schema({
  template_id: { type: mongoose.Schema.Types.ObjectId, ref: 'OMRTemplate', required: true },
  pattern: { type: String, required: true, default: 'A' },
  qpcode: { type: String, default: null },
  omr_id: { type: String, default: null },
  student_regno: { type: String, default: null },
  raw_image_path: { type: String, required: true },
  aligned_image_path: { type: String, default: '' },
  status: { type: String, enum: ['pending_approval', 'approved'], default: 'pending_approval' },
  scannedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('ScannedSheet', scannedSheetSchema);
