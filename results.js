document.addEventListener('DOMContentLoaded', () => {
  const tbody = document.getElementById('tableBody');
  const urlInput = document.getElementById('webhookUrl');
  
  // Load saved URL
  chrome.storage.local.get(['webhookUrl'], (res) => { if(res.webhookUrl) urlInput.value = res.webhookUrl; });

  chrome.storage.local.get(['lastExtractedLeads'], (result) => {
    if (!result.lastExtractedLeads) return;
    const leads = JSON.parse(result.lastExtractedLeads).filter(l => l.email);
    
    leads.forEach(item => {
      const row = `<tr>
        <td>${item.first_name || ''} ${item.last_name || ''}</td>
        <td>${item.company_name || 'N/A'}</td>
        <td>${item.email}</td>
      </tr>`;
      tbody.innerHTML += row;
    });
  });
});

document.getElementById('sendToSheetBtn').addEventListener('click', async () => {
  const webhook = document.getElementById('webhookUrl').value;
  
  if (!webhook) return alert("Please enter the Webhook URL");
  chrome.storage.local.set({ webhookUrl: webhook });

  const result = await chrome.storage.local.get(['lastExtractedLeads']);
  // Filter for valid emails
  const leads = JSON.parse(result.lastExtractedLeads || "[]").filter(l => l.email);

  if (leads.length === 0) return alert("No leads with emails found to push.");

  // --- SIMPLIFIED: JUST SEND DATA, NO DATES ---
  const formattedLeads = leads.map(item => ({
      poc: `${item.first_name || ''} ${item.last_name || ''}`.trim(),
      first_name: item.first_name || '',
      firm: item.company_name || 'N/A',
      recipient: item.email
  }));

  // Push to Apps Script
  fetch(webhook, {
    method: 'POST',
    mode: 'no-cors',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ leads: formattedLeads })
  })
  .then(() => alert(`Successfully queued ${leads.length} leads!`))
  .catch(err => alert("Error: " + err));
});