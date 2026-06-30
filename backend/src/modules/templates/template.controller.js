const mongoose = require('mongoose');
const Template = require('./templateGroup.model');
const OMRTemplate = require('./omrTemplate.model');
// Note: We need AnswerKey here to populate answer keys in getTemplates
const AnswerKey = require('../evaluation/answerKey.model');
const { successResponse, errorResponse } = require('../../common/utils/apiResponse');
const { saveImageToDB } = require('../images/image.controller');

// Get templates
const getTemplates = async (req, res, next) => {
  try {
    const { id, parent_id, pattern = 'A', qpcode } = req.query;

    if (id) {
      if (!mongoose.Types.ObjectId.isValid(id)) {
        return errorResponse(res, 400, 'Invalid template ID format.');
      }
      const template = await OMRTemplate.findById(id).lean();
      if (template) {
        let query = { template_id: id, pattern };
        if (qpcode) {
          query.qpcode = qpcode;
        } else {
          query.$or = [{ qpcode: null }, { qpcode: '' }];
        }
        
        const keys = await AnswerKey.find(query).sort({ question_number: 1 }).lean();
        template.id = template._id;
        template.answer_key = keys;
        
        return successResponse(res, 200, 'Template fetched successfully', { template });
      } else {
        return errorResponse(res, 404, 'Template design not found.');
      }
    } else if (parent_id) {
      if (!mongoose.Types.ObjectId.isValid(parent_id)) {
        return errorResponse(res, 400, 'Invalid parent template ID format.');
      }
      const qpcodes = (await OMRTemplate.find({ template_id: parent_id }).sort({ createdAt: -1 }).lean()).map(q => ({ ...q, id: q._id }));
      return successResponse(res, 200, 'QPCodes fetched successfully', { qpcodes });
    } else {
      const parents = (await Template.find().sort({ createdAt: -1 }).lean()).map(p => ({ ...p, id: p._id }));
      const templates = (await OMRTemplate.find().sort({ createdAt: -1 }).lean()).map(t => ({ ...t, id: t._id }));
      return successResponse(res, 200, 'Templates fetched successfully', { parents, templates });
    }
  } catch (error) {
    next(error);
  }
};

// Save template
const saveTemplate = async (req, res, next) => {
  try {
    let { id, name, width, height, anchors_json, regno_config, sheetno_config, qpcode, qpcode_config, questions_config } = req.body;
    
    if (!name || !width || !height || !anchors_json || !questions_config) {
      return errorResponse(res, 400, 'Missing required fields.');
    }

    // JSON parsing
    anchors_json = typeof anchors_json === 'string' ? JSON.parse(anchors_json) : anchors_json;
    questions_config = typeof questions_config === 'string' ? JSON.parse(questions_config) : questions_config;
    regno_config = typeof regno_config === 'string' && regno_config !== 'null' ? JSON.parse(regno_config) : null;
    sheetno_config = typeof sheetno_config === 'string' && sheetno_config !== 'null' ? JSON.parse(sheetno_config) : null;
    qpcode_config = typeof qpcode_config === 'string' && qpcode_config !== 'null' ? JSON.parse(qpcode_config) : null;

    let parent = await Template.findOne({ name });
    if (!parent) {
      parent = await Template.create({ name });
    }

    let template_id_res;
    let dest_path = '';

    if (id && id !== '0') {
      if (!mongoose.Types.ObjectId.isValid(id)) {
        return errorResponse(res, 400, 'Invalid template design ID format.');
      }
      const existing = await OMRTemplate.findById(id);
      if (!existing) {
        return errorResponse(res, 404, 'Template design to update not found.');
      }
      if (req.file) {
        dest_path = await saveImageToDB(req.file);
      } else {
        dest_path = existing.blank_image_path;
      }

      existing.template_id = parent._id;
      existing.name = name;
      existing.blank_image_path = dest_path;
      existing.width = Number(width);
      existing.height = Number(height);
      existing.anchors_json = anchors_json;
      existing.regno_config = regno_config;
      existing.sheetno_config = sheetno_config;
      existing.qpcode = qpcode === 'null' ? null : qpcode;
      existing.qpcode_config = qpcode_config;
      existing.questions_config = questions_config;
      
      await existing.save();
      template_id_res = existing._id;
    } else {
      if (!req.file) {
        return errorResponse(res, 400, 'Blank OMR sheet image is required for new templates.');
      }
      dest_path = await saveImageToDB(req.file);
      
      const newTemplate = await OMRTemplate.create({
        template_id: parent._id,
        name,
        blank_image_path: dest_path,
        width: Number(width),
        height: Number(height),
        anchors_json,
        regno_config,
        sheetno_config,
        qpcode: qpcode === 'null' ? null : qpcode,
        qpcode_config,
        questions_config
      });
      template_id_res = newTemplate._id;
    }

    return successResponse(res, 200, 'OMR template saved successfully.', {
      parent_id: parent._id,
      template_id: template_id_res,
      blank_image_path: dest_path
    });

  } catch (error) {
    next(error);
  }
};

// Delete template
const deleteTemplate = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return errorResponse(res, 400, 'Invalid template ID format.');
    }

    const existing = await OMRTemplate.findById(id);
    if (!existing) {
      return errorResponse(res, 404, 'Template design not found.');
    }

    const parentId = existing.template_id;

    // Delete the template design
    await OMRTemplate.findByIdAndDelete(id);

    // Delete associated answer keys
    await AnswerKey.deleteMany({ template_id: id });

    // Check if the parent group has any other designs left
    const remainingDesigns = await OMRTemplate.countDocuments({ template_id: parentId });
    if (remainingDesigns === 0) {
      // Clean up the parent group if it has no more child designs
      await Template.findByIdAndDelete(parentId);
    }

    return successResponse(res, 200, 'Template deleted successfully.');
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getTemplates,
  saveTemplate,
  deleteTemplate
};
