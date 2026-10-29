/**
 * How a customer paid at the door (docs/21 §I). The order stays COD; this records
 * what actually happened when the rider asked.
 */
const COLLECTION_METHODS = ['CASH', 'BANK_TRANSFER', 'WALLET', 'CARD_MACHINE'];
const COLLECTION_WALLETS = ['JAZZCASH', 'EASYPAISA', 'OTHER'];
const PROOF_VERIFICATIONS = ['SUBMITTED', 'VERIFIED', 'REJECTED'];

// A non-cash collection also sets the payment's own method, so receipts and reports
// say how it was paid. A card machine is CARD; cash keeps the COD method.
const PAYMENT_METHOD_FOR_COLLECTION = {
  BANK_TRANSFER: 'BANK_TRANSFER',
  WALLET: 'WALLET',
  CARD_MACHINE: 'CARD',
};

module.exports = { COLLECTION_METHODS, COLLECTION_WALLETS, PROOF_VERIFICATIONS, PAYMENT_METHOD_FOR_COLLECTION };
