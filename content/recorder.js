// recorder.js
// Injected into all pages to capture user interactions

if (!window.macroRecorderLoaded) {
  window.macroRecorderLoaded = true;
  let isRecording = false;
  let overlayEl = null;
  let stepCount = 0;

  // --- Overlay UI ---
  function createRecordingOverlay() {
    if (overlayEl) return;
    overlayEl = document.createElement('div');
    overlayEl.id = 'macroflow-recording-overlay';
    overlayEl.style.cssText = `
      position: fixed;
      bottom: 24px;
      right: 24px;
      width: 200px;
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 12px;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5);
      padding: 16px;
      z-index: 2147483647;
      font-family: 'Inter', sans-serif;
      color: #f8fafc;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 16px;
      user-select: none;
    `;

    // Status indicator
    const statusContainer = document.createElement('div');
    statusContainer.style.cssText = `
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 40px;
      height: 40px;
      margin-bottom: 24px;
    `;

    const pulseRing = document.createElement('div');
    pulseRing.style.cssText = `
      position: absolute;
      width: 32px;
      height: 32px;
      border-radius: 50%;
      background: #ef4444;
      animation: macroflowPulse 1.5s infinite cubic-bezier(0.215, 0.61, 0.355, 1);
    `;

    const dot = document.createElement('div');
    dot.style.cssText = `
      width: 16px;
      height: 16px;
      background: #ef4444;
      border-radius: 50%;
      z-index: 1;
    `;

    // Inject keyframes if not present
    if (!document.getElementById('macroflow-keyframes')) {
      const style = document.createElement('style');
      style.id = 'macroflow-keyframes';
      style.textContent = `
        @keyframes macroflowPulse {
          0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.7); }
          70% { transform: scale(1.5); box-shadow: 0 0 0 10px rgba(239, 68, 68, 0); }
          100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); }
        }
      `;
      document.head.appendChild(style);
    }

    statusContainer.appendChild(pulseRing);
    statusContainer.appendChild(dot);

    const title = document.createElement('div');
    title.style.cssText = `
      position: absolute;
      bottom: -22px;
      font-size: 14px;
      font-weight: 600;
      color: #ef4444;
      white-space: nowrap;
    `;
    title.innerText = 'Recording Active';
    statusContainer.appendChild(title);

    const stepCounterEl = document.createElement('div');
    stepCounterEl.id = 'macroflow-overlay-steps';
    stepCounterEl.style.cssText = `
      font-size: 12px;
      color: #94a3b8;
      margin-top: 4px;
    `;
    stepCounterEl.innerText = `${stepCount} steps captured`;

    // Stop Button
    const stopBtn = document.createElement('button');
    stopBtn.style.cssText = `
      width: 100%;
      padding: 10px 16px;
      background: rgba(239, 68, 68, 0.1);
      color: #ef4444;
      border: 1px solid rgba(239, 68, 68, 0.2);
      border-radius: 8px;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      transition: all 0.2s;
    `;
    stopBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2" ry="2"></rect></svg> Stop Recording';

    stopBtn.onmouseover = () => {
      stopBtn.style.background = '#ef4444';
      stopBtn.style.color = 'white';
    };
    stopBtn.onmouseout = () => {
      stopBtn.style.background = 'rgba(239, 68, 68, 0.1)';
      stopBtn.style.color = '#ef4444';
    };

    stopBtn.addEventListener('click', () => {
      const macroName = prompt("Name this macro:", `Macro ${new Date().toLocaleTimeString()}`);
      if (macroName !== null) {
        chrome.runtime.sendMessage({ action: 'STOP_RECORDING', macroName });
        removeRecordingOverlay();
      }
    });

    overlayEl.appendChild(statusContainer);
    overlayEl.appendChild(stepCounterEl);
    overlayEl.appendChild(stopBtn);
    document.body.appendChild(overlayEl);
  }

  function removeRecordingOverlay() {
    if (overlayEl) {
      overlayEl.remove();
      overlayEl = null;
    }
  }

  let typeBuffer = "";
  let typeTargetSelector = null;
  let typeTimeout = null;

  const TYPE_DEBOUNCE_MS = 1000;

  // Retrieve state explicitly on load to handle navigation during recording
  chrome.runtime.sendMessage({ action: 'GET_STATE' }, (res) => {
    if (res && res.isRecording) {
      isRecording = true;
      stepCount = res.stepCount || 0;
      createRecordingOverlay(); // Create overlay if already recording on load
    }
  });

  // Listen for background messages (start/stop)
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'START_RECORDING') {
      isRecording = true;
      createRecordingOverlay();
      console.log('[MacroFlow] Content script started recording on this page.');
      sendResponse({ status: 'started' });
    } else if (message.action === 'STOP_RECORDING') {
      flushTypeBuffer();
      isRecording = false;
      removeRecordingOverlay();
      console.log('[MacroFlow] Content script stopped recording.');
      sendResponse({ status: 'stopped' });
    }
    return true;
  });

