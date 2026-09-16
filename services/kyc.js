const flagClient = require("../lib/flagClient");

// TODO: remove by 2025-11-01 — old verification vendor was fully
// decommissioned. This flag is nearly a year past its own removal
// date, which is exactly the kind of thing a SOC2/PCI-adjacent audit
// asks about: "who can still turn this on, and why is it still here?"
function runVerification(applicant) {
  const useOldFlow = flagClient.isEnabled("kyc.oldVerificationFlow", {
    fallback: false,
  });

  if (useOldFlow) {
    return { applicant: applicant.id, vendor: "legacy-kyc-vendor" };
  }
  return { applicant: applicant.id, vendor: "current-kyc-vendor" };
}

module.exports = { runVerification };
