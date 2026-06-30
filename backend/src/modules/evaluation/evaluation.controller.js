const mongoose = require('mongoose');
const AnswerKey = require('./answerKey.model');
const StudentResponse = require('./studentResponse.model');
const EvaluationResult = require('./evaluationResult.model');
const ScannedSheet = require('../scans/scan.model');
const OMRTemplate = require('../templates/omrTemplate.model');
const { successResponse, errorResponse } = require('../../common/utils/apiResponse');
const { saveImageToDB } = require('../images/image.controller');

const saveAnswerKey = async (req, res, next) => {
  try {
    const { template_id, pattern = 'A', qpcode, answers } = req.body;
    
    if (!template_id || !Array.isArray(answers)) {
      return errorResponse(res, 400, 'Invalid template_id or answers array.');
    }

    if (!mongoose.Types.ObjectId.isValid(template_id)) {
      return errorResponse(res, 400, 'Invalid template_id format.');
    }

    const template = await OMRTemplate.findById(template_id);
    if (!template) return errorResponse(res, 404, 'Template does not exist.');

    let query = { template_id, pattern };
    if (qpcode) {
      query.qpcode = qpcode;
    } else {
      query.$or = [{ qpcode: null }, { qpcode: '' }];
    }

    await AnswerKey.deleteMany(query);

    const keysToInsert = answers
      .filter(a => a.question_number > 0 && a.correct_option)
      .map(a => ({
        template_id,
        pattern,
        qpcode: qpcode || null,
        question_number: a.question_number,
        correct_option: a.correct_option.trim().toUpperCase()
      }));

    if (keysToInsert.length > 0) {
      await AnswerKey.insertMany(keysToInsert);
    }

    return successResponse(res, 200, 'Answer keys saved successfully.');
  } catch (error) {
    next(error);
  }
};

const saveResponse = async (req, res, next) => {
  try {
    let { scanned_sheet_id, omr_id, sheet_number, student_regno, status = 'approved', pattern = 'A', qpcode, responses } = req.body;
    
    omr_id = omr_id || sheet_number;
    
    if (!scanned_sheet_id || !responses) {
      return errorResponse(res, 400, 'Missing scanned_sheet_id or responses.');
    }

    const responsesArray = typeof responses === 'string' ? JSON.parse(responses) : responses;
    
    const sheet = await ScannedSheet.findById(scanned_sheet_id);
    if (!sheet) return errorResponse(res, 404, 'Scanned sheet record not found.');

    let aligned_image_path = sheet.aligned_image_path;
    if (req.file) {
      aligned_image_path = await saveImageToDB(req.file);
    }

    sheet.omr_id = omr_id;
    sheet.qpcode = qpcode || null;
    sheet.student_regno = student_regno;
    sheet.aligned_image_path = aligned_image_path;
    sheet.status = status;
    sheet.pattern = pattern;
    await sheet.save();

    await StudentResponse.deleteMany({ omr_id });

    const responsesToInsert = responsesArray.map(r => ({
      omr_id,
      question_number: Number(r.question_number),
      selected_option: r.selected_option ? r.selected_option.trim().toUpperCase() : null
    }));
    if (responsesToInsert.length > 0) {
      await StudentResponse.insertMany(responsesToInsert);
    }

    // Evaluate
    let query = { template_id: sheet.template_id, pattern };
    if (qpcode) {
      query.qpcode = qpcode;
    } else {
      query.$or = [{ qpcode: null }, { qpcode: '' }];
    }
    
    const keys = await AnswerKey.find(query);
    if (keys.length > 0) {
      const correctMap = {};
      keys.forEach(k => { correctMap[k.question_number] = k.correct_option; });

      let correct_count = 0, wrong_count = 0, blank_count = 0;
      
      responsesArray.forEach(r => {
        const q_num = Number(r.question_number);
        const sel_opt = r.selected_option ? r.selected_option.trim().toUpperCase() : '';
        
        if (correctMap[q_num]) {
          if (!sel_opt || sel_opt === 'BLANK') {
            blank_count++;
          } else if (sel_opt === correctMap[q_num]) {
            correct_count++;
          } else {
            wrong_count++;
          }
        }
      });

      await EvaluationResult.deleteMany({ omr_id });
      await EvaluationResult.create({
        omr_id,
        qpcode: qpcode || null,
        student_regno,
        total_questions: keys.length,
        correct_answers: correct_count,
        wrong_answers: wrong_count,
        blank_answers: blank_count,
        score: correct_count
      });
    }

    return successResponse(res, 200, 'Responses saved and evaluated successfully.', { scanned_sheet_id });

  } catch (error) {
    next(error);
  }
};

