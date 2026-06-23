const BACKEND_URL = 'https://email-monitoringbackend.vercel.app';

let AUTH = null;

function showStatus(msg, color) {
  const el = document.getElementById('status');
  el.style.color = color || '#333';
  el.textContent = msg;
}

document.addEventListener('DOMContentLoaded', async () => {
  const tbody = document.getElementById('tableBody');
  const sendBtn = document.getElementById('sendToSheetBtn');

  // Gate on login. userId comes from the session, never typed.
  const { shareAuth } = await chrome.storage.local.get('shareAuth');
  if (!shareAuth || !shareAuth.token) {
    sendBtn.disabled = true;
    document.getElementById('userId').value = '';
    document.getElementById('userId').placeholder = 'log in via popup';
    showStatus('You are not logged in. Open the extension popup and log in first.', '#dc3545');
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
    showStatus(`${dispatchError} Review the leads below and click “Push to Master Sheet”.`, '#dc3545');
    chrome.storage.local.remove('dispatchError');
  }

  chrome.storage.local.get(['lastExtractedLeads'], (result) => {
    if (!result.lastExtractedLeads) return;
    let leads = [];
    try { leads = JSON.parse(result.lastExtractedLeads).filter(l => l.email); } catch {}
    leads.forEach(item => {
      tbody.innerHTML += `<tr>
        <td>${item.first_name || ''} ${item.last_name || ''}</td>
        <td>${item.company_name || 'N/A'}</td>
        <td>${item.job_title || 'N/A'}</td>
        <td>${item.email}</td>
      </tr>`;
    });
    if (AUTH && !dispatchError) showStatus(`Logged in as ${AUTH.name || AUTH.email}. ${leads.length} lead(s) ready.`, '#555');
  });
});

document.getElementById('sendToSheetBtn').addEventListener('click', async () => {
  if (!AUTH) return showStatus('Log in via the extension popup first.', '#dc3545');

  const result = await chrome.storage.local.get(['lastExtractedLeads']);
  let raw = [];
  try { raw = JSON.parse(result.lastExtractedLeads || '[]').filter(l => l.email); } catch {}
  if (raw.length === 0) return showStatus('No leads with emails found to push.', '#dc3545');

  const leads = raw.map(item => ({
    poc: `${item.first_name || ''} ${item.last_name || ''}`.trim(),
    first_name: item.first_name || '',
    firm: item.company_name || 'N/A',
    recipient: item.email,
    poc_role: item.job_title || ''
  }));

  // The backend verifies the session, gates the account, and forwards to the
  // master sheet — the master URL never lives in the extension.
  showStatus(`Dispatching ${leads.length} lead(s)...`, '#555');
  try {
    const res = await fetch(`${BACKEND_URL}/api/dispatch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${AUTH.token}` },
      body: JSON.stringify({ leads })
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) {
      // 401 expired, 403 deactivated, 429 limit, 404 not found, 5xx server/master
      return showStatus('Blocked: ' + (d.error || 'dispatch failed'), '#dc3545');
    }
    if (d.status === 'success') {
      showStatus(`Done — routed ${d.routed}/${d.total}${d.unrouted ? `, ${d.unrouted} unrouted` : ''}.`, '#218838');
    } else {
      showStatus('Server said: ' + (d.message || d.error || JSON.stringify(d)), '#dc3545');
    }
  } catch {
    showStatus('Network error reaching the backend. Try again.', '#dc3545');
  }
});