// Helper: Generate robust CSS selector
function getOptimalSelector(el) {
  if (el.tagName.toLowerCase() === "html") return "html";
  
  // 1. Try robust attributes (often stable across sessions on dynamic sites like Google Docs)
  const attrs = ['data-testid', 'data-id', 'aria-label', 'name', 'placeholder'];
  for (let attr of attrs) {
    if (el.hasAttribute(attr)) {
      const val = el.getAttribute(attr);
      if (val) {
        const sel = `${el.tagName.toLowerCase()}[${attr}="${CSS.escape(val)}"]`;
        try {
          if (document.querySelectorAll(sel).length === 1) return sel;
        } catch(e) {}
      }
    }
  }

  // 2. Try unique text content (very robust for dynamic menus)
  const text = el.textContent.replace(/\u00A0/g, ' ').trim();
  if (text && text.length > 0 && text.length < 50) {
    const hasSpecialClass = typeof el.className === 'string' && (el.className.includes('menuitem') || el.className.includes('button'));
    const validTag = ['BUTTON', 'A', 'SPAN', 'DIV', 'LI'].includes(el.tagName) || el.hasAttribute('role') || hasSpecialClass;
    
    if (validTag) {
      const textToFind = text.toLowerCase();
      const elements = document.querySelectorAll('button, a, span, div, li, [role="menuitem"], [class*="menuitem"], [class*="button"]');
      let matches = 0;
      for (const element of elements) {
         const elText = element.textContent.replace(/\u00A0/g, ' ').trim().toLowerCase();
         if (elText === textToFind) {
            const rect = element.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) matches++;
         }
      }
      
      // Because a button and its child span might both have the identical textContent, 
      // matches will often be 2 or 3. player.js has a scoring system to pick the best one.
      // We just want to avoid generic text like "1" that matches 50 table cells.
      if (matches >= 1 && matches <= 5) {
        return `text=${text}`;
      }
    }
  }

  // 3. Fallback to ID
  if (el.id && !el.id.includes(':') && !/^[0-9]/.test(el.id)) {
    // Check if ID is strictly unique
    try {
      if (document.querySelectorAll(`#${CSS.escape(el.id)}`).length === 1) {
        return `#${CSS.escape(el.id)}`;
      }
    } catch(e) {}
  }

  let path = [];
  let currentEl = el;
  
  while (currentEl && currentEl.nodeType === Node.ELEMENT_NODE) {
    let selector = currentEl.nodeName.toLowerCase();
    
    if (currentEl.id && !currentEl.id.includes(':') && !/^[0-9]/.test(currentEl.id)) {
      try {
        let idSelector = `#${CSS.escape(currentEl.id)}`;
        if (document.querySelectorAll(idSelector).length === 1) {
          selector += idSelector;
          path.unshift(selector);
          break;
        }
      } catch(e){}
    }
    
    let sibling = currentEl;
    let nth = 1;
    while ((sibling = sibling.previousElementSibling) != null) {
      nth++;
    }
    
    if (nth !== 1) {
      selector += `:nth-child(${nth})`;
    }
    
    path.unshift(selector);
    currentEl = currentEl.parentNode;
  }
  
  return path.join(" > ");
}

// Function to send a recorded step to the background script
function recordStep(action, target, value = null) {
  if (!isRecording) return;
  stepCount++;
  
  // Update overlay if present
  const stepCounterEl = document.getElementById('macroflow-overlay-steps');
  if (stepCounterEl) {
    stepCounterEl.innerText = `${stepCount} steps captured`;
  }

  chrome.runtime.sendMessage({
    type: 'RECORD_STEP',
    step: {
      action,
      target,
      value,
      url: window.location.href,
      timestamp: Date.now()
    }
  });
}

function flushTypeBuffer() {
  if (typeBuffer.length > 0 && typeTargetSelector) {
    // Record the batched type action
    recordStep('type', typeTargetSelector, typeBuffer);
    typeBuffer = "";
    typeTargetSelector = null;
  }
}

// Event Listeners
document.addEventListener('click', (e) => {
  if (!isRecording) return;
  
  // Ignore clicks on our own overlay
  if (e.target && e.target.closest && e.target.closest('#macroflow-recording-overlay')) return;
  
  // Flush any pending type action before a click occurs
  flushTypeBuffer();
  
  let targetNode = e.target;
  if (targetNode && targetNode.closest) {
    const interactive = targetNode.closest('button, a, input, select, textarea, [role="button"], [role="menuitem"], [role="tab"], [role="option"], [class*="button"], [class*="menuitem"]');
    if (interactive) {
       targetNode = interactive;
    }
  }

  const selector = getOptimalSelector(targetNode);
  recordStep('click', selector);
  
}, true); // use capture phase

document.addEventListener('keydown', (e) => {
  if (!isRecording) return;

  // Ignore keystrokes on our own overlay (like the macro prompt)
  if (e.target && e.target.closest && e.target.closest('#macroflow-recording-overlay')) return;

  // Ignore specialized keys for typing if they aren't characters
  // E.g., Shift, Ctrl, Alt (We might want to support Enter later, but keeping simple for now)
  if (e.key === 'Shift' || e.key === 'Control' || e.key === 'Alt' || e.key === 'Meta') return;
  if (e.key === 'Enter') {
     flushTypeBuffer();
     const selector = getOptimalSelector(e.target);
     recordStep('keydown', selector, 'Enter');
     return;
  }

  const selector = getOptimalSelector(e.target);
  
  // If user typed in a different element, flush previous
  if (typeTargetSelector && typeTargetSelector !== selector) {
    flushTypeBuffer();
  }

  typeTargetSelector = selector;
    if (e.key === 'Backspace') {
       typeBuffer = typeBuffer.slice(0, -1);
    } else if (e.key.length === 1) { // Normal character
       typeBuffer += e.key;
    }

    clearTimeout(typeTimeout);
    typeTimeout = setTimeout(flushTypeBuffer, TYPE_DEBOUNCE_MS);

  }, true);
}
