/**
 * search-index — Search a pre-built index for matching terms.
 *
 * @param {object} opts
 * @param {string} opts.query — search query
 * @param {Map<string, Array<{file: string, line: number}>>} opts.index — from build-index
 * @returns {{ query: string, results: Array<{term: string, locations: Array}>, totalMatches: number }}
 */

function searchIndex({ query, index }) {
  const q = query.toLowerCase();
  const results = [];

  // Exact match
  for (const [key, locations] of index) {
    if (key.includes(q)) {
      results.push({ term: key, locations: locations.slice(0, 10) });
    }
  }

  // Fuzzy fallback (only for queries >= 3 chars to avoid matching everything)
  if (results.length === 0 && q.length >= 3) {
    for (const [key, locations] of index) {
      const term = key.split(":")[1] || key;
      if (term.includes(q) || q.includes(term)) {
        results.push({ term: key, locations: locations.slice(0, 5) });
      }
    }
  }

  return { query, results: results.slice(0, 20), totalMatches: results.length };
}

module.exports = searchIndex;
