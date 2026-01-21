document.addEventListener('DOMContentLoaded', () => {
  const tbody = document.getElementById('tableBody');
  const urlInput = document.getElementById('webhookUrl');
  
  // Load saved URL and set default date
  chrome.storage.local.get(['webhookUrl'], (res) => { if(res.webhookUrl) urlInput.value = res.webhookUrl; });
  document.getElementById('startDate').valueAsDate = new Date();

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
  const startStr = document.getElementById('startDate').value;
  const gap = parseInt(document.getElementById('dayGap').value);
  
  if (!webhook || !startStr) return alert("Fill URL and Date");
  chrome.storage.local.set({ webhookUrl: webhook });

  const result = await chrome.storage.local.get(['lastExtractedLeads']);
  const leads = JSON.parse(result.lastExtractedLeads).filter(l => l.email);
  
  // --- SCHEDULING LOGIC: 80 PER DAY ---
  const formattedLeads = leads.map((item, index) => {
    const dayOffset = Math.floor(index / 80); // Increments every 80 leads
    const scheduledDate = new Date(startStr);
    scheduledDate.setDate(scheduledDate.getDate() + dayOffset);

    const formatDate = (date, daysToAdd) => {
      const d = new Date(date);
      d.setDate(d.getDate() + daysToAdd);
      return d.toISOString().split('T')[0];
    };

    return {
      poc: `${item.first_name || ''} ${item.last_name || ''}`.trim(),
      firm: item.company_name || 'N/A',
      recipient: item.email,
      scheduledDate: scheduledDate.toISOString().split('T')[0],
      f1Date: formatDate(scheduledDate, gap),
      f2Date: formatDate(scheduledDate, gap * 2),
      f3Date: formatDate(scheduledDate, gap * 3)
    };
  });

  // Push to Apps Script
  fetch(webhook, {
    method: 'POST',
    mode: 'no-cors', // Apps Script requires no-cors for simple redirects
    body: JSON.stringify({ leads: formattedLeads })
  }).then(() => alert(`Successfully queued ${leads.length} leads!`))
    .catch(err => alert("Error: " + err));
});