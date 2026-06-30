const mongoose = require('mongoose');

const evaluationResultSchema = new mongoose.Schema({
  omr_id: { type: String, required: true },
  qpcode: { type: String, default: null },
  student_regno: { type: String, required: true },
  total_questions: { type: Number, required: true },
  correct_answers: { type: Number, required: true },
  wrong_answers: { type: Number, required: true },
  blank_answers: { type: Number, required: true },
  score: { type: Number, required: true },
  evaluatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('EvaluationResult', evaluationResultSchema);
