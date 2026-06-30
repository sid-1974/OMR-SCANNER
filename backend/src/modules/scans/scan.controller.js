const ScannedSheet = require('./scan.model');
const OMRTemplate = require('../templates/omrTemplate.model');
const { successResponse, errorResponse } = require('../../common/utils/apiResponse');
const { saveImageToDB } = require('../images/image.controller');

const uploadScan = async (req, res, next) => {
  try {
    const { template_id } = req.body;
    if (!template_id) return errorResponse(res, 400, 'Valid template_id is required.');

    const template = await OMRTemplate.findById(template_id);
    if (!template) return errorResponse(res, 404, 'Template does not exist.');

    if (!req.file) return errorResponse(res, 400, 'Scan image file is required.');

    const dest_path = await saveImageToDB(req.file);

    const scannedSheet = await ScannedSheet.create({
      template_id,
      raw_image_path: dest_path,
      status: 'pending_approval'
    });

    return successResponse(res, 200, 'Raw scan uploaded successfully.', {
      scanned_sheet_id: scannedSheet._id,
      raw_image_path: dest_path
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  uploadScan
};
