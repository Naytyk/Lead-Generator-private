// Content script for interacting with the Apify input page
console.log('Apify input page loaded. Ready for interaction.');

// --- SHARE BRANDING: pin the tab/window title and cover the Apify UI with a
// branded "processing" overlay, so the run window never reveals what it really
// is. Only applied during an automated run (autoExtract flag set). ---
function pinPageTitle(title) {
  const reapply = () => { if (document.title !== title) document.title = title; };
  reapply();
  // Apify's SPA rewrites the title (and can replace the whole <title> node), so
  // watch the head subtree — not just one node — and re-apply immediately.
  const head = document.head || document.documentElement;
  new MutationObserver(reapply).observe(head, { childList: true, subtree: true, characterData: true });
  setInterval(reapply, 250);
}

// Replace Apify's favicon with a SHARE mark and keep it replaced.
function setShareFavicon() {
  const ICON = 'data:image/svg+xml,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">' +
    '<rect width="64" height="64" rx="14" fill="#000"/>' +
    '<text x="32" y="45" font-family="Arial,Helvetica,sans-serif" font-size="40" ' +
    'font-weight="bold" text-anchor="middle" fill="#4f8cff">S</text></svg>'
  );
  const apply = () => {
    // Drop any Apify-supplied icons.
    document.querySelectorAll("link[rel~='icon'], link[rel='shortcut icon'], link[rel='apple-touch-icon']")
      .forEach(l => { if (l.id !== 'share-favicon') l.remove(); });
    let link = document.getElementById('share-favicon');
    if (!link) {
      link = document.createElement('link');
      link.id = 'share-favicon';
      link.rel = 'icon';
      (document.head || document.documentElement).appendChild(link);
    }
    if (link.getAttribute('href') !== ICON) link.setAttribute('href', ICON);
  };
  apply();
  const head = document.head || document.documentElement;
  new MutationObserver(apply).observe(head, { childList: true, subtree: true });
  setInterval(apply, 1000);
}

function injectShareOverlay() {
  if (document.getElementById('share-lead-overlay')) return;

  const style = document.createElement('style');
  style.textContent = `
    @keyframes share-spin { to { transform: rotate(360deg); } }
    @keyframes share-pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.45; } }
    #share-lead-overlay {
      position: fixed; inset: 0; z-index: 2147483647; background: #000;
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      gap: 24px; font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      color: #fff; user-select: none;
    }
    #share-lead-overlay .share-brand {
      font-size: 38px; font-weight: 800; letter-spacing: 8px; margin-left: 8px;
    }
    #share-lead-overlay .share-brand b { color: #4f8cff; font-weight: 800; }
    #share-lead-overlay .share-spinner {
      width: 56px; height: 56px; border-radius: 50%;
      border: 4px solid rgba(255,255,255,0.12); border-top-color: #4f8cff;
      animation: share-spin 0.9s linear infinite;
    }
    #share-lead-overlay .share-status {
      font-size: 15px; letter-spacing: 1.5px; color: #d7d7d7;
      animation: share-pulse 1.6s ease-in-out infinite;
    }
    #share-lead-overlay .share-sub { font-size: 12px; letter-spacing: 2px; color: #6a6a6a; text-transform: uppercase; }
  `;
  (document.head || document.documentElement).appendChild(style);

  const overlay = document.createElement('div');
  overlay.id = 'share-lead-overlay';
  overlay.innerHTML = `
    <div class="share-brand">SHARE<b>.</b></div>
    <div class="share-spinner"></div>
    <div class="share-status">Processing your leads…</div>
    <div class="share-sub">SHARE Lead Extractor</div>
  `;
  (document.body || document.documentElement).appendChild(overlay);
}

chrome.storage.local.get('autoExtract', ({ autoExtract }) => {
  if (!autoExtract) return;
  pinPageTitle('SHARE Lead Extractor');
  setShareFavicon();
  injectShareOverlay();
});

function findJsonButton() {
  const buttons = document.querySelectorAll('button.ButtonSwitch__Item');
  for (const button of buttons) {
    const label = button.textContent ? button.textContent.trim() : '';
    if (label === 'JSON') {
      return button;
    }
  }
  return null;
}

