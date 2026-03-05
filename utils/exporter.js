// exporter.js

export async function exportMacroToExtension(macro) {
  if (!macro || !macro.steps || macro.steps.length === 0) {
    alert("Cannot export an empty macro.");
    return;
  }

  // Ensure JSZip is loaded globally in the dashboard
  if (typeof JSZip === 'undefined') {
    alert("JSZip library not loaded.");
    return;
  }

  const zip = new JSZip();

  // 1. manifest.json
  const manifest = {
    manifest_version: 3,
    name: macro.name || "My Macro",
    version: "1.0.0",
    description: "Exported from MacroFlow",
    permissions: ["activeTab", "scripting"],
    host_permissions: ["<all_urls>"],
    action: {
      default_title: "Run Macro"
    },
    background: {
      service_worker: "background.js"
    }
  };
  zip.file("manifest.json", JSON.stringify(manifest, null, 2));

  // 2. background.js
  const backgroundJs = `
const MACRO_STEPS = ${JSON.stringify(macro.steps, null, 2)};

chrome.action.onClicked.addListener((tab) => {
  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ['player.js']
  }, () => {
    if (chrome.runtime.lastError) {
      console.error(chrome.runtime.lastError.message);
      return;
    }
    // Send steps to the injected player
    chrome.tabs.sendMessage(tab.id, { action: 'PLAY_MACRO', steps: MACRO_STEPS });
  });
});
  `;
  zip.file("background.js", backgroundJs.trim());

  // 3. player.js (fetch from our own extension)
  try {
    const playerRes = await fetch(chrome.runtime.getURL('content/player.js'));
    const playerJs = await playerRes.text();
    zip.file("player.js", playerJs);
  } catch(e) {
    console.error("Failed to fetch player.js", e);
    alert("Failed to bundle playback engine.");
    return;
  }

  // Trigger download
  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement("a");
  a.href = url;
  
  const safeName = (macro.name || "macro").replace(/[^a-z0-9]/gi, '_').toLowerCase();
  a.download = `${safeName}_extension.zip`;
  a.click();
  
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
