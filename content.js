// content.js — Content Script
// Caches the last known selection so it survives the popup opening (which deselects text).

let lastSelection = "";
let lastUrl = window.location.href;

// Cache selection whenever user selects text
document.addEventListener("mouseup", () => {
  const selected = window.getSelection()?.toString().trim();
  if (selected) {
    lastSelection = selected;
    lastUrl = window.location.href;
  }
});

document.addEventListener("keyup", () => {
  const selected = window.getSelection()?.toString().trim();
  if (selected) {
    lastSelection = selected;
    lastUrl = window.location.href;
  }
});

// Respond to popup asking for the selection
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "GET_SELECTION") {
    // Try live selection first, fall back to cached
    const live = window.getSelection()?.toString().trim();
    sendResponse({
      text: live || lastSelection,
      url: lastUrl,
    });
  }
});