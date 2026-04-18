// ── SCORE HELPERS ─────────────────────────────────────────────────────────────

function ratingToFakeProb(rating) {
    if (!rating) return null;
    const r = rating.toLowerCase().replace(/['']/g, "'").trim();

    if (/\b(correct|accurate|verified|confirmed|legit)\b/.test(r)) return 0.04;
    if (/^true$/.test(r)) return 0.05;
    if (/\bmostly true\b|\blargely true\b|\bprobably true\b/.test(r)) return 0.18;
    if (/\bhalf.?true\b|\bpartly true\b|\bpartially true\b|\bmixed\b|\bpartly false\b/.test(r)) return 0.50;
    if (/\bunproven\b|\bunverified\b|\bno evidence\b|\bnot proven\b/.test(r)) return 0.60;
    if (/\bmostly false\b|\blargely false\b|\bprobably false\b/.test(r)) return 0.78;
    if (/^false$/.test(r)) return 0.92;
    if (/\bpants.?on.?fire\b|\bfabricated\b|\bfake\b|\bhoax\b|\bmisleading\b/.test(r)) return 0.97;
    if (/\bfalse\b/.test(r)) return 0.88;
    if (/\btrue\b/.test(r)) return 0.12;
    return null;
}

function ratingClass(fakeProb) {
    if (fakeProb === null) return 'unknown';
    if (fakeProb <= 0.30) return 'true';
    if (fakeProb <= 0.65) return 'mixed';
    return 'false';
}

function verdictClass(fakeProb) {
    if (fakeProb <= 0.30) return 'likely-true';
    if (fakeProb <= 0.65) return 'uncertain';
    return 'likely-fake';
}

function verdictText(fakeProb) {
    if (fakeProb <= 0.15) return '✅ Likely True';
    if (fakeProb <= 0.30) return '✔ Probably True';
    if (fakeProb <= 0.50) return '⚠️ Unverified / Mixed';
    if (fakeProb <= 0.70) return '⚠️ Probably Misleading';
    if (fakeProb <= 0.85) return '❌ Likely False';
    return '🚫 Almost Certainly False';
}

function gaugeColor(fakeProb) {
    if (fakeProb <= 0.30) return '#34d399';
    if (fakeProb <= 0.65) return '#fbbf24';
    return '#f87171';
}

function guardianArticleSignal(article) {
    const text = ((article.webTitle || '') + ' ' + (article.fields?.trailText || '')).toLowerCase();
    const fakeWords = ['false','debunked','hoax','misinformation','fake','myth','disproven','conspiracy','misleading','not true','no evidence','fabricated','pseudoscience'];
    const trueWords = ['confirmed','true','accurate','proven','real','evidence shows','scientists say','research confirms','official','verified'];
    let f = 0, t = 0;
    fakeWords.forEach(w => { if (text.includes(w)) f++; });
    trueWords.forEach(w => { if (text.includes(w)) t++; });
    if (f > t) return 'debunking';
    if (t > f) return 'supporting';
    return 'neutral';
}

function paperSignal(paper) {
    const text = ((paper.title || '') + ' ' + (paper.abstract_inverted_index ? Object.keys(paper.abstract_inverted_index).join(' ') : '')).toLowerCase();
    const debunkWords = ['false','misinformation','myth','pseudoscience','no evidence','disproven','ineffective','harmful','debunk','conspiracy','hoax','fabricated'];
    const supportWords = ['evidence','confirmed','effective','proven','safe','consensus','study shows','demonstrated','validated','verified','scientific'];
    let d = 0, s = 0;
    debunkWords.forEach(w => { if (text.includes(w)) d++; });
    supportWords.forEach(w => { if (text.includes(w)) s++; });
    if (d > s) return 'debunking';
    if (s > d) return 'supporting';
    return 'neutral';
}

function pubmedSignal(article) {
    const text = ((article.title || '') + ' ' + (article.source || '')).toLowerCase();
    const debunkWords = ['false','misinformation','myth','ineffective','harmful','no evidence','disproven','pseudoscience','adverse','risk','danger','toxicity'];
    const supportWords = ['effective','safe','evidence','confirmed','beneficial','protective','vaccine','prevention','treatment','therapy','clinical trial'];
    let d = 0, s = 0;
    debunkWords.forEach(w => { if (text.includes(w)) d++; });
    supportWords.forEach(w => { if (text.includes(w)) s++; });
    if (d > s) return 'debunking';
    if (s > d) return 'supporting';
    return 'neutral';
}

// ── SCORE CALCULATION ─────────────────────────────────────────────────────────
function calcScore(claims, wikiExtract, guardianArticles, sciencePapers, pubmedArticles) {
    const probs = [];

    // 1. Google Fact Check ratings (highest authority — explicit verdicts)
    if (claims) {
        for (const claim of claims) {
            for (const review of (claim.claimReview || [])) {
                const p = ratingToFakeProb(review.textualRating);
                if (p !== null) probs.push(p);
            }
        }
    }

    // 2. Wikipedia keywords (fallback when no fact-checks found)
    if (probs.length === 0 && wikiExtract) {
        const text = wikiExtract.toLowerCase();
        let fakeSignals = 0, trueSignals = 0;
        const fakeWords = ['false','hoax','debunked','misinformation','conspiracy','pseudoscience','myth','disproven','fabricated','misleading'];
        const trueWords = ['scientific consensus','well established','evidence','proven','confirmed','research shows','studies show'];
        fakeWords.forEach(w => { if (text.includes(w)) fakeSignals++; });
        trueWords.forEach(w => { if (text.includes(w)) trueSignals++; });
        if (fakeSignals > 0 || trueSignals > 0) {
            probs.push(fakeSignals / (fakeSignals + trueSignals));
        }
    }

    // 3. Guardian headline signals (fallback)
    if (probs.length === 0 && guardianArticles && guardianArticles.length > 0) {
        let debunking = 0, supporting = 0;
        for (const article of guardianArticles) {
            const sig = guardianArticleSignal(article);
            if (sig === 'debunking') debunking++;
            else if (sig === 'supporting') supporting++;
        }
        if (debunking > 0 || supporting > 0) {
            probs.push(debunking / (debunking + supporting));
        }
    }

    // 4. OpenAlex papers — half weight (keyword heuristic on abstracts)
    if (sciencePapers && sciencePapers.length > 0) {
        let debunking = 0, supporting = 0;
        for (const paper of sciencePapers) {
            const sig = paperSignal(paper);
            if (sig === 'debunking') debunking++;
            else if (sig === 'supporting') supporting++;
        }
        if (debunking > 0 || supporting > 0) {
            probs.push((debunking / (debunking + supporting)) * 0.5);
        }
    }

    // 5. PubMed papers — half weight
    if (pubmedArticles && pubmedArticles.length > 0) {
        let debunking = 0, supporting = 0;
        for (const article of pubmedArticles) {
            const sig = pubmedSignal(article);
            if (sig === 'debunking') debunking++;
            else if (sig === 'supporting') supporting++;
        }
        if (debunking > 0 || supporting > 0) {
            probs.push((debunking / (debunking + supporting)) * 0.5);
        }
    }

    if (probs.length === 0) return { score: 0.50, sourceCount: 0, hasFactChecks: false };

    const avg = probs.reduce((a, b) => a + b, 0) / probs.length;
    return { score: avg, sourceCount: probs.length, hasFactChecks: (claims && claims.length > 0) };
}

