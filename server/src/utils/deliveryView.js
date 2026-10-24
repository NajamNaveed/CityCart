/**
 * What a customer may see of their own delivery (docs/20 §4). It is the delivery
 * without the internal rider account id and the wrong-code counter; the rider's
 * display name (assignedAgent) stays, and the code itself is never part of a
 * delivery at all (it has its own customer-only endpoint).
 */
function deliveryForCustomer(delivery) {
  if (!delivery) return delivery;
  const plain = typeof delivery.toObject === 'function' ? delivery.toObject() : { ...delivery };
  delete plain.riderId;
  delete plain.codeAttempts;
  delete plain.deliveryCode;
  return plain;
}

module.exports = { deliveryForCustomer };
