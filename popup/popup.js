document.addEventListener('DOMContentLoaded', async () => {
  const defaultState = document.getElementById('defaultState');
  const startRecordBtn = document.getElementById('startRecordBtn');
  const macroList = document.getElementById('macroList');
  const emptyState = document.getElementById('emptyState');
  const dashboardBtn = document.getElementById('dashboardBtn');

  // Load current state
  chrome.runtime.sendMessage({ action: 'GET_STATE' }, (response) => {
    // We only need default state in popup now, recording is handled on-page.
  });

  // Load macros
  loadMacros();

  // Listen for live updates (optional now but kept for storage sync)
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'STEP_RECORDED') {
      // Logic for background only now
    }
  });

  // Buttons
  startRecordBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'START_RECORDING' }, (res) => {
      window.close(); // Close popup once recording starts
    });
  });

  dashboardBtn.addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('dashboard/dashboard.html') });
  });

  // showRecording and showDefault removed as UI is handled on-page and via popup close.

  async function loadMacros() {
    const result = await chrome.storage.local.get(['macros']);
    const macros = result.macros || [];
    
    if (macros.length === 0) {
      emptyState.style.display = 'block';
      macroList.innerHTML = '';
      return;
    }

    emptyState.style.display = 'none';
    macroList.innerHTML = '';

    // Reverse to show newest first
    macros.slice().reverse().forEach(macro => {
      const el = document.createElement('div');
      el.className = 'macro-item';
      el.innerHTML = `
        <div class="macro-info">
          <span class="macro-name">${escapeHTML(macro.name)}</span>
          <span class="macro-meta">${macro.steps.length} steps</span>
        </div>
        <button class="btn-play" data-id="${escapeHTML(macro.id)}" title="Play Macro">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
        </button>
      `;
      macroList.appendChild(el);
    });

    // Attach play listeners
    document.querySelectorAll('.btn-play').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.getAttribute('data-id');
        chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
          if (tabs.length > 0) {
            chrome.runtime.sendMessage({ action: 'RUN_MACRO', macroId: id, tabId: tabs[0].id });
          }
          window.close(); // Close popup when playing
        });
      });
    });
  }

  function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
});
