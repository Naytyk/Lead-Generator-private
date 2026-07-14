// Show the routed count from the auto-dispatch, then clear it.
chrome.storage.local.get('dispatchSummary', ({ dispatchSummary }) => {
  if (dispatchSummary && typeof dispatchSummary.routed === 'number') {
    document.getElementById('summary').textContent =
      `${dispatchSummary.routed}/${dispatchSummary.total} lead(s) routed to your sheet.`;
  }
  chrome.storage.local.remove('dispatchSummary');
});
