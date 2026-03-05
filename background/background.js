// background.js
// Service Worker to manage state, storage, and cross-extension communication

let isRecording = false;
let currentMacroSteps = [];

chrome.storage.local.get(['isRecording', 'currentMacroSteps'], (res) => {
  if (res.isRecording) isRecording = res.isRecording;
  if (res.currentMacroSteps) currentMacroSteps = res.currentMacroSteps;
});

async function syncState(recording, steps) {
  isRecording = recording;
  currentMacroSteps = steps;
  await chrome.storage.local.set({ isRecording, currentMacroSteps });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'START_RECORDING') {
    syncState(true, []);
    
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
      if (tabs.length > 0) {
        let activeTabId = tabs[0].id;
        
        chrome.scripting.executeScript({
          target: { tabId: activeTabId },
          files: ['content/recorder.js']
        }).catch(() => {}).finally(() => {
          chrome.tabs.sendMessage(activeTabId, { action: 'START_RECORDING' }, () => chrome.runtime.lastError);
        });
      }
    });

    chrome.action.setBadgeText({ text: 'REC' });
    chrome.action.setBadgeBackgroundColor({ color: '#ef4444' }); // Red
    sendResponse({ status: 'recording_started' });
    return true;
    
  } else if (message.action === 'STOP_RECORDING') {
    chrome.action.setBadgeText({ text: '' });
    
    // Broadcast stop so any tab can stop
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach(tab => {
        chrome.tabs.sendMessage(tab.id, { action: 'STOP_RECORDING' }, () => chrome.runtime.lastError);
      });
    });
    
    // Slight delay to allow final type buffers to arrive before we clear state
    setTimeout(() => {
      const macroName = message.macroName || `Macro ${new Date().toLocaleString()}`;
      saveMacro(macroName, currentMacroSteps).then(() => {
        syncState(false, []);
        sendResponse({ status: 'recording_stopped' });
      });
    }, 200);
    
    return true; // indicates asynchronous response

  } else if (message.action === 'GET_STATE') {
    sendResponse({ 
      isRecording, 
      stepCount: currentMacroSteps.length 
    });
    return true;

  } else if (message.type === 'RECORD_STEP') {
    if (isRecording || currentMacroSteps.length > 0) { // Keep accepting steps closely
      currentMacroSteps.push(message.step);
      syncState(isRecording, currentMacroSteps);
      chrome.action.setBadgeText({ text: currentMacroSteps.length.toString() });
      
      // Broadcast to popup so UI updates instantly
      chrome.runtime.sendMessage({ 
        type: 'STEP_RECORDED', 
        count: currentMacroSteps.length 
      }).catch(err => {
        // Warning: sending to runtime when popup is closed throws an error, we can safely ignore it.
      });
    }
  } else if (message.action === 'RUN_MACRO') {
    runMacro(message.macroId, message.tabId).then(() => {
       sendResponse({ status: 'macro_finished' });
    });
    return true;
  }
});

async function saveMacro(name, steps) {
  if (steps.length === 0) return; // Don't save empty macros
  
  const result = await chrome.storage.local.get(['macros']);
  const macros = result.macros || [];
  
  macros.push({
    id: Date.now().toString(),
    name,
    steps,
    createdAt: Date.now(),
    triggers: [] // For shortcuts or auto-run rules
  });
  
  await chrome.storage.local.set({ macros });
}

// Global Keyboard Shortcuts
chrome.commands.onCommand.addListener(async (command) => {
  console.log('[MacroFlow] Command triggered:', command);
  // the command string will be like "slot-1"
  
  const result = await chrome.storage.local.get(['macros']);
  const macros = result.macros || [];
  
  // Find which macro has this command in its triggers
  const assignedMacro = macros.find(m => m.triggers && m.triggers.includes(command));
  
  if (assignedMacro) {
    console.log('[MacroFlow] Running macro via shortcut:', assignedMacro.name);
    runMacro(assignedMacro.id, null); // Will query active tab
  } else {
    console.log('[MacroFlow] No macro assigned to:', command);
  }
});

// Basic Playback Functionality
async function runMacro(macroId, tabId) {
  const result = await chrome.storage.local.get(['macros']);
  const macros = result.macros || [];
  const macro = macros.find(m => m.id === macroId);
  
  if (!macro) {
    console.error(`Macro ${macroId} not found.`);
    return;
  }
  
  if (tabId) {
    chrome.scripting.executeScript({
      target: { tabId },
      files: ['content/player.js']
    }).catch(() => {}).finally(() => {
      chrome.tabs.sendMessage(tabId, { action: 'PLAY_MACRO', steps: macro.steps });
    });
  } else {
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
        if (tabs.length > 0) {
          chrome.scripting.executeScript({
            target: { tabId: tabs[0].id },
            files: ['content/player.js']
          }).catch(() => {}).finally(() => {
            chrome.tabs.sendMessage(tabs[0].id, { action: 'PLAY_MACRO', steps: macro.steps });
          });
        }
    });
  }
}
