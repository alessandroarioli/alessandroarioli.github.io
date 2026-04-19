// ── CONFIG & API KEY MANAGEMENT ──────────────────────────────────────────────

function escHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

const LS_KEY = 'fc_gapi_key';
const LS_GUARDIAN_KEY = 'fc_guardian_key';
const DEFAULT_API_KEY = 'AIzaSyArlGUdPs8i6_nBZmK_0UQx8I-cUBQqEG0';

function getApiKey() {
    return localStorage.getItem(LS_KEY) || DEFAULT_API_KEY;
}
function getGuardianKey() {
    return localStorage.getItem(LS_GUARDIAN_KEY) || 'test';
}

function saveApiKey() {
    const v = document.getElementById('api-key-input').value.trim();
    if (!v) return;
    localStorage.setItem(LS_KEY, v);
    updateKeyStatus();
    document.getElementById('api-setup').removeAttribute('open');
}
function clearApiKey() {
    localStorage.removeItem(LS_KEY);
    document.getElementById('api-key-input').value = '';
    updateKeyStatus();
}
function saveGuardianKey() {
    const v = document.getElementById('guardian-key-input').value.trim();
    if (!v) return;
    localStorage.setItem(LS_GUARDIAN_KEY, v);
    updateGuardianKeyStatus();
}
function clearGuardianKey() {
    localStorage.removeItem(LS_GUARDIAN_KEY);
    document.getElementById('guardian-key-input').value = '';
    updateGuardianKeyStatus();
}

function updateKeyStatus() {
    const el = document.getElementById('key-status');
    if (getApiKey()) {
        el.textContent = '✓ API key configured — full fact-check enabled';
        el.className = 'key-status ok';
    } else {
        el.textContent = '⚠ No API key set — results will use Wikipedia only';
        el.className = 'key-status missing';
    }
}
function updateGuardianKeyStatus() {
    const el = document.getElementById('guardian-key-status');
    const stored = localStorage.getItem(LS_GUARDIAN_KEY);
    if (stored) {
        el.textContent = '✓ Guardian key saved — 5,000 queries/day';
        el.className = 'key-status ok';
    } else {
        el.textContent = '⚠ No key set — using "test" key (heavily rate-limited)';
        el.className = 'key-status missing';
    }
}

function setExample(el) {
    document.getElementById('claim-input').value = el.textContent;
    document.getElementById('claim-input').focus();
}

window.addEventListener('DOMContentLoaded', () => {
    updateKeyStatus();
    updateGuardianKeyStatus();
    const k = localStorage.getItem(LS_KEY) || DEFAULT_API_KEY;
    if (k) document.getElementById('api-key-input').value = k;
    const gk = localStorage.getItem(LS_GUARDIAN_KEY);
    if (gk) document.getElementById('guardian-key-input').value = gk;

    document.getElementById('claim-input').addEventListener('keydown', e => {
        if (e.key === 'Enter') checkFact();
    });
});

