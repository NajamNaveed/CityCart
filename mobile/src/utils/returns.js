// Door returns on the customer's order (docs/22 §F): what came back and why.
export const RETURN_REASONS = {
  DAMAGED: 'Damaged',
  WRONG_ITEM: 'Wrong item',
  MISSING: 'Missing',
  NOT_WANTED: 'Not wanted',
}

export const reasonLabel = (reason) => RETURN_REASONS[reason] || 'Other'

// The rejected line for one order item, keyed by the order item's id.
export function returnedByItem(returnDoc) {
  return new Map((returnDoc?.lines || []).map((line) => [String(line.orderItemId), line]))
}
