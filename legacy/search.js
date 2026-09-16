// Dead pattern: the flag check itself is commented out. The old
// Elasticsearch query path below is unreachable but still sitting
// in the repo, still showing up in searches for "legacy-search".
//
// const flagClient = require("../lib/flagClient");
//
// function search(query) {
//   if (flagClient.isEnabled("search.legacyElasticQuery")) {
//     return runLegacyElasticQuery(query);
//   }
//   return runCurrentSearch(query);
// }
//
// function runLegacyElasticQuery(query) {
//   // old ES 6.x query builder, kept "just in case"
// }

function search(query) {
  return runCurrentSearch(query);
}

function runCurrentSearch(query) {
  return { query, results: [] };
}

module.exports = { search };
