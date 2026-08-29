const BACKEND_URL = 'https://email-monitoringbackend.vercel.app';

// Hardcoded default master web app URL. Safe to commit (it's not a secret).
// If you ever create a NEW deployment (vs. updating the existing one), replace this.
const MASTER_WEBHOOK_URL = 'https://script.google.com/macros/s/AKfycbxmS4ktGs9UWUNuJGMEa7ozq07QYyZEkFpAlAnZ3Ats6tn0lfTRUCBkamAeIWe4yKP4/exec';

let AUTH = null;

// Dark-theme status colours, kept as named constants so a copy never drifts
// back to the light-theme hexes the page no longer uses.
const TONE = { info: '#9aa0ad', ok: '#00bf6f', bad: '#f0553d' };

function showStatus(msg, tone) {
  const el = document.getElementById('status');
  el.style.color = tone || TONE.info;
  el.textContent = msg;
}

function setLeadCount(n) {
  document.getElementById('leadCount').textContent = n;
}

document.addEventListener('DOMContentLoaded', async () => {
  const tbody = document.getElementById('tableBody');
  const sendBtn = document.getElementById('sendToSheetBtn');

  // Gate on login. userId comes from the session, never typed.
  const { shareAuth } = await chrome.storage.local.get('shareAuth');
  if (!shareAuth || !shareAuth.token) {
    sendBtn.disabled = true;
    document.getElementById('userId').value = '';
    document.getElementById('userId').placeholder = 'log in';
    showStatus('You are not logged in. Open the extension popup and log in first.', TONE.bad);
  } else {
    AUTH = shareAuth;
    const uid = document.getElementById('userId');
    uid.value = AUTH.userId;
    uid.readOnly = true;
  }

  // We only land on this table when an auto-dispatch failed (or via the manual
  // fallback button). Show why, then clear it so it doesn't persist.
  const { dispatchError } = await chrome.storage.local.get('dispatchError');
  if (dispatchError) {
    showStatus(`${dispatchError} Review the leads below and click “Push to my sheet”.`, TONE.bad);
    chrome.storage.local.remove('dispatchError');
  }

  chrome.storage.local.get(['lastExtractedLeads'], (result) => {
    let leads = [];
    try { leads = JSON.parse(result.lastExtractedLeads || '[]').filter(l => l.email); } catch {}

    setLeadCount(leads.length);
    if (leads.length === 0) {
      sendBtn.disabled = true;
      if (!dispatchError) showStatus('No scraped leads found. Run an extraction from the popup first.', TONE.info);
      return;
    }

    tbody.innerHTML = leads.map(item => `<tr>
        <td>${esc(`${item.first_name || ''} ${item.last_name || ''}`.trim() || '—')}</td>
        <td>${esc(item.company_name || '—')}</td>
        <td>${esc(item.job_title || '—')}</td>
        <td>${esc(item.email)}</td>
      </tr>`).join('');

    if (AUTH && !dispatchError) {
      showStatus(`Signed in as ${AUTH.name || AUTH.email} — ${leads.length} lead(s) ready to push.`, TONE.info);
    }
  });
});

// HTML-escape: scraped names and job titles are third-party strings and go
// straight into innerHTML.
function esc(value) {
  return String(value === undefined || value === null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

document.getElementById('sendToSheetBtn').addEventListener('click', async () => {
  const sendBtn = document.getElementById('sendToSheetBtn');
  if (!AUTH) return showStatus('Log in via the extension popup first.', TONE.bad);

  const result = await chrome.storage.local.get(['lastExtractedLeads']);
  let raw = [];
  try { raw = JSON.parse(result.lastExtractedLeads || '[]').filter(l => l.email); } catch {}
  if (raw.length === 0) return showStatus('No leads with emails found to push.', TONE.bad);

  const leads = raw.map(item => ({
    poc: `${item.first_name || ''} ${item.last_name || ''}`.trim(),
    first_name: item.first_name || '',
    firm: item.company_name || 'N/A',
    recipient: item.email,
    poc_role: item.job_title || ''
  }));

  // The backend verifies the session, gates the account, and forwards to the
  // master sheet — the master URL never lives in the extension.
  sendBtn.disabled = true;
  showStatus(`Dispatching ${leads.length} lead(s)…`, TONE.info);
  try {
    const res = await fetch(`${BACKEND_URL}/api/dispatch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${AUTH.token}` },
      body: JSON.stringify({ leads })
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) {
      // 401 expired, 403 deactivated, 429 limit, 404 not found, 5xx server/master
      sendBtn.disabled = false;
      return showStatus('Blocked: ' + (d.error || 'dispatch failed'), TONE.bad);
    }
    if (d.status === 'success') {
      // The master reports duplicates separately from failures: a lead already
      // in the sheet is a skip, not an error, and saying so avoids a pointless
      // "why didn't all 100 land?" every time a domain is re-scraped.
      const parts = [`routed ${d.routed}/${d.total}`];
      if (d.duplicates) parts.push(`${d.duplicates} already in your sheet`);
      if (d.unrouted) parts.push(`${d.unrouted} unrouted`);
      showStatus('Done — ' + parts.join(' · ') + '.', d.unrouted ? TONE.bad : TONE.ok);
    } else {
      sendBtn.disabled = false;
      showStatus('Server said: ' + (d.message || d.error || JSON.stringify(d)), TONE.bad);
    }
  } catch {
    sendBtn.disabled = false;
    showStatus('Network error reaching the backend. Try again.', TONE.bad);
  }
});
