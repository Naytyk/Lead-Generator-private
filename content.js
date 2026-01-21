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
  const maxWaitMs = 30000;
  const intervalMs = 200;
  const startTime = Date.now();

  const timer = setInterval(() => {
    const input = document.querySelector('textarea.inputarea');
    if (input && isEditorReady(input)) {
      clearInterval(timer);
      input.focus();
      const leadParam = {
        company_domain: ["https://www.staffcloud.net"],
        email_status: ["validated"],
        fetch_count: 30,
        file_name: "Razorpay extension leads",
        seniority_level: [
          "c_suite",
          "founder",
          "owner",
          "director",
          "vp",
          "head"
        ]
      }
      requestMonacoValueSet(JSON.stringify(leadParam, null, 2));
      console.log('Entered text in editor.');
      return;
    }
    if (Date.now() - startTime >= maxWaitMs) {
      clearInterval(timer);
      console.warn('Editor textarea not found before timeout.');
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