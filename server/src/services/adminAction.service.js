const mongoose = require('mongoose');
const AdminAction = require('../models/adminAction.model');

const DEFAULT_LIMIT = 30;

/**
 * The platform admin audit log, per docs/21-next-features-plan.md §G.2.
 *
 * Every admin write calls this with the acting user, the resource.action
 * string, what was acted on and a short human-readable summary. A failure to
 * write the log is reported to the server console but never turns a
 * completed action into an error response.
 */
async function recordAdminAction({ actor, action, target = {}, details }) {
  // Without a connection (unit tests that fake the models) there is nowhere
  // to write; calling create() would only buffer for ten seconds.
  if (mongoose.connection.readyState !== 1) return;
  try {
    await AdminAction.create({
      actor: actor._id,
      actorRole: actor.role,
      action,
      target: {
        ...(target.type && { type: target.type }),
        ...(target.id && { id: target.id }),
        ...(target.label && { label: target.label }),
      },
      ...(details && { details }),
    });
  } catch (err) {
    console.error('Failed to record an admin action:', err.message);
  }
}

function serialize(row) {
  const actor = row.actor && row.actor._id ? row.actor : null;
  return {
    _id: row._id,
    action: row.action,
    actorRole: row.actorRole,
    actor: actor
      ? { _id: actor._id, name: actor.name, email: actor.email }
      : { _id: row.actor },
    target: row.target || {},
    details: row.details,
    createdAt: row.createdAt,
  };
}

async function listAdminActions({ page, limit, action, actor } = {}) {
  const filter = {};
  if (action) filter.action = action;
  if (actor) filter.actor = actor;
  const pageNumber = page || 1;
  const limitNumber = limit || DEFAULT_LIMIT;

  const [rows, total] = await Promise.all([
    AdminAction.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip((pageNumber - 1) * limitNumber)
      .limit(limitNumber)
      .populate('actor', 'name email'),
    AdminAction.countDocuments(filter),
  ]);

  return {
    items: rows.map(serialize),
    pagination: { page: pageNumber, limit: limitNumber, total, pages: Math.ceil(total / limitNumber) },
  };
}

module.exports = { recordAdminAction, listAdminActions };
