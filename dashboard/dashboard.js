// dashboard.js
import { generateMacroFromQuery } from '../utils/gemini.js';
import { exportMacroToExtension } from '../utils/exporter.js';

document.addEventListener('DOMContentLoaded', () => {
  const macroListEl = document.getElementById('macroList');
  const macroNameInput = document.getElementById('macroNameInput');
  const stepCounterBadge = document.getElementById('stepCounterBadge');
  const stepsContainer = document.getElementById('stepsContainer');
  const saveBtn = document.getElementById('saveBtn');
  const addStepBtn = document.getElementById('addStepBtn');
  const deleteMacroBtn = document.getElementById('deleteMacroBtn');
  const generateBtn = document.getElementById('generateBtn');
  const aiPrompt = document.getElementById('aiPrompt');
  const aiStatus = document.getElementById('aiStatus');
  const exportBtn = document.getElementById('exportBtn');
  const shortcutSelectEl = document.getElementById('macro-shortcut');
  const btnEditShortcuts = document.getElementById('btn-edit-shortcuts');
  
  let macros = [];
  let currentMacro = null;
  let draggedStepIndex = null;

  // Init
  loadMacros();
  loadCommands();

  // Event Listeners
  btnEditShortcuts.addEventListener('click', () => {
    chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
  });

  async function loadMacros() {
    const result = await chrome.storage.local.get(['macros']);
    macros = result.macros || [];
    renderSidebar();
  }

  async function loadCommands() {
    chrome.commands.getAll((commands) => {
      shortcutSelectEl.innerHTML = '<option value="">No Shortcut</option>';
      commands.forEach(cmd => {
        if (cmd.name.startsWith('slot-')) {
          const option = document.createElement('option');
          option.value = cmd.name;
          option.textContent = cmd.shortcut ? `${cmd.description} (${cmd.shortcut})` : cmd.description;
          shortcutSelectEl.appendChild(option);
        }
      });
    });
  }

  function renderSidebar() {
    macroListEl.innerHTML = '';
    macros.slice().reverse().forEach(macro => {
      const el = document.createElement('div');
      el.className = `macro-item ${currentMacro && currentMacro.id === macro.id ? 'selected' : ''}`;
      el.setAttribute('data-id', macro.id); // Add data-id for selection
      el.innerHTML = `
        <span class="macro-item-title">${escapeHTML(macro.name)}</span>
        <span class="macro-item-meta">${new Date(macro.createdAt).toLocaleString()} • ${macro.steps.length} steps</span>
      `;
      el.addEventListener('click', () => selectMacro(macro.id));
      macroListEl.appendChild(el);
    });
  }

  function selectMacro(id) {
    currentMacro = JSON.parse(JSON.stringify(macros.find(m => m.id === id) || null));
    if (!currentMacro) return;
    
    renderSidebar();
    
    macroNameInput.value = currentMacro.name;
    macroNameInput.disabled = false;
    stepCounterBadge.textContent = `${currentMacro.steps.length} steps`;
    stepCounterBadge.classList.remove('hidden');
    
    // Set shortcut select
    if (currentMacro.triggers && currentMacro.triggers.length > 0) {
      shortcutSelectEl.value = currentMacro.triggers[0];
    } else {
      shortcutSelectEl.value = '';
    }
    
    saveBtn.disabled = false;
    exportBtn.disabled = false;
    deleteMacroBtn.disabled = false;
    addStepBtn.disabled = false;
    
    renderEditor();
  }

  function renderEditor() {
    if (!currentMacro || currentMacro.steps.length === 0) {
      stepsContainer.innerHTML = '<div class="empty-editor"><p>No steps recorded.</p></div>';
      return;
    }

    stepsContainer.innerHTML = '';
    currentMacro.steps.forEach((step, index) => {
      const el = createStepCard(step, index);
      stepsContainer.appendChild(el);
    });
  }

  function createStepCard(step, index) {
    const card = document.createElement('div');
    card.className = `step-card step-action-${step.action}`;
    card.setAttribute('draggable', 'true');
    card.dataset.index = index;
    
    // Drag events
    card.addEventListener('dragstart', handleDragStart);
    card.addEventListener('dragover', handleDragOver);
    card.addEventListener('drop', handleDrop);
    card.addEventListener('dragend', handleDragEnd);

    let actionOptions = `
      <option value="click" ${step.action === 'click' ? 'selected' : ''}>Click</option>
      <option value="type" ${step.action === 'type' ? 'selected' : ''}>Type</option>
      <option value="navigate" ${step.action === 'navigate' ? 'selected' : ''}>Navigate</option>
      <option value="wait" ${step.action === 'wait' ? 'selected' : ''}>Wait (ms)</option>
    `;

    card.innerHTML = `
      <div class="step-drag-handle">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>
      </div>
      <div class="step-content">
        <div class="input-group" style="flex: 0.5;">
          <label>Action</label>
          <select class="step-select action-select">${actionOptions}</select>
        </div>
        <div class="input-group">
          <label>Target (Selector/URL)</label>
          <input type="text" class="step-input target-input" value="${escapeHTML(step.target || '')}" placeholder="Selector or URL">
        </div>
        <div class="input-group ${step.action === 'click' ? 'hidden' : ''}">
          <label>Value</label>
          <input type="text" class="step-input value-input" value="${escapeHTML(step.value || '')}" placeholder="Text to type / timeout ms">
        </div>
      </div>
      <button class="btn-delete" title="Delete Step">
         <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
      </button>
    `;

    // Listeners for inputs
    const actionSelect = card.querySelector('.action-select');
    const targetInput = card.querySelector('.target-input');
    const valueInput = card.querySelector('.value-input');
    const valContainer = card.querySelectorAll('.input-group')[2];

    actionSelect.addEventListener('change', (e) => {
      const newAction = e.target.value;
      currentMacro.steps[index].action = newAction;
      card.className = `step-card step-action-${newAction}`;
      if (newAction === 'click') {
        valContainer.classList.add('hidden');
      } else {
        valContainer.classList.remove('hidden');
      }
    });

    targetInput.addEventListener('input', (e) => currentMacro.steps[index].target = e.target.value);
    valueInput.addEventListener('input', (e) => currentMacro.steps[index].value = e.target.value);

    // Delete
    card.querySelector('.btn-delete').addEventListener('click', () => {
      currentMacro.steps.splice(index, 1);
      renderEditor();
    });

    return card;
  }

  // --- Drag and Drop ---
  function handleDragStart(e) {
    draggedStepIndex = parseInt(this.dataset.index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', draggedStepIndex);
    setTimeout(() => this.classList.add('dragging'), 0);
  }

  function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }

  function handleDrop(e) {
    e.stopPropagation();
    const dropIndex = parseInt(this.dataset.index);
    if (draggedStepIndex === null || draggedStepIndex === dropIndex) return;

    // Reorder array
    const step = currentMacro.steps.splice(draggedStepIndex, 1)[0];
    currentMacro.steps.splice(dropIndex, 0, step);
    renderEditor();
  }

  function handleDragEnd() {
    this.classList.remove('dragging');
    draggedStepIndex = null;
  }
  
  // --- Global Actions ---
  macroNameInput.addEventListener('input', (e) => {
    currentMacro.name = e.target.value;
  });

  addStepBtn.addEventListener('click', () => {
    currentMacro.steps.push({ action: 'click', target: '', value: '' });
    renderEditor();
  });

  async function trySaveMacro() {
    if (!currentMacro) return;
    currentMacro.name = macroNameInput.value || 'Untitled Macro';
    
    const selectedShortcut = shortcutSelectEl.value;
    
    // Remove this shortcut from all other macros to prevent conflicts
    if (selectedShortcut) {
      macros.forEach(m => {
        if (m.id !== currentMacro.id && m.triggers) {
          m.triggers = m.triggers.filter(t => t !== selectedShortcut);
        }
      });
      currentMacro.triggers = [selectedShortcut];
    } else {
      currentMacro.triggers = [];
    }
    
    // Update local references
    const index = macros.findIndex(m => m.id === currentMacro.id);
    if (index > -1) {
      macros[index] = currentMacro;
    }
    
    await chrome.storage.local.set({ macros });
    renderSidebar();
    
    saveBtn.textContent = 'Saved!';
    setTimeout(() => saveBtn.textContent = 'Save', 2000);
  }
  saveBtn.addEventListener('click', async () => {
    await trySaveMacro();
    saveBtn.classList.add('btn-success');
    setTimeout(() => {
      saveBtn.classList.remove('btn-success');
    }, 2000);
  });

  deleteMacroBtn.addEventListener('click', async () => {
    if (!currentMacro) return;
    
    const confirmed = confirm(`Are you sure you want to delete "${currentMacro.name}"?`);
    if (!confirmed) return;

    // Remove from array
    macros = macros.filter(m => m.id !== currentMacro.id);
    
    // Update storage
    await chrome.storage.local.set({ macros });
    
    // Reset state
    currentMacro = null;
    macroNameInput.value = '';
    macroNameInput.disabled = true;
    stepCounterBadge.classList.add('hidden');
    saveBtn.disabled = true;
    exportBtn.disabled = true;
    deleteMacroBtn.disabled = true;
    addStepBtn.disabled = true;
    
    stepsContainer.innerHTML = `
      <div class="empty-editor">
        <div class="empty-icon">⌨️</div>
        <p>Select a macro from the sidebar to view its steps.</p>
      </div>
    `;
    
    renderSidebar();
  });

  generateBtn.addEventListener('click', async () => {
    const query = aiPrompt.value.trim();
    if (!query) return;

    try {
      generateBtn.disabled = true;
      aiStatus.classList.remove('hidden');
      aiStatus.textContent = 'Processing with Gemini...';
      
      const generatedSteps = await generateMacroFromQuery(query);
      
      const newMacro = {
        id: Date.now().toString(),
        name: `AI: ${query.substring(0, 20)}...`,
        steps: generatedSteps,
        createdAt: Date.now(),
        triggers: []
      };
      
      macros.push(newMacro);
      await chrome.storage.local.set({ macros });
      
      aiPrompt.value = '';
      aiStatus.textContent = 'Done!';
      setTimeout(() => aiStatus.classList.add('hidden'), 2000);
      
      loadMacros(); // Refresh list
      selectMacro(newMacro.id); // Select & View in Editor
      
    } catch (err) {
      console.error(err);
      aiStatus.textContent = 'Error: ' + err.message;
      aiStatus.classList.add('warning-text');
    } finally {
      generateBtn.disabled = false;
    }
  });

  exportBtn.addEventListener('click', async () => {
    if (!currentMacro) return;
    try {
      exportBtn.disabled = true;
      const origText = exportBtn.innerHTML;
      exportBtn.textContent = 'Generating...';
      
      await exportMacroToExtension(currentMacro);
      
      exportBtn.textContent = 'Exported!';
      exportBtn.classList.add('btn-success');
      setTimeout(() => {
        exportBtn.innerHTML = origText;
        exportBtn.classList.remove('btn-success');
      }, 2000);
    } catch (err) {
      console.error(err);
      alert('Failed to export: ' + err.message);
    } finally {
      exportBtn.disabled = false;
    }
  });

  function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
});
