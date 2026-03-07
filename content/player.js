// player.js
// Injected into all pages to replay saved macro steps

(function() {
  if (window.macroPlayerLoaded) return;
  window.macroPlayerLoaded = true;
  
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'PLAY_MACRO') {
      console.log('[MacroFlow] Start Playback', message.steps);
      playSteps(message.steps)
        .then(() => {
          console.log('[MacroFlow] Playback completed');
          sendResponse({ status: 'success' });
        })
        .catch(err => {
          console.error('[MacroFlow] Playback failed', err);
          sendResponse({ status: 'error', error: err.message });
        });
      return true; // async response
    }
  });

  async function playSteps(steps) {
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      console.log(`[MacroFlow] Executing step ${i+1}/${steps.length}:`, step);
      
      try {
        if (step.action === 'navigate') {
          window.location.href = step.value;
          return; // Stop current script execution, new page will load
        }
        
        if (step.action === 'wait') {
          await sleep(parseInt(step.value) || 1000);
          continue;
        }

        // Action requires an element: Click or Type
        const element = await waitForElement(step.target, 5000);
        
        if (step.action === 'click') {
          simulateClick(element);
          await sleep(500); // Small natural delay after click
        } else if (step.action === 'type') {
          simulateType(element, step.value);
          await sleep(200);
        }
        
      } catch(err) {
        console.warn(`[MacroFlow] Step failed: ${err.message}`);
        throw err; // Stop execution on failure
      }
    }
  }

  async function waitForElement(selector, timeout = 5000) {
    if (!selector) throw new Error("No selector provided for this step");
    
    const getEl = () => {
      if (selector.startsWith('text=')) {
        const rawTextFind = selector.substring(5);
        const textToFind = rawTextFind.toLowerCase().trim();
        const elements = document.querySelectorAll('button, a, span, div, li, [role="menuitem"], [class*="menuitem"], [class*="button"]');
        
        let bestMatch = null;
        let bestScore = Infinity; // Lower is better

        for (const el of elements) {
          // Replace non-breaking spaces with normal spaces
          const rawText = el.textContent.replace(/\u00A0/g, ' ').trim();
          const text = rawText.toLowerCase();
          
          if (!text) continue;

          if (text.includes(textToFind)) {
            const rect = el.getBoundingClientRect();
            // Check visibility
            if (rect.width > 0 && rect.height > 0) {
              
              let score = Infinity;
              
              if (text === textToFind) {
                // Perfect exact match (ignoring case)
                score = 0;
              } else if (text.startsWith(textToFind) || text.endsWith(textToFind)) {
                 // Good match, but attached to something else
                 score = text.length - textToFind.length;
              } else {
                 // Contains match
                 score = (text.length - textToFind.length) + 1000;
              }
              
              if (score < bestScore) {
                bestScore = score;
                bestMatch = el;
              }
            }
          }
        }
        return bestMatch;
      }
      try {
        return document.querySelector(selector);
      } catch (e) {
        return null;
      }
    };
    
    return new Promise((resolve, reject) => {
      let el = getEl();
      if (el) return resolve(el);
      
      const observer = new MutationObserver(() => {
        el = getEl();
        if (el) {
          observer.disconnect();
          resolve(el);
        }
      });
      
      observer.observe(document.body, { childList: true, subtree: true, attributes: true, characterData: true });
      
      setTimeout(() => {
        observer.disconnect();
        reject(new Error(`Timeout waiting for element: ${selector}`));
      }, timeout);
    });
  }

  function simulateClick(element) {
    const rect = element.getBoundingClientRect();
    const clientX = rect.left + rect.width / 2;
    const clientY = rect.top + rect.height / 2;

    const eventInit = {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX: clientX,
      clientY: clientY,
      buttons: 1
    };

    // Dispatch full event sequence for complex apps (e.g., Google Docs menus)
    element.dispatchEvent(new PointerEvent('pointerdown', eventInit));
    element.dispatchEvent(new MouseEvent('mousedown', eventInit));
    element.dispatchEvent(new PointerEvent('pointerup', eventInit));
    element.dispatchEvent(new MouseEvent('mouseup', eventInit));
    element.dispatchEvent(new MouseEvent('click', eventInit));
    
    // Also try native click just in case
    element.click();
  }

  function simulateType(element, value) {
    element.focus();
    
    // React/Vue often monkey-patch standard setters, bypass them
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
    const nativeTextAreaValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")?.set;
    
    if (element.tagName === 'TEXTAREA' && nativeTextAreaValueSetter) {
      nativeTextAreaValueSetter.call(element, value);
    } else if (nativeInputValueSetter) {
      nativeInputValueSetter.call(element, value);
    } else {
      element.value = value;
    }
    
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
  }
})();
