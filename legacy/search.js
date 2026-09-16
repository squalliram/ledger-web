// Dead pattern removed: the flag check for search.legacyElasticQuery was
// commented out instead of deleted. The old Elasticsearch query path below
// was unreachable dead code, so it has been deleted along with its
// flags.config.json entry (no live references remain).

function search(query) {
  return runCurrentSearch(query);
}

function runCurrentSearch(query) {
  return { query, results: [] };
}

module.exports = { search };
