// Deliberately minimal stand-in for a real feature-flag SDK.
// Reads current values from flags.config.json so the fixture behaves
// consistently without needing a live flag service.
const fs = require("fs");
const path = require("path");

const configPath = path.join(__dirname, "..", "flags.config.json");
const config = JSON.parse(fs.readFileSync(configPath, "utf8"));

function findFlag(key) {
  return config.flags.find((f) => f.key === key);
}

function isEnabled(key, opts = {}) {
  const flag = findFlag(key);
  if (!flag) {
    if (Object.prototype.hasOwnProperty.call(opts, "fallback")) {
      return opts.fallback;
    }
    throw new Error(`Unknown flag "${key}" and no fallback provided`);
  }
  return flag.rolloutPercent > 0;
}

module.exports = { isEnabled, findFlag };
