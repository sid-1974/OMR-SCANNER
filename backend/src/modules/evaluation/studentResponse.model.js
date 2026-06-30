const mongoose = require('mongoose');

const studentResponseSchema = new mongoose.Schema({
  omr_id: { type: String, required: true },
  question_number: { type: Number, required: true },
  selected_option: { type: String, default: null }
});

module.exports = mongoose.model('StudentResponse', studentResponseSchema);
