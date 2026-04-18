// ── API FETCHERS ──────────────────────────────────────────────────────────────

async function fetchGoogleFactCheck(query, apiKey) {
    const url = `https://factchecktools.googleapis.com/v1alpha1/claims:search?query=${encodeURIComponent(query)}&languageCode=en&key=${apiKey}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Google API error: ${res.status}`);
    return res.json();
}

async function fetchWikipedia(query) {
    const url = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&utf8=1&origin=*&srlimit=1`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const results = data?.query?.search;
    if (!results || results.length === 0) return null;

    const pageId = results[0].pageid;
    const extractUrl = `https://en.wikipedia.org/w/api.php?action=query&prop=extracts&exintro=1&explaintext=1&pageids=${pageId}&format=json&origin=*`;
    const extRes = await fetch(extractUrl);
    if (!extRes.ok) return null;
    const extData = await extRes.json();
    const page = extData?.query?.pages?.[pageId];
    if (!page) return null;

    let extract = page.extract || '';
    if (extract.length > 420) {
        extract = extract.substring(0, 420).replace(/\s+\S*$/, '') + '…';
    }
    return {
        title: page.title,
        extract,
        url: `https://en.wikipedia.org/?curid=${pageId}`
    };
}

async function fetchGuardianNews(query) {
    // Free developer key at https://open-platform.theguardian.com/access/
    // Falls back to 'test' key (rate-limited) if no key is stored
    const key = getGuardianKey();
    const url = `https://content.guardianapis.com/search?api-key=${key}&q=${encodeURIComponent(query)}&show-fields=headline,trailText,isOpinion&order-by=relevance&page-size=5&format=json`;
    const res = await fetch(url);
    if (res.status === 429) {
        console.warn('Guardian API rate-limited (429). Set a free developer key in the setup panel.');
        return null;
    }
    if (!res.ok) throw new Error(`Guardian API error: ${res.status}`);
    return res.json();
}

async function fetchOpenAlex(query) {
    // Free, no key needed, 250M+ scholarly works
    const url = `https://api.openalex.org/works?search=${encodeURIComponent(query)}&per-page=5&sort=cited_by_count:desc&mailto=fact-checker@portfolio`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`OpenAlex API error: ${res.status}`);
    return res.json();
}

async function fetchPubMed(query) {
    // NCBI E-utilities: free, no key needed, CORS-friendly, 3 req/sec
    const searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${encodeURIComponent(query)}&retmax=5&retmode=json&sort=relevance`;
    const searchRes = await fetch(searchUrl);
    if (!searchRes.ok) throw new Error(`PubMed search error: ${searchRes.status}`);
    const searchData = await searchRes.json();
    const ids = searchData?.esearchresult?.idlist || [];
    if (ids.length === 0) return [];

    const summaryUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id=${ids.join(',')}&retmode=json`;
    const summaryRes = await fetch(summaryUrl);
    if (!summaryRes.ok) throw new Error(`PubMed summary error: ${summaryRes.status}`);
    const summaryData = await summaryRes.json();
    const result = summaryData?.result || {};

    return ids.map(id => result[id]).filter(Boolean);
}

