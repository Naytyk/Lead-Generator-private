const BACKEND_URL = 'https://email-monitoringbackend.vercel.app';

// Hardcoded default master web app URL. Safe to commit (it's not a secret).
// If you ever create a NEW deployment (vs. updating the existing one), replace this.
const MASTER_WEBHOOK_URL = 'https://script.google.com/macros/s/AKfycbxmS4ktGs9UWUNuJGMEa7ozq07QYyZEkFpAlAnZ3Ats6tn0lfTRUCBkamAeIWe4yKP4/exec';

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

  // Restore saved config (webhook + secret); userId is from AUTH.
  chrome.storage.local.get(['webhookUrl', 'leadSecret'], (res) => {
    document.getElementById('webhookUrl').value = res.webhookUrl || MASTER_WEBHOOK_URL;
    if (res.leadSecret) document.getElementById('secret').value = res.leadSecret;
  });

  chrome.storage.local.get(['lastExtractedLeads'], (result) => {
    if (!result.lastExtractedLeads) return;
    const leads = JSON.parse(result.lastExtractedLeads).filter(l => l.email);
    leads.forEach(item => {
      tbody.innerHTML += `<tr>
        <td>${item.first_name || ''} ${item.last_name || ''}</td>
        <td>${item.company_name || 'N/A'}</td>
        <td>${item.job_title || 'N/A'}</td>
        <td>${item.email}</td>
      </tr>`;
    });
    if (AUTH) showStatus(`Logged in as ${AUTH.name || AUTH.email}. ${leads.length} lead(s) ready.`, '#555');
  });
});

document.getElementById('sendToSheetBtn').addEventListener('click', async () => {
  if (!AUTH) return showStatus('Log in via the extension popup first.', '#dc3545');

  const webhook = document.getElementById('webhookUrl').value.trim();
  const secret = document.getElementById('secret').value.trim();
  if (!webhook) return showStatus('Enter the Master Web App URL.', '#dc3545');
  if (!secret) return showStatus('Enter the shared secret.', '#dc3545');

  chrome.storage.local.set({ webhookUrl: webhook, leadSecret: secret });

  // PRE-RUN GATE: confirm the user is still active (and within usage limits)
  // before doing anything. Blocks deactivated accounts; counts this as a use.
  showStatus('Checking your account...', '#555');
  try {
    const pre = await fetch(`${BACKEND_URL}/api/extension/use`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${AUTH.token}` },
      body: JSON.stringify({ userId: AUTH.userId })
    });
    const preData = await pre.json();
    if (!pre.ok) {
      // 403 deactivated, 429 limit exceeded, 404 not found
      return showStatus('Blocked: ' + (preData.error || 'account check failed'), '#dc3545');
    }
  } catch {
    return showStatus('Could not verify your account (network error). Try again.', '#dc3545');
  }

  const result = await chrome.storage.local.get(['lastExtractedLeads']);
  const leads = JSON.parse(result.lastExtractedLeads || '[]').filter(l => l.email);
  if (leads.length === 0) return showStatus('No leads with emails found to push.', '#dc3545');

  const formattedLeads = leads.map(item => ({
    poc: `${item.first_name || ''} ${item.last_name || ''}`.trim(),
    first_name: item.first_name || '',
    firm: item.company_name || 'N/A',
    recipient: item.email,
    poc_role: item.job_title || ''
  }));

  const payload = { secret, userId: AUTH.userId, leads: formattedLeads };
  showStatus(`Dispatching ${leads.length} lead(s)...`, '#555');

  chrome.runtime.sendMessage({ type: 'PUSH_LEADS', webhook, payload }, (resp) => {
    if (chrome.runtime.lastError) {
      return showStatus('Error: ' + chrome.runtime.lastError.message, '#dc3545');
    }
    if (!resp || !resp.ok) {
      return showStatus('Dispatch failed: ' + ((resp && resp.error) || 'unknown error'), '#dc3545');
    }
    const d = resp.data || {};
    if (d.status === 'success') {
      showStatus(`Done — routed ${d.routed}/${d.total}${d.unrouted ? `, ${d.unrouted} unrouted` : ''}.`, '#218838');
    } else if (d.status === 'error' && /unauthorized/i.test(d.message || '')) {
      showStatus('Rejected: shared secret does not match the master sheet.', '#dc3545');
    } else {
      showStatus('Server said: ' + (d.message || JSON.stringify(d)), '#dc3545');
    }
  });
});
