const {
  createBookingSchema,
  providerAcceptSchema,
  providerProposeSchema,
  providerCompleteSchema,
  cancelBookingSchema,
  disputeSchema,
  resolveDisputeSchema,
  listBookingsQuerySchema,
  adminListBookingsQuerySchema,
  bookingIdParamSchema,
} = require('../validators/serviceBooking.validator');
const {
  ServiceBookingError,
  createBooking,
  providerAccept,
  providerPropose,
  customerAcceptProposal,
  customerDeclineProposal,
  providerStart,
  providerComplete,
  customerConfirm,
  customerDispute,
  cancelBooking,
  resolveDispute,
  listForCustomer,
  listForProvider,
  getBookingForActor,
  listForAdmin,
  getBookingForAdmin,
} = require('../services/serviceBooking.service');
const { ServiceAvailabilityError } = require('../services/serviceAvailability.service');
const { ServiceChatError } = require('../services/serviceChat.service');
const { ServiceReviewError } = require('../services/serviceReview.service');
const { BillingError } = require('../services/billing.service');
const { ROLES } = require('../config/roles');
const { formatZodError } = require('../utils/formatZodError');
const { recordAdminAction } = require('../services/adminAction.service');

function invalid(res, error) {
  return res.status(400).json({ success: false, message: 'Validation failed.', errors: formatZodError(error) });
}

function handleError(err, res, next) {
  if (
    err instanceof ServiceBookingError ||
    err instanceof ServiceAvailabilityError ||
    err instanceof ServiceChatError ||
    err instanceof ServiceReviewError ||
    err instanceof BillingError
  ) {
    return res.status(err.status).json({
      success: false,
      message: err.message,
      ...(err.code && { code: err.code }),
      ...(err.extra || {}),
    });
  }
  return next(err);
}

/** Only the session's identity is used; a client-sent provider or customer id is never read. */
const actorOf = (req) => ({
  _id: req.user._id,
  role: req.user.role,
  providerId: req.tenantProviderId || (req.provider && req.provider._id),
});

function parseId(req, res) {
  const parsed = bookingIdParamSchema.safeParse(req.params);
  if (!parsed.success) {
    invalid(res, parsed.error);
    return null;
  }
  return parsed.data.id;
}

// ---- customer -------------------------------------------------------------

async function customerCreate(req, res, next) {
  const parsed = createBookingSchema.safeParse(req.body);
  if (!parsed.success) return invalid(res, parsed.error);
  try {
    const booking = await createBooking(req.user._id, parsed.data);
    return res.status(201).json({ success: true, message: 'Request sent to the provider.', booking });
  } catch (err) {
    return handleError(err, res, next);
  }
}

async function customerList(req, res, next) {
  const parsed = listBookingsQuerySchema.safeParse(req.query);
  if (!parsed.success) return invalid(res, parsed.error);
  try {
    const result = await listForCustomer(req.user._id, parsed.data);
    return res.status(200).json({ success: true, ...result });
  } catch (err) {
    return handleError(err, res, next);
  }
}

async function customerGet(req, res, next) {
  const id = parseId(req, res);
  if (!id) return undefined;
  try {
    const booking = await getBookingForActor(actorOf(req), id);
    return res.status(200).json({ success: true, booking });
  } catch (err) {
    return handleError(err, res, next);
  }
}

async function acceptProposal(req, res, next) {
  const id = parseId(req, res);
  if (!id) return undefined;
  try {
    const booking = await customerAcceptProposal(req.user._id, id);
    return res.status(200).json({ success: true, message: 'Proposal accepted.', booking });
  } catch (err) {
    return handleError(err, res, next);
  }
}

async function declineProposal(req, res, next) {
  const id = parseId(req, res);
  if (!id) return undefined;
  try {
    const booking = await customerDeclineProposal(req.user._id, id);
    return res.status(200).json({ success: true, message: 'Proposal declined.', booking });
  } catch (err) {
    return handleError(err, res, next);
  }
}

async function confirm(req, res, next) {
  const id = parseId(req, res);
  if (!id) return undefined;
  try {
    const booking = await customerConfirm(req.user._id, id);
    return res.status(200).json({ success: true, message: 'Booking confirmed.', booking });
  } catch (err) {
    return handleError(err, res, next);
  }
}

async function dispute(req, res, next) {
  const id = parseId(req, res);
  if (!id) return undefined;
  const parsed = disputeSchema.safeParse(req.body);
  if (!parsed.success) return invalid(res, parsed.error);
  try {
    const booking = await customerDispute(req.user._id, id, parsed.data);
    return res.status(200).json({ success: true, message: 'Dispute sent to CityCart.', booking });
  } catch (err) {
    return handleError(err, res, next);
  }
}