function clickJsonWhenReady() {
  const maxWaitMs = 30000;
  const intervalMs = 250;
  const startTime = Date.now();

  const timer = setInterval(() => {
    const button = findJsonButton();
    if (button) {
      clearInterval(timer);
      button.click();
      console.log('Clicked JSON button.');
      typeHelloThereWhenReady();
      return;
    }
    if (Date.now() - startTime >= maxWaitMs) {
      clearInterval(timer);
      console.warn('JSON button not found before timeout.');
    }
  }, intervalMs);
}

function typeHelloThereWhenReady() {
  const maxWaitMs = 30000;
  const intervalMs = 250;
  const startTime = Date.now();

  const timer = setInterval(() => {
    const input = document.querySelector('textarea.inputarea');
    if (input && isEditorReady(input)) {
      clearInterval(timer);
      input.focus();

      // --- NEW LOGIC: GET DYNAMIC PARAMS ---
      chrome.storage.local.get(['activeLeadParams'], (res) => {
        const leadParam = res.activeLeadParams || { error: "No params found" };
        requestMonacoValueSet(JSON.stringify(leadParam, null, 2));
        console.log('✅ Injected dynamic params into Monaco.');
      });
      return;
    }
    if (Date.now() - startTime >= maxWaitMs) {
      clearInterval(timer);
      console.warn('Timeout looking for editor.');
    }
  }, intervalMs);
}

function requestMonacoValueSet(text) {
  chrome.runtime.sendMessage({
    type: 'SET_MONACO_VALUE',
    text,
    clickSelector: 'button[data-test="actor-run-button"]',
  });
}

function isEditorReady(input) {
  // Only require the editor to be MOUNTED, not visibly laid out: the run window
  // is minimized (hidden), so it never gets visible pixel dimensions or rendered
  // .view-lines. setMonacoValue (MAIN world) waits for the actual model anyway,
  // so element presence is a safe trigger.
  const wrapper = input.closest('[data-test="monaco-editor-wrapper"]');
  const editor = wrapper ? wrapper.querySelector('.monaco-editor') : null;
  return !!(wrapper && editor);
}

// --- AUTO-EXTRACT: poll the page until the run's output array appears, then
// open the results tab automatically. Removes the manual second click. ---
let autoExtractPolling = false;

function startAutoExtractPoll() {
  if (autoExtractPolling) return;
  chrome.storage.local.get('autoExtract', ({ autoExtract }) => {
    if (!autoExtract) return; // only when the user kicked off a one-click run
    autoExtractPolling = true;

    const maxWaitMs = 5 * 60 * 1000; // runs can take minutes; give it room
    const intervalMs = 2500;
    const startTime = Date.now();

    const timer = setInterval(() => {
      // Ask the service worker to read the output in the MAIN world (where
      // window.monaco lives). Returns the array string, or null if not ready.
      chrome.runtime.sendMessage({ type: 'READ_OUTPUT' }, (resp) => {
        if (chrome.runtime.lastError) return; // worker waking up; try next tick

        if (resp && resp.data) {
          clearInterval(timer);
          autoExtractPolling = false;
          chrome.storage.local.remove('autoExtract');
          chrome.runtime.sendMessage({ type: 'STORE_AND_OPEN_RESULTS', data: resp.data });
          console.log('✅ Auto-extract: results ready, opening table.');
        } else if (Date.now() - startTime >= maxWaitMs) {
          clearInterval(timer);
          autoExtractPolling = false;
          console.warn('⏱️ Auto-extract timed out. Use "View Scraped Table" to fetch manually.');
        }
      });
    }, intervalMs);
  });
}

// Only run the fill+Run flow on the input page; the run/output page just polls.
if (location.pathname.includes('/input')) {
  clickJsonWhenReady();
}
// Safe everywhere: self-gates on the autoExtract flag, and only matches a
// non-empty JSON *array* (the output) — never the input object.
startAutoExtractPoll();