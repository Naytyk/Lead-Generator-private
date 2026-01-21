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