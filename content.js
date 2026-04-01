// content.js — Content Script
// Runs on every page. Listens for text selection and responds to popup requests.

// Listen for a message from the popup asking for the current selection
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "GET_SELECTION") {
    const selected = window.getSelection()?.toString().trim() || "";
    sendResponse({ text: selected, url: window.location.href });
  }
});