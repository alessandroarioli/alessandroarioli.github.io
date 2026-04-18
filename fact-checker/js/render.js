// ── HTML RENDER HELPERS ───────────────────────────────────────────────────────

function escHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function renderVerdictCard(fakeProb, claim, sourceCount, hasFactChecks) {
    const vClass = verdictClass(fakeProb);
    const vText = verdictText(fakeProb);
    const color = gaugeColor(fakeProb);
    const r = 42;
    const circ = 2 * Math.PI * r;

    let summary;
    if (!hasFactChecks) {
        summary = `No direct fact-checks were found for this claim in the database. The score is estimated from Wikipedia context only and should be treated as indicative. Try rephrasing the claim or check primary sources.`;
    } else if (fakeProb <= 0.15) {
        summary = `This claim appears to be <strong style="color:var(--green)">well-supported</strong> by fact-checkers. Multiple reputable organisations have rated similar claims as true or accurate. Always verify with primary sources.`;
    } else if (fakeProb <= 0.35) {
        summary = `This claim is <strong style="color:var(--green)">generally considered true</strong>, though some nuance may apply. Fact-checkers have rated it as mostly or largely accurate.`;
    } else if (fakeProb <= 0.55) {
        summary = `This claim is <strong style="color:var(--yellow)">disputed or mixed</strong>. Different fact-checkers have reached different conclusions, or the claim contains both accurate and inaccurate elements.`;
    } else if (fakeProb <= 0.75) {
        summary = `This claim is <strong style="color:var(--yellow)">considered mostly false or misleading</strong> by fact-checkers. It may contain a kernel of truth but is significantly exaggerated or taken out of context.`;
    } else {
        summary = `This claim has been <strong style="color:var(--red)">rated as false</strong> by multiple reputable fact-checking organisations. Be critical of sources sharing this information.`;
    }

    return `
    <div class="verdict-card ${vClass}">
        <div class="verdict-top">
            <div>
                <div class="verdict-label">Verdict — ${sourceCount} source${sourceCount !== 1 ? 's' : ''} checked</div>
                <div class="verdict-title">${vText}</div>
                <div class="verdict-bar-wrap" style="margin-top:16px;max-width:340px;">
                    <div class="verdict-bar-labels">
                        <span>✅ Real</span>
                        <span>❌ Fake</span>
                    </div>
                    <div class="verdict-bar-track">
                        <div class="verdict-bar-fill" id="bar-fill" style="background:${color}; width:0%"></div>
                    </div>
                </div>
            </div>
            <div class="gauge-wrap">
                <div class="gauge">
                    <svg viewBox="0 0 100 100">
                        <circle class="gauge-track" cx="50" cy="50" r="${r}"/>
                        <circle class="gauge-fill" id="gauge-circle" cx="50" cy="50" r="${r}"
                            stroke="${color}"
                            stroke-dasharray="${circ}"
                            stroke-dashoffset="${circ}"/>
                    </svg>
                    <span class="gauge-number" style="color:${color}" id="gauge-number">0%</span>
                    <span class="gauge-sub">fake prob.</span>
                </div>
                <div class="gauge-label">fake probability</div>
            </div>
        </div>
        <div class="verdict-summary">${summary}</div>
    </div>`;
}

function animateVerdictGauge(fakeProb) {
    const r = 42;
    const circ = 2 * Math.PI * r;
    const pct = Math.round(fakeProb * 100);
    const targetOffset = circ * (1 - fakeProb);

    requestAnimationFrame(() => {
        const circle = document.getElementById('gauge-circle');
        const numEl = document.getElementById('gauge-number');
        const bar = document.getElementById('bar-fill');
        if (circle) circle.style.strokeDashoffset = targetOffset;
        if (bar) bar.style.width = pct + '%';

        let start = null;
        function step(ts) {
            if (!start) start = ts;
            const progress = Math.min((ts - start) / 1200, 1);
            const ease = 1 - Math.pow(1 - progress, 3);
            if (numEl) numEl.textContent = Math.round(ease * pct) + '%';
            if (progress < 1) requestAnimationFrame(step);
        }
        requestAnimationFrame(step);
    });
}

function renderSources(claims) {
    if (!claims || claims.length === 0) return '';

    const cards = claims.map(claim => {
        const reviews = claim.claimReview || [];
        return reviews.map(review => {
            const pub = review.publisher?.name || review.publisher?.site || 'Unknown';
            const rating = review.textualRating || '?';
            const fakeProb = ratingToFakeProb(rating);
            const rClass = 'rating-' + ratingClass(fakeProb);
            const url = review.url || '#';
            const claimText = (claim.text || '').substring(0, 120) + (claim.text?.length > 120 ? '…' : '');
            const claimant = claim.claimant ? `<br><span style="color:var(--accent-light);font-size:0.78rem">Claimant: ${claim.claimant}</span>` : '';
            const dateStr = review.reviewDate ? new Date(review.reviewDate).toLocaleDateString('en-GB', { year: 'numeric', month: 'short', day: 'numeric' }) : '';

            return `
            <div class="source-card">
                <div class="source-icon">📋</div>
                <div class="source-body">
                    <div class="source-header">
                        <span class="source-name">${escHtml(pub)}</span>
                        <span class="source-rating ${rClass}">${escHtml(rating)}</span>
                    </div>
                    <div class="source-claim">"${escHtml(claimText)}"${claimant}</div>
                    <div class="source-meta">${dateStr}</div>
                    <a href="${escHtml(url)}" target="_blank" rel="noopener" class="source-link">
                        Read full fact-check
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                    </a>
                </div>
            </div>`;
        }).join('');
    }).join('');

    return `
    <div class="sources-title">📋 Fact-Check Sources</div>
    <div class="sources-grid">${cards}</div>`;
}

function renderWiki(wiki) {
    if (!wiki) return '';
    return `
    <div class="wiki-card">
        <h3>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            Wikipedia context: ${escHtml(wiki.title)}
        </h3>
        <p>${escHtml(wiki.extract)}</p>
        <a href="${escHtml(wiki.url)}" target="_blank" rel="noopener">Read on Wikipedia →</a>
    </div>`;
}

function renderGuardianNews(articles) {
    if (!articles || articles.length === 0) return '';

    const articleElems = articles.map(article => {
        const title = article.webTitle;
        const url = article.webUrl;
        const date = new Date(article.webPublicationDate).toLocaleDateString('en-GB', { year: 'numeric', month: 'short', day: 'numeric' });
        const signal = guardianArticleSignal(article);
        const signalLabel = { debunking: '❌ Debunking', supporting: '✅ Supporting', neutral: '📄 Coverage' }[signal];
        const badgeClass = { debunking: 'rating-false', supporting: 'rating-true', neutral: 'rating-unknown' }[signal];

        return `
        <a href="${escHtml(url)}" target="_blank" rel="noopener" class="guardian-article">
            <div class="guardian-article-body">
                <div class="guardian-article-title">${escHtml(title)}</div>
                <div class="guardian-article-meta">${date}</div>
            </div>
            <span class="source-rating ${badgeClass}" style="flex-shrink:0;margin-top:2px;">${signalLabel}</span>
        </a>`;
    }).join('');

    return `
    <div class="guardian-card">
        <h3>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>
            The Guardian — news coverage
        </h3>
        <div class="guardian-articles">${articleElems}</div>
    </div>`;
}

function renderOpenAlex(papers) {
    if (!papers || papers.length === 0) return '';

    const items = papers.map(paper => {
        const title = paper.title || 'Untitled';
        const year = paper.publication_year || '';
        const citations = paper.cited_by_count ?? 0;
        const url = paper.primary_location?.landing_page_url || (paper.doi ? `https://doi.org/${paper.doi}` : '#');
        const journal = paper.primary_location?.source?.display_name || '';
        const signal = paperSignal(paper);
        const badgeClass = { debunking: 'rating-false', supporting: 'rating-true', neutral: 'rating-unknown' }[signal];
        const badgeLabel = { debunking: '❌ Challenges claim', supporting: '✅ Supports claim', neutral: '📄 Related research' }[signal];

        return `
        <a href="${escHtml(url)}" target="_blank" rel="noopener" class="science-paper">
            <div class="science-paper-body">
                <div class="science-paper-title">${escHtml(title)}</div>
                <div class="science-paper-meta">${year}${journal ? ' · ' + escHtml(journal) : ''}</div>
            </div>
            <div style="display:flex;flex-direction:column;gap:4px;align-items:flex-end;flex-shrink:0;">
                <span class="source-rating ${badgeClass}" style="font-size:0.68rem;">${badgeLabel}</span>
                <span class="science-cite">📎 ${citations.toLocaleString()} citations</span>
            </div>
        </a>`;
    }).join('');

    return `
    <div class="science-card">
        <h3>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
            OpenAlex — peer-reviewed scientific literature
        </h3>
        <div class="science-papers">${items}</div>
    </div>`;
}

function renderPubMed(articles) {
    if (!articles || articles.length === 0) return '';

    const items = articles.map(article => {
        const title = article.title || 'Untitled';
        const pmid = article.uid;
        const url = `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`;
        const journal = article.source || '';
        const year = article.pubdate ? article.pubdate.substring(0, 4) : '';
        const authors = article.authors?.slice(0, 2).map(a => a.name).join(', ') || '';
        const authorStr = authors + (article.authors?.length > 2 ? ' et al.' : '');
        const signal = pubmedSignal(article);
        const badgeClass = { debunking: 'rating-false', supporting: 'rating-true', neutral: 'rating-unknown' }[signal];
        const badgeLabel = { debunking: '❌ Challenges claim', supporting: '✅ Supports claim', neutral: '📄 Related study' }[signal];

        return `
        <a href="${escHtml(url)}" target="_blank" rel="noopener" class="pubmed-paper">
            <div class="pubmed-paper-body">
                <div class="pubmed-paper-title">${escHtml(title)}</div>
                <div class="pubmed-paper-meta">${authorStr ? escHtml(authorStr) + ' · ' : ''}${year}${journal ? ' · ' + escHtml(journal) : ''} · PMID ${escHtml(pmid)}</div>
            </div>
            <div style="display:flex;flex-direction:column;gap:4px;align-items:flex-end;flex-shrink:0;">
                <span class="source-rating ${badgeClass}" style="font-size:0.68rem;">${badgeLabel}</span>
                <span class="pubmed-badge">🧬 PubMed</span>
            </div>
        </a>`;
    }).join('');

    return `
    <div class="pubmed-card">
        <h3>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v18m0 0h10a2 2 0 0 0 2-2v-4M9 21H5a2 2 0 0 1-2-2v-4m0 0h18"/></svg>
            PubMed — biomedical &amp; clinical research
        </h3>
        <div class="pubmed-papers">${items}</div>
    </div>`;
}

