const { RETURN_REASONS, STORE_FAULT_REASONS } = require('../../config/returns');

/**
 * The counting half of the returns clusterer (docs/29 Phase 3d-1), pure on
 * purpose: the model is never allowed to add, average or compare anything, so
 * every figure it may repeat is worked out here and tested here.
 *
 * A Return is a door refusal (docs/22 §F) and its reasons are one of four
 * stored enums, so a "theme" is always one of those four — the model may
 * explain a theme, never invent one. Line values use the price the order was
 * delivered at, because that is the money the shop actually lost.
 */

const REASON_LABELS = {
  DAMAGED: 'arrived damaged',
  WRONG_ITEM: 'wrong item',
  NOT_WANTED: 'customer did not want it',
  MISSING: 'item was missing',
};

const roundMoney = (value) => Math.round(Number(value || 0) * 100) / 100;
const roundPct = (value) => Math.round(Number(value || 0) * 10) / 10;
const whole = (value) => Math.max(0, Math.round(Number(value || 0)));

const isStoreFault = (reason) => STORE_FAULT_REASONS.includes(reason);
const isKnownReason = (reason) => RETURN_REASONS.includes(reason);

function emptyReasonRow(reason) {
  return {
    reason,
    label: REASON_LABELS[reason] || reason,
    returns: 0,
    lines: 0,
    units: 0,
    value: 0,
    storeFault: isStoreFault(reason),
    products: new Set(),
  };
}

function newProductRow(productId, productName) {
  return {
    productId: productId ? String(productId) : null,
    productName,
    // Which refusals this product appeared in — a single return can carry two
    // lines of the same SKU, which is one bad delivery, not two.
    returnKeys: new Set(),
    lines: 0,
    units: 0,
    value: 0,
    restocked: 0,
    reasons: new Map(),
  };
}

/**
 * @param rows lean Return documents from ONE brand's own scope
 * @param window { days, from, to } — the window the rows were read over
 */
function clusterReturns(rows, window) {
  const reasons = new Map(RETURN_REASONS.map((reason) => [reason, emptyReasonRow(reason)]));
  const products = new Map();

  const totals = {
    returns: 0,
    lines: 0,
    units: 0,
    value: 0,
    // The return record's own figure, summed exactly the way GET
    // /returns/summary sums it, so the shop never sees two different totals for
    // the same week. `value` is the per-line attribution used to split money by
    // reason; in well-formed data the two agree.
    returnedSubtotal: 0,
    refundAmount: 0,
    feeRefunds: 0,
    storeFaultLines: 0,
    storeFaultValue: 0,
    restockedLines: 0,
    writtenOffLines: 0,
  };
  const status = { IN_TRANSIT: 0, RECEIVED: 0 };

  const list = rows || [];
  for (let rowIndex = 0; rowIndex < list.length; rowIndex += 1) {
    const row = list[rowIndex];
    // A return whose lines carry no reason the database knows contributes
    // nothing at all — counting it would let the model describe a pattern that
    // the figures below do not contain.
    const usable = (row && Array.isArray(row.lines) ? row.lines : []).filter((line) => line && isKnownReason(line.reason));
    if (usable.length === 0) continue;

    totals.returns += 1;
    status[row.status] = (status[row.status] || 0) + 1;
    totals.returnedSubtotal = roundMoney(totals.returnedSubtotal + row.returnedSubtotal);
    totals.refundAmount = roundMoney(totals.refundAmount + row.refundAmount);
    if (row.feeRefunded) totals.feeRefunds += 1;

    // One reason counted once per return, even when two lines of the same
    // order share it: "how many orders came back for this" is the question.
    const inThisReturn = new Set();

    for (const line of usable) {
      const reason = line.reason;

      const quantity = whole(line.quantity);
      const value = roundMoney(quantity * Number(line.unitPrice || 0));
      const productName = typeof line.productName === 'string' && line.productName.trim() ? line.productName.trim() : 'a product';

      const reasonRow = reasons.get(reason);
      reasonRow.lines += 1;
      reasonRow.units += quantity;
      reasonRow.value = roundMoney(reasonRow.value + value);
      reasonRow.products.add(productName);
      if (!inThisReturn.has(reason)) {
        inThisReturn.add(reason);
        reasonRow.returns += 1;
      }

      totals.lines += 1;
      totals.units += quantity;
      totals.value = roundMoney(totals.value + value);
      if (isStoreFault(reason)) {
        totals.storeFaultLines += 1;
        totals.storeFaultValue = roundMoney(totals.storeFaultValue + value);
      }
      if (line.restock === true) totals.restockedLines += 1;
      else totals.writtenOffLines += 1;

      const key = line.productId ? String(line.productId) : productName.toLowerCase();
      if (!products.has(key)) products.set(key, newProductRow(line.productId, productName));
      const product = products.get(key);
      product.returnKeys.add(row._id === undefined || row._id === null ? String(rowIndex) : String(row._id));
      product.lines += 1;
      product.units += quantity;
      product.value = roundMoney(product.value + value);
      if (line.restock === true) product.restocked += 1;
      product.reasons.set(reason, (product.reasons.get(reason) || 0) + 1);
    }
  }

  const reasonRows = [...reasons.values()]
    .filter((row) => row.lines > 0)
    .map((row) => ({
      reason: row.reason,
      label: row.label,
      storeFault: row.storeFault,
      returns: row.returns,
      lines: row.lines,
      units: row.units,
      value: row.value,
      products: [...row.products],
      productCount: row.products.size,
      sharePct: totals.lines ? roundPct((row.lines / totals.lines) * 100) : 0,
    }))
    .sort((a, b) => b.lines - a.lines || b.value - a.value || a.reason.localeCompare(b.reason));

  const productRows = [...products.values()]
    .map((product) => {
      const ranked = [...product.reasons.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
      const [topReason, topLines] = ranked[0] || [null, 0];
      return {
        productId: product.productId,
        productName: product.productName,
        returns: product.returnKeys.size,
        lines: product.lines,
        units: product.units,
        value: product.value,
        restocked: product.restocked,
        writtenOff: product.lines - product.restocked,
        topReason,
        topReasonLabel: topReason ? REASON_LABELS[topReason] || topReason : null,
        topReasonLines: topLines,
        // "3 of 4" — the line that makes a pattern obvious to a shop owner.
        dominant: `${topLines} of ${product.lines}`,
        storeFault: topReason ? isStoreFault(topReason) : false,
        reasons: ranked.map(([reason, lines]) => ({ reason, label: REASON_LABELS[reason] || reason, lines })),
      };
    })
    .sort((a, b) => b.units - a.units || b.value - a.value || a.productName.localeCompare(b.productName));

  return {
    window,
    totals: {
      ...totals,
      value: roundMoney(totals.value),
      refundAmount: roundMoney(totals.refundAmount),
      storeFaultPct: totals.lines ? roundPct((totals.storeFaultLines / totals.lines) * 100) : 0,
    },
    status,
    reasons: reasonRows,
    // Products with more than one returned line are the only ones that can
    // show a pattern; a single refusal is one customer, not a trend.
    products: productRows.filter((p) => p.lines > 1),
    productCount: productRows.length,
  };
}

module.exports = {
  clusterReturns,
  REASON_LABELS,
  roundMoney,
  roundPct,
};
