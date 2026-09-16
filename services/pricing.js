const flagClient = require("../lib/flagClient");

// Stale pattern: rolled out to 100% in October 2025 and never touched
// since. The "else" branch below has been dead for the better part of
// a year, but nobody removed the flag or the old code path.
function getPrice(sku) {
  const useDynamicDiscount = flagClient.isEnabled("pricing.dynamicDiscountV2", {
    fallback: true,
  });

  if (useDynamicDiscount) {
    return computeDynamicDiscountPrice(sku);
  }
  return computeLegacyFlatPrice(sku);
}

function computeDynamicDiscountPrice(sku) {
  return { sku, basePrice: 42.0, discount: 0.12 };
}

function computeLegacyFlatPrice(sku) {
  // Dead branch — kept alive only by the flag nobody removed.
  return { sku, basePrice: 42.0, discount: 0 };
}

module.exports = { getPrice };
