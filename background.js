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

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Dispatch leads to the SHARE master sheet web app. Runs in the service worker,
  // where host_permissions allow cross-origin reads of the JSON response.
  if (message.type === 'PUSH_LEADS') {
    (async () => {
      try {
        const res = await fetch(message.webhook, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(message.payload),
          redirect: 'follow'
        });
        const text = await res.text();
        let data;
        try { data = JSON.parse(text); } catch { data = { status: 'error', message: text.slice(0, 200) }; }
        sendResponse({ ok: res.ok, data });
      } catch (err) {
        sendResponse({ ok: false, error: err.message });
      }
    })();
    return true; // keep the message channel open for the async response
  }

  if (message.type === 'OPEN_RESULTS_TAB') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs[0]) return;

      chrome.scripting.executeScript({
        target: { tabId: tabs[0].id },
        world: 'MAIN',
        func: getMonacoResults
      }).then(injectionResults => {
        const result = injectionResults[0].result;
        
        if (result && !result.error) {
          // Store back in Extension context
          chrome.storage.local.set({ lastExtractedLeads: result }, () => {
            chrome.tabs.create({ url: 'results.html' });
          });
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