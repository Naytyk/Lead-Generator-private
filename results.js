// Hardcoded default master web app URL. Safe to commit (it's not a secret).
// If you ever create a NEW deployment (vs. updating the existing one), replace this.
const MASTER_WEBHOOK_URL = 'https://script.google.com/macros/s/AKfycbxmS4ktGs9UWUNuJGMEa7ozq07QYyZEkFpAlAnZ3Ats6tn0lfTRUCBkamAeIWe4yKP4/exec';

function showStatus(msg, color) {
  const el = document.getElementById('status');
  el.style.color = color || '#333';
  el.textContent = msg;
}

document.addEventListener('DOMContentLoaded', () => {
  const tbody = document.getElementById('tableBody');

  // Restore saved config.
  chrome.storage.local.get(['webhookUrl', 'leadUserId', 'leadSecret'], (res) => {
    // Saved value wins (manual override); otherwise fall back to the hardcoded default.
    document.getElementById('webhookUrl').value = res.webhookUrl || MASTER_WEBHOOK_URL;
    if (res.leadUserId) document.getElementById('userId').value = res.leadUserId;
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
    showStatus(`${leads.length} lead(s) ready to dispatch.`, '#555');
  });
});

document.getElementById('sendToSheetBtn').addEventListener('click', async () => {
  const webhook = document.getElementById('webhookUrl').value.trim();
  const userId = document.getElementById('userId').value.trim().toUpperCase();
  const secret = document.getElementById('secret').value.trim();

  if (!webhook) return showStatus('Enter the Master Web App URL.', '#dc3545');
  if (!userId || userId.length !== 6) return showStatus('Enter the 6-letter owner User ID.', '#dc3545');
  if (!secret) return showStatus('Enter the shared secret.', '#dc3545');

  // Persist config for next time.
  chrome.storage.local.set({ webhookUrl: webhook, leadUserId: userId, leadSecret: secret });

  const result = await chrome.storage.local.get(['lastExtractedLeads']);
  const leads = JSON.parse(result.lastExtractedLeads || '[]').filter(l => l.email);
  if (leads.length === 0) return showStatus('No leads with emails found to push.', '#dc3545');

  // Map to the master sheet's expected lead shape. userId is sent at batch level.
  const formattedLeads = leads.map(item => ({
    poc: `${item.first_name || ''} ${item.last_name || ''}`.trim(),
    first_name: item.first_name || '',
    firm: item.company_name || 'N/A',
    recipient: item.email,
    poc_role: item.job_title || ''
  }));

  const payload = { secret, userId, leads: formattedLeads };

  showStatus(`Dispatching ${leads.length} lead(s)...`, '#555');

  // Send via the background worker so we can read the response (host_permissions
  // bypass CORS there) and surface real routed/unrouted counts.
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
