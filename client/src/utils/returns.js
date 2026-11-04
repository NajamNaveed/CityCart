// The returned-goods inbox on the dashboard (docs/22 §F).
export const RETURN_REASONS = {
  DAMAGED: 'Damaged',
  WRONG_ITEM: 'Wrong item',
  MISSING: 'Missing',
  NOT_WANTED: 'Not wanted',
}

export const reasonLabel = (reason) => RETURN_REASONS[reason] || 'Other'

export const returnUnits = (ret) => (ret?.lines || []).reduce((sum, line) => sum + line.quantity, 0)

export const isReturnOpen = (status) => status === 'IN_TRANSIT'

// What the store's receive call sends: every line, restocked only when ticked.
export const receiveDecisions = (lines, restock = {}) =>
  (lines || []).map((_, index) => ({ index, restock: Boolean(restock[index]) }))

export const lineResultLabel = (line) => (line.restock ? 'Restocked' : 'Written off')
