const {
  createBlockSchema,
  updateBlockSchema,
  listBlocksQuerySchema,
  resolveQuerySchema,
} = require('../validators/block.validator');
const { objectIdParamSchema } = require('../validators/common.validator');
const {
  listBlocks,
  createBlock,
  updateBlock,
  deactivateBlock,
  resolveBlock,
  BlockError,
} = require('../services/block.service');
const { formatZodError } = require('../utils/formatZodError');

function invalid(res, error) {
  return res.status(400).json({
    success: false,
    message: 'Validation failed.',
    errors: formatZodError(error),
  });
}

function sendError(err, res, next) {
  if (err instanceof BlockError) {
    return res.status(err.status).json({ success: false, message: err.message });
  }
  return next(err);
}

async function list(req, res, next) {
  const parsed = listBlocksQuerySchema.safeParse(req.query);
  if (!parsed.success) return invalid(res, parsed.error);

  try {
    const blocks = await listBlocks(parsed.data);
    return res.status(200).json({ success: true, blocks });
  } catch (err) {
    return next(err);
  }
}

// "Where am I?" — coordinates in, nearest block + city out (or nulls when the
// position is outside every supported city, so the client can fall back to a
// manual pick). Not an error: the shopper is simply somewhere we don't serve.
async function resolve(req, res, next) {
  const parsed = resolveQuerySchema.safeParse(req.query);
  if (!parsed.success) return invalid(res, parsed.error);

  try {
    const match = await resolveBlock(parsed.data);
    if (!match) {
      return res.status(200).json({ success: true, block: null, city: null, distanceKm: null });
    }
    return res.status(200).json({ success: true, ...match });
  } catch (err) {
    return next(err);
  }
}

async function create(req, res, next) {
  const parsed = createBlockSchema.safeParse(req.body);
  if (!parsed.success) return invalid(res, parsed.error);

  try {
    const block = await createBlock(parsed.data);
    return res.status(201).json({ success: true, message: 'Block created', block });
  } catch (err) {
    return sendError(err, res, next);
  }
}

async function update(req, res, next) {
  const params = objectIdParamSchema.safeParse(req.params);
  if (!params.success) return invalid(res, params.error);
  const body = updateBlockSchema.safeParse(req.body);
  if (!body.success) return invalid(res, body.error);

  try {
    const block = await updateBlock(params.data.id, body.data);
    return res.status(200).json({ success: true, message: 'Block updated', block });
  } catch (err) {
    return sendError(err, res, next);
  }
}

async function remove(req, res, next) {
  const params = objectIdParamSchema.safeParse(req.params);
  if (!params.success) return invalid(res, params.error);

  try {
    const block = await deactivateBlock(params.data.id);
    return res.status(200).json({ success: true, message: 'Block deactivated', block });
  } catch (err) {
    return sendError(err, res, next);
  }
}

module.exports = { list, resolve, create, update, remove };