async function cancel(req, res, next) {
  const id = parseId(req, res);
  if (!id) return undefined;
  const parsed = cancelBookingSchema.safeParse(req.body);
  if (!parsed.success) return invalid(res, parsed.error);
  try {
    const isProvider = req.user.role === ROLES.SERVICE_PROVIDER;
    const booking = await cancelBooking(
      {
        actorId: isProvider ? req.tenantProviderId : req.user._id,
        role: isProvider ? 'PROVIDER' : 'CUSTOMER',
      },
      id,
      parsed.data
    );
    return res.status(200).json({ success: true, message: 'Booking cancelled.', booking });
  } catch (err) {
    return handleError(err, res, next);
  }
}

// ---- provider -------------------------------------------------------------

async function providerList(req, res, next) {
  const parsed = listBookingsQuerySchema.safeParse(req.query);
  if (!parsed.success) return invalid(res, parsed.error);
  try {
    const result = await listForProvider(req.tenantProviderId, parsed.data);
    return res.status(200).json({ success: true, ...result });
  } catch (err) {
    return handleError(err, res, next);
  }
}

async function providerGet(req, res, next) {
  const id = parseId(req, res);
  if (!id) return undefined;
  try {
    const booking = await getBookingForActor(actorOf(req), id);
    return res.status(200).json({ success: true, booking });
  } catch (err) {
    return handleError(err, res, next);
  }
}

async function providerAcceptBooking(req, res, next) {
  const id = parseId(req, res);
  if (!id) return undefined;
  const parsed = providerAcceptSchema.safeParse(req.body);
  if (!parsed.success) return invalid(res, parsed.error);
  try {
    const booking = await providerAccept(req.tenantProviderId, id, parsed.data);
    return res.status(200).json({ success: true, message: 'Booking accepted.', booking });
  } catch (err) {
    return handleError(err, res, next);
  }
}

async function providerProposeBooking(req, res, next) {
  const id = parseId(req, res);
  if (!id) return undefined;
  const parsed = providerProposeSchema.safeParse(req.body);
  if (!parsed.success) return invalid(res, parsed.error);
  try {
    const booking = await providerPropose(req.tenantProviderId, id, parsed.data);
    return res.status(200).json({ success: true, message: 'Proposal sent.', booking });
  } catch (err) {
    return handleError(err, res, next);
  }
}

async function providerStartBooking(req, res, next) {
  const id = parseId(req, res);
  if (!id) return undefined;
  try {
    const booking = await providerStart(req.tenantProviderId, id);
    return res.status(200).json({ success: true, message: 'Job started.', booking });
  } catch (err) {
    return handleError(err, res, next);
  }
}

async function providerCompleteBooking(req, res, next) {
  const id = parseId(req, res);
  if (!id) return undefined;
  const parsed = providerCompleteSchema.safeParse(req.body);
  if (!parsed.success) return invalid(res, parsed.error);
  try {
    const booking = await providerComplete(req.tenantProviderId, id, parsed.data);
    return res.status(200).json({ success: true, message: 'Job completed. The customer will confirm.', booking });
  } catch (err) {
    return handleError(err, res, next);
  }
}

// ---- admin ----------------------------------------------------------------

async function adminList(req, res, next) {
  const parsed = adminListBookingsQuerySchema.safeParse(req.query);
  if (!parsed.success) return invalid(res, parsed.error);
  try {
    const result = await listForAdmin(parsed.data);
    return res.status(200).json({ success: true, ...result });
  } catch (err) {
    return handleError(err, res, next);
  }
}

async function adminGet(req, res, next) {
  const id = parseId(req, res);
  if (!id) return undefined;
  try {
    const booking = await getBookingForAdmin(id);
    return res.status(200).json({ success: true, booking });
  } catch (err) {
    return handleError(err, res, next);
  }
}

async function adminResolveDispute(req, res, next) {
  const id = parseId(req, res);
  if (!id) return undefined;
  const parsed = resolveDisputeSchema.safeParse(req.body);
  if (!parsed.success) return invalid(res, parsed.error);
  try {
    const booking = await resolveDispute(req.user._id, id, parsed.data);
    await recordAdminAction({
      actor: req.user,
      action: 'serviceBooking.resolveDispute',
      target: { type: 'ServiceBooking', id: booking._id },
      details: `${parsed.data.resolution}${parsed.data.note ? `: ${parsed.data.note}` : ''}`,
    });
    return res.status(200).json({ success: true, message: 'Dispute resolved.', booking });
  } catch (err) {
    return handleError(err, res, next);
  }
}

module.exports = {
  customerCreate,
  customerList,
  customerGet,
  acceptProposal,
  declineProposal,
  confirm,
  dispute,
  cancel,
  providerList,
  providerGet,
  providerAcceptBooking,
  providerProposeBooking,
  providerStartBooking,
  providerCompleteBooking,
  adminList,
  adminGet,
  adminResolveDispute,
};
