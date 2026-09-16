const flagClient = require("../lib/flagClient");

// Risk pattern: no fallback is supplied. If the flag lookup throws
// (flag renamed, config unreachable, service down), this call throws
// too and refund processing fails outright instead of degrading.
function processRefund(orderId) {
  const useLegacyPath = flagClient.isEnabled("payments.legacyRefundPath");

  if (useLegacyPath) {
    return { orderId, path: "legacy-refund-processor" };
  }
  return { orderId, path: "current-refund-processor" };
}

module.exports = { processRefund };
