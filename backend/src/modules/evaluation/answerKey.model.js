const mongoose = require('mongoose');

const answerKeySchema = new mongoose.Schema({
  template_id: { type: mongoose.Schema.Types.ObjectId, ref: 'OMRTemplate', required: true },
  pattern: { type: String, required: true, default: 'A' },
  qpcode: { type: String, default: null },
  question_number: { type: Number, required: true },
  correct_option: { type: String, required: true }
});

module.exports = mongoose.model('AnswerKey', answerKeySchema);
