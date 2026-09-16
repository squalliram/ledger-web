// Deliberately minimal — enough for Droid to run something real
// before and after it touches flag code, per the "never remove a
// flag without a passing test run" rule in AGENTS.md.
const assert = require("assert");
const { getPrice } = require("../services/pricing");
const { search } = require("../legacy/search");

function run() {
  const price = getPrice("sku-123");
  assert.strictEqual(price.sku, "sku-123");

  const results = search("hello");
  assert.deepStrictEqual(results, { query: "hello", results: [] });

  console.log("basic.test.js: all assertions passed");
}

run();
