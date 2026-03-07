import { supabase } from '../utils/supabase.js';

(async () => {
  const defaultState = document.getElementById('defaultState');
  const authPromptState = document.getElementById('authPromptState');
  const startRecordBtn = document.getElementById('startRecordBtn');
  const macroList = document.getElementById('macroList');
  const emptyState = document.getElementById('emptyState');
  const dashboardBtn = document.getElementById('dashboardBtn');

  const popupAuthEmail = document.getElementById('popupAuthEmail');
  const popupAuthPassword = document.getElementById('popupAuthPassword');
  const popupLoginBtn = document.getElementById('popupLoginBtn');
  const popupSignupBtn = document.getElementById('popupSignupBtn');
  const popupSkipBtn = document.getElementById('popupSkipBtn');
  const popupAuthStatus = document.getElementById('popupAuthStatus');

  // Check auth state and skipped flag
  const { authSkipped } = await chrome.storage.local.get(['authSkipped']);
  const { data: { session } } = await supabase.auth.getSession();

  if (session || authSkipped) {
    authPromptState.classList.remove('active');
    defaultState.classList.add('active');
  } else {
    defaultState.classList.remove('active');
    authPromptState.classList.add('active');
  }

  popupSkipBtn.addEventListener('click', async () => {
    await chrome.storage.local.set({ authSkipped: true });
    authPromptState.classList.remove('active');
    defaultState.classList.add('active');
  });

  async function handleAuth(action) {
    const email = popupAuthEmail.value.trim();
    const password = popupAuthPassword.value.trim();
    if (!email || !password) return showStatus('Enter email and password', true);

    popupLoginBtn.disabled = true;
    popupSignupBtn.disabled = true;
    showStatus('Processing...', false);

    const { data, error } = action === 'login' 
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password });

    popupLoginBtn.disabled = false;
    popupSignupBtn.disabled = false;

    if (error) {
      showStatus(error.message, true);
    } else {
      authPromptState.classList.remove('active');
      defaultState.classList.add('active');
    }
  }

  function showStatus(msg, isError) {
    popupAuthStatus.textContent = msg;
    popupAuthStatus.className = 'status-text ' + (isError ? 'warning-text' : '');
    popupAuthStatus.classList.remove('hidden');
  }

  popupLoginBtn.addEventListener('click', () => handleAuth('login'));
  popupSignupBtn.addEventListener('click', () => handleAuth('signup'));

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
    const { data: { session } } = await supabase.auth.getSession();
    let macros = [];

    if (session) {
      const { data, error } = await supabase
        .from('macros')
        .select('*')
        .order('created_at', { ascending: false });
      if (!error && data) {
        const remoteMacros = data.map(m => ({
          id: m.id,
          name: m.name,
          steps: m.steps,
          createdAt: new Date(m.created_at).getTime(),
          triggers: m.triggers || []
        }));
        const { macros: localMacros = [] } = await chrome.storage.local.get(['macros']);
        
        // Merge: take remote macros, and append local ones that aren't synced yet (offline IDs are timestamps)
        const remoteIds = new Set(remoteMacros.map(m => m.id));
        const unsyncedLocal = localMacros.filter(m => !remoteIds.has(m.id) && !String(m.id).includes('-'));
        
        macros = [...remoteMacros, ...unsyncedLocal];
        macros.sort((a, b) => b.createdAt - a.createdAt);
        
        await chrome.storage.local.set({ macros });
      } else {
        console.error('[MacroFlow] Supabase fetch error:', error);
        if (error && error.message && error.message.toLowerCase().includes('jwt')) {
           await supabase.auth.signOut();
           window.close();
           return;
        }
        const result = await chrome.storage.local.get(['macros']);
        macros = result.macros || [];
      }
    } else {
      const result = await chrome.storage.local.get(['macros']);
      macros = result.macros || [];
    }
    
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
})();
