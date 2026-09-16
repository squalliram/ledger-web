const express = require("express");
const flagClient = require("../lib/flagClient");

const router = express.Router();

// Healthy pattern: owned in flags.config.json, actively experimenting,
// and the check always supplies an explicit fallback so the request
// degrades gracefully if the flag service is unreachable.
router.post("/", (req, res) => {
  const useNewFlow = flagClient.isEnabled("ledger.newCheckoutFlow", {
    fallback: false,
  });

  if (useNewFlow) {
    return res.json({ flow: "one-click-checkout-v2", orderId: req.body.orderId });
  }
  return res.json({ flow: "classic-checkout", orderId: req.body.orderId });
});

module.exports = router;
