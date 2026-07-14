function setMonacoValue(text, clickSelector) {
  const maxWaitMs = 15000;
  const intervalMs = 300;
  const startTime = Date.now();

  const timer = setInterval(() => {
    // Access the Monaco API from the MAIN world
    const monaco = window.monaco;

    // Apify often has multiple models; we need the one ending in content.json
    const models = monaco?.editor?.getModels();
    const targetModel = models?.find(m => m.uri.toString().includes('content.json')) || models?.[0];

    if (targetModel) {
      clearInterval(timer);

      // Force the value into the editor's internal state
      targetModel.setValue(text);
      console.log('✅ Data filled into Monaco');

      // Trigger the 'Run' button after a small delay to allow validation
      if (clickSelector) {
        setTimeout(() => {
          const runButton = document.querySelector(clickSelector);
          if (runButton && !runButton.disabled) {
            runButton.click();
            console.log('🚀 Run button clicked');
          }
        }, 800);
      }
    } else if (Date.now() - startTime >= maxWaitMs) {
      clearInterval(timer);
      console.warn('❌ Monaco model not found. Editor might not be fully initialized.');
    }
  }, intervalMs);
}

// Function executed in the page context (MAIN world)
async function getMonacoResults() {
  const monaco = window.monaco;
  
  // 1. Locate and click the JSON button
  const jsonButton = Array.from(document.querySelectorAll('button.ButtonSwitch__Item'))
    .find(btn => btn.innerText.includes('JSON'));

  if (jsonButton) {
    jsonButton.click();
    console.log('✅ Switched to JSON view. Waiting 1 second for initialization...');
    
    // 2. Wait exactly 1 second as requested
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  const models = monaco?.editor?.getModels();
  
  // 3. Find the model containing the results array
  const targetModel = models?.find(m => {
    const val = m.getValue().trim();
    return val.startsWith('[') && val.endsWith(']');
  }) || models?.[0];

  return targetModel ? targetModel.getValue() : { error: "No JSON model found" };
}

// Read the current run output in the MAIN world. Switches to the JSON view,
// gives it a moment to render, then returns the first non-empty JSON array
// model (the dataset) — or null if the run hasn't produced output yet.
async function readOutputArray() {
  const jsonButton = Array.from(document.querySelectorAll('button.ButtonSwitch__Item'))
    .find(btn => (btn.textContent || '').trim() === 'JSON');
  if (jsonButton) {
    jsonButton.click();
    await new Promise(resolve => setTimeout(resolve, 700));
  }

  const models = window.monaco?.editor?.getModels() || [];
  for (const model of models) {
    const value = model.getValue().trim();
    // Non-empty array only: the input is an object, an empty result is "[]".
    if (value.startsWith('[') && value.endsWith(']') && value.length > 2) {
      return value;
    }
  }
  return null;
}

// Off-screen window URL (the actor input page).
const ACTOR_INPUT_URL = 'https://console.apify.com/actors/IoSHqwTR9YGhzccez/input';
const BACKEND_URL = 'https://email-monitoringbackend.vercel.app';

// Open an extension page in the user's ON-SCREEN window and tear down the hidden
// off-screen run window. `extra` is written to storage first (e.g. the leads to
// render, a dispatch error to show, or a success summary). Falls back to a fresh
// window if the stored main window was closed in the meantime.
function openResultPage(page, extra) {
  chrome.storage.local.get(['mainWindowId', 'offscreenWindowId'], ({ mainWindowId, offscreenWindowId }) => {
    chrome.storage.local.set(extra || {}, () => {
      const createProps = { url: page, active: true };
      if (mainWindowId) createProps.windowId = mainWindowId;
      chrome.tabs.create(createProps, () => {
        if (chrome.runtime.lastError && createProps.windowId) {
          chrome.tabs.create({ url: page, active: true });
        }
        if (offscreenWindowId) {
          chrome.windows.remove(offscreenWindowId).catch(() => {});
        }
        chrome.storage.local.remove(['mainWindowId', 'offscreenWindowId']);
      });
    });
  });
}

// Manual path ("View Scraped Table"): just store the raw leads and open the table.
function finalizeResults(data) {
  openResultPage('results.html', { lastExtractedLeads: data });
}

// Map raw Apify leads (a JSON array string) to the master sheet's expected shape,
// keeping only rows that have an email.
function formatLeads(rawArrayString) {
  let arr;
  try { arr = JSON.parse(rawArrayString); } catch { arr = []; }
  return (arr || []).filter(l => l && l.email).map(item => ({
    poc: `${item.first_name || ''} ${item.last_name || ''}`.trim(),
    first_name: item.first_name || '',
    firm: item.company_name || 'N/A',
    recipient: item.email,
    poc_role: item.job_title || ''
  }));
}

// AUTO-DISPATCH: send the scraped leads straight to the master sheet via the
// backend (which gates the account and forwards to the master Apps Script).
// Success → success.html. Any failure (not logged in, no leads, account blocked,
// network/master error, partial routing) → the results table so the teammate can
// review and retry manually, with the reason shown.
async function autoDispatch(rawArrayString) {
  // Always keep the raw leads so the fallback table can render them.
  await chrome.storage.local.set({ lastExtractedLeads: rawArrayString });

  const { shareAuth } = await chrome.storage.local.get('shareAuth');
  if (!shareAuth || !shareAuth.token) {
    return openResultPage('results.html', { dispatchError: 'You are not logged in.' });
  }

  const leads = formatLeads(rawArrayString);
  if (leads.length === 0) {
    return openResultPage('results.html', { dispatchError: 'No leads with emails were found.' });
  }

  try {
    const res = await fetch(`${BACKEND_URL}/api/dispatch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${shareAuth.token}` },
      body: JSON.stringify({ leads })
    });
    const data = await res.json().catch(() => ({}));

    if (res.ok && data.status === 'success' && (data.unrouted || 0) === 0) {
      return openResultPage('success.html', {
        dispatchSummary: { routed: data.routed, total: data.total }
      });
    }

    const reason = data.error || data.message
      || (data.unrouted ? `${data.unrouted} lead(s) couldn't be routed — your sheet may not be registered yet.` : 'Dispatch failed.');
    return openResultPage('results.html', { dispatchError: reason });
  } catch {
    return openResultPage('results.html', { dispatchError: 'Network error reaching the backend.' });
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Launch the actor run in a hidden, off-screen popup window. Remembers the
  // user's current on-screen window so results can open there later.
  if (message.type === 'START_OFFSCREEN_RUN') {
    chrome.windows.getLastFocused({ windowTypes: ['normal'] }, (mainWin) => {
      const mainWindowId = mainWin?.id;
      // Chrome forbids off-screen bounds (must be >=50% on screen), so we hide
      // the run window by creating it minimized — no visible content, no URL bar.
      chrome.windows.create({
        url: ACTOR_INPUT_URL,
        type: 'popup',
        state: 'minimized'
      }, (offWin) => {
        chrome.storage.local.set({ mainWindowId, offscreenWindowId: offWin?.id });
      });
    });
    return;
  }

  // Auto-extract poll: read the output array (or null) from the page.
  if (message.type === 'READ_OUTPUT') {
    const tabId = sender.tab?.id;
    if (!tabId) { sendResponse({ data: null }); return; }
    chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func: readOutputArray
    })
      .then(res => sendResponse({ data: res?.[0]?.result || null }))
      .catch(() => sendResponse({ data: null }));
    return true; // async response
  }

  // Auto-extract finalize: store the leads, dispatch them, open success/table.
  if (message.type === 'STORE_AND_OPEN_RESULTS') {
    autoDispatch(message.data);
    return;
  }

  if (message.type === 'OPEN_RESULTS_TAB') {
    // Find the Apify run tab wherever it is (it now lives in the off-screen
    // window), not the user's active tab.
    chrome.tabs.query({ url: 'https://console.apify.com/actors/IoSHqwTR9YGhzccez/*' }, (tabs) => {
      const tab = tabs[0];
      if (!tab) { console.error('No Apify run tab found.'); return; }

      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        world: 'MAIN',
        func: getMonacoResults
      }).then(injectionResults => {
        const result = injectionResults[0].result;

        if (result && !result.error) {
          finalizeResults(result);
        } else {
          console.error("Extraction failed:", result?.error || "Unknown error");
        }
      }).catch(err => console.error("Scripting Error:", err));
    });
    return true;
  }
  
  // Existing logic for injecting lead parameters (SET_MONACO_VALUE)
  if (message.type === 'SET_MONACO_VALUE' && sender.tab?.id) {
    chrome.scripting.executeScript({
      target: { tabId: sender.tab.id },
      world: 'MAIN',
      func: (text, selector) => {
          const model = window.monaco?.editor?.getModels()[0];
          if (model) {
              model.setValue(text);
              setTimeout(() => {
                  const btn = document.querySelector(selector);
                  if (btn) btn.click();
              }, 500);
          }
      },
      args: [message.text, message.clickSelector],
    });
  }
});

// Ensure your listener still uses world: 'MAIN'
chrome.runtime.onMessage.addListener((message, sender) => {
  if (message?.type === 'SET_MONACO_VALUE' && sender.tab?.id) {
    chrome.scripting.executeScript({
      target: { tabId: sender.tab.id },
      world: 'MAIN',
      func: setMonacoValue,
      args: [message.text, message.clickSelector],
    });
  }
});