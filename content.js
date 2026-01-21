// Content script for interacting with the Apify input page
console.log('Apify input page loaded. Ready for interaction.');

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
  const maxWaitMs = 15000;
  const intervalMs = 500; // Slower interval to let the UI settle
  const startTime = Date.now();

  const timer = setInterval(() => {
    // Check if the wrapper exists in the DOM
    const wrapper = document.querySelector('[data-test="monaco-editor-wrapper"]');
    
    if (wrapper) {
      clearInterval(timer);
      
      const leadParam = {
        company_domain: ["https://www.razorpay.com"],
        email_status: ["validated"],
        fetch_count: 30,
        file_name: "Razorpay extension leads",
        seniority_level: ["c_suite", "founder", "owner", "director", "vp", "head"]
      };

      // Send the data to background.js to handle the MAIN world injection
      requestMonacoValueSet(JSON.stringify(leadParam, null, 2));
      return;
    }

    if (Date.now() - startTime >= maxWaitMs) {
      clearInterval(timer);
      console.warn('Editor wrapper not found');
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
  const wrapper = input.closest('[data-test="monaco-editor-wrapper"]');
  const editor = wrapper ? wrapper.querySelector('.monaco-editor') : null;
  if (!wrapper || !editor) {
    return false;
  }

  const minSize = 100;
  const hasSize = editor.clientWidth >= minSize && editor.clientHeight >= minSize;
  const hasLines = !!editor.querySelector('.view-lines');
  return hasSize && hasLines;
}

// if (document.readyState === 'complete') {
//   clickJsonWhenReady();
// } else {
//   window.addEventListener('load', clickJsonWhenReady, { once: true });
// }

clickJsonWhenReady();
