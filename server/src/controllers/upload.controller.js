const { createProductImageSignature, UploadError } = require('../services/upload.service');

// POST /uploads/signature: permission to upload comes from the route (products.create or products.update).
function signature(req, res, next) {
  // A super admin has no brand of their own, so there is no folder to upload into.
  if (!req.tenantBrandId) {
    return res
      .status(403)
      .json({ success: false, message: 'You are not authorized to perform this action.', code: 'NO_BRAND' });
  }

  try {
    return res.status(200).json({ success: true, upload: createProductImageSignature(req.tenantBrandId) });
  } catch (err) {
    if (err instanceof UploadError) {
      return res.status(err.status).json({ success: false, message: err.message, code: 'UPLOAD_NOT_CONFIGURED' });
    }
    return next(err);
  }
}

module.exports = { signature };