// Anti-pattern: a hardcoded toggle that never went through flags.config.json.
// No owner, no audit trail, no kill switch if the new dashboard misbehaves —
// someone would have to ship a code change to turn it back off.
const FEATURE_NEW_DASHBOARD_ENABLED = true;

function renderDashboard() {
  if (FEATURE_NEW_DASHBOARD_ENABLED) {
    return "<html><body><h1>New Dashboard</h1></body></html>";
  }
  return "<html><body><h1>Dashboard</h1></body></html>";
}

module.exports = { renderDashboard };
