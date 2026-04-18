// ── MAIN ORCHESTRATOR ─────────────────────────────────────────────────────────
let isChecking = false;

async function checkFact() {
    if (isChecking) return;
    const claim = document.getElementById('claim-input').value.trim();
    if (!claim) {
        document.getElementById('claim-input').focus();
        return;
    }

    isChecking = true;
    const btn = document.getElementById('search-btn');
    btn.disabled = true;

    document.getElementById('result').classList.remove('visible');
    const loader = document.getElementById('loader');
    loader.classList.add('visible');
    ['step-1', 'step-2', 'step-3', 'step-4', 'step-5', 'step-6'].forEach(id => {
        document.getElementById(id).className = 'loader-step';
    });

    const activateStep = (id, delay) => new Promise(res => setTimeout(() => {
        document.getElementById(id).classList.add('active');
        res();
    }, delay));

    const doneStep = (id) => {
        document.getElementById(id).classList.remove('active');
        document.getElementById(id).classList.add('done');
    };

    try {
        await activateStep('step-1', 100);
        const apiKey = getApiKey();
        let claims = null;
        let apiError = null;
        if (apiKey) {
            try {
                const data = await fetchGoogleFactCheck(claim, apiKey);
                claims = data.claims || [];
            } catch (e) {
                apiError = e.message;
                console.warn('Fact Check API error:', e);
            }
        }
        doneStep('step-1');

        await activateStep('step-2', 200);
        const wiki = await fetchWikipedia(claim).catch(() => null);
        doneStep('step-2');

        await activateStep('step-3', 300);
        const guardianData = await fetchGuardianNews(claim).catch(() => null);
        const guardianArticles = guardianData?.response?.results || [];
        doneStep('step-3');

        await activateStep('step-4', 400);
        const alexData = await fetchOpenAlex(claim).catch(() => null);
        const sciencePapers = alexData?.results || [];
        doneStep('step-4');

        await activateStep('step-5', 500);
        const pubmedArticles = await fetchPubMed(claim).catch(() => []);
        doneStep('step-5');

        await activateStep('step-6', 600);
        const { score, sourceCount, hasFactChecks } = calcScore(claims, wiki?.extract, guardianArticles, sciencePapers, pubmedArticles);
        await new Promise(r => setTimeout(r, 400));
        doneStep('step-6');

        loader.classList.remove('visible');

        const verdictArea  = document.getElementById('verdict-area');
        const sourcesArea  = document.getElementById('sources-area');
        const wikiArea     = document.getElementById('wiki-area');
        const guardianArea = document.getElementById('guardian-area');
        const scienceArea  = document.getElementById('science-area');
        const pubmedArea   = document.getElementById('pubmed-area');

        let errorHtml = '';
        if (apiError) {
            errorHtml = `<div class="error-card"><strong>⚠ Google Fact Check API error</strong>${escHtml(apiError)} — results based on Wikipedia only.</div>`;
        }

        if (!hasFactChecks && !wiki && guardianArticles.length === 0 && sciencePapers.length === 0 && pubmedArticles.length === 0) {
            verdictArea.innerHTML = errorHtml + `<div class="no-results"><h3>😕 No results found</h3><p>We couldn't find any fact-checks or Wikipedia articles related to this claim.<br>Try rephrasing it, or check sources like <a href="https://www.snopes.com" target="_blank" rel="noopener" style="color:var(--accent-light)">Snopes</a> or <a href="https://www.politifact.com" target="_blank" rel="noopener" style="color:var(--accent-light)">PolitiFact</a> directly.</p></div>`;
            sourcesArea.innerHTML = '';
            wikiArea.innerHTML = '';
            guardianArea.innerHTML = '';
            scienceArea.innerHTML = '';
            pubmedArea.innerHTML = '';
        } else {
            verdictArea.innerHTML  = errorHtml + renderVerdictCard(score, claim, sourceCount, hasFactChecks);
            sourcesArea.innerHTML  = renderSources(claims);
            wikiArea.innerHTML     = renderWiki(wiki);
            guardianArea.innerHTML = renderGuardianNews(guardianArticles);
            scienceArea.innerHTML  = renderOpenAlex(sciencePapers);
            pubmedArea.innerHTML   = renderPubMed(pubmedArticles);
            requestAnimationFrame(() => animateVerdictGauge(score));
        }

        document.getElementById('result').classList.add('visible');
        document.getElementById('result').scrollIntoView({ behavior: 'smooth', block: 'start' });

    } catch (e) {
        loader.classList.remove('visible');
        document.getElementById('verdict-area').innerHTML = `<div class="error-card"><strong>Unexpected error</strong>${escHtml(e.message)}</div>`;
        document.getElementById('result').classList.add('visible');
    } finally {
        isChecking = false;
        btn.disabled = false;
    }
}