const getQpcodes = async (req, res, next) => {
  try {
    const { template_id } = req.query;
    if (!template_id) return errorResponse(res, 400, 'Template ID is required');

    if (!mongoose.Types.ObjectId.isValid(template_id)) {
      return errorResponse(res, 400, 'Invalid template_id format.');
    }

    const keys = await AnswerKey.find({ template_id, qpcode: { $ne: null, $ne: '' } }).distinct('qpcode');
    return successResponse(res, 200, 'QP Codes fetched', { qpcodes: keys });
  } catch (error) {
    next(error);
  }
};

const compareResults = async (req, res, next) => {
  try {
    const { template_id, page: pageStr, limit: limitStr, qpcode } = req.query;
    const page = parseInt(pageStr) || 1;
    const limit = parseInt(limitStr) || 20;

    if (!template_id) return errorResponse(res, 400, 'Valid template_id is required.');

    if (!mongoose.Types.ObjectId.isValid(template_id)) {
      return errorResponse(res, 400, 'Invalid template_id format.');
    }

    const keys = await AnswerKey.find({ template_id }).sort({ question_number: 1 }).lean();
    if (keys.length === 0) {
      return res.json({ success: false, message: 'No answer key has been set for this template yet. Please configure the answer key first.' });
    }

    const answer_key_map = {};
    keys.forEach(k => {
      const p = k.pattern;
      const qpc = k.qpcode || 'default';
      const q = k.question_number;
      if (!answer_key_map[p]) answer_key_map[p] = {};
      if (!answer_key_map[p][qpc]) answer_key_map[p][qpc] = {};
      answer_key_map[p][qpc][q] = k.correct_option;
    });

    const sheetQuery = { template_id };
    if (qpcode) {
      sheetQuery.qpcode = qpcode;
    }
    const sheets = await ScannedSheet.find(sheetQuery).lean();
    const sheetOmrIds = sheets.map(s => s.omr_id);

    const totalCount = await EvaluationResult.countDocuments({ omr_id: { $in: sheetOmrIds } });
    const totalPages = Math.ceil(totalCount / limit) || 1;

    const evalResults = await EvaluationResult.find({ omr_id: { $in: sheetOmrIds } })
      .sort({ score: -1, student_regno: 1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();
    
    const responses = await StudentResponse.find({ omr_id: { $in: sheets.map(s => s.omr_id) } }).lean();
    const responseByOmrId = {};
    responses.forEach(r => {
      if (!responseByOmrId[r.omr_id]) responseByOmrId[r.omr_id] = {};
      responseByOmrId[r.omr_id][r.question_number] = r.selected_option;
    });

    const sheetByOmrId = {};
    sheets.forEach(s => sheetByOmrId[s.omr_id] = s);

    const detailed_results = evalResults.map(er => {
      const s = sheetByOmrId[er.omr_id];
      if (!s) return null;

      const student_pattern = s.pattern || 'A';
      const student_qpcode = s.qpcode || 'default';

      let student_answer_key = {};
      if (answer_key_map[student_pattern] && answer_key_map[student_pattern][student_qpcode]) {
        student_answer_key = answer_key_map[student_pattern][student_qpcode];
      } else if (answer_key_map[student_pattern] && answer_key_map[student_pattern]['default']) {
        student_answer_key = answer_key_map[student_pattern]['default'];
      }

      const comparison_matrix = [];
      const respMap = responseByOmrId[er.omr_id] || {};

      Object.keys(student_answer_key).forEach(q_num_str => {
        const q_num = Number(q_num_str);
        const correct_opt = student_answer_key[q_num];
        const sel_opt = respMap[q_num] || 'BLANK';
        const is_correct = (sel_opt === correct_opt);

        comparison_matrix.push({
          question_number: q_num,
          correct_option: correct_opt,
          selected_option: sel_opt,
          is_correct
        });
      });

      return {
        scanned_sheet_id: s._id,
        student_regno: er.student_regno,
        omr_id: er.omr_id,
        sheet_number: s.omr_id,
        pattern: student_pattern,
        raw_image_path: s.raw_image_path,
        aligned_image_path: s.aligned_image_path,
        total_questions: er.total_questions,
        correct_answers: er.correct_answers,
        wrong_answers: er.wrong_answers,
        blank_answers: er.blank_answers,
        score: er.score,
        evaluated_at: er.evaluatedAt,
        comparison_matrix
      };
    }).filter(r => r !== null);

    return successResponse(res, 200, 'Comparison matrix fetched', { 
      answer_key: keys, 
      results: detailed_results,
      pagination: {
        total: totalCount,
        total_pages: totalPages,
        page,
        limit
      }
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  saveAnswerKey,
  saveResponse,
  getQpcodes,
  compareResults
};
