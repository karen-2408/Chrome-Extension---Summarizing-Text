// popup.js — Popup UI Logic

const docIdInput = document.getElementById("docIdInput");
const saveDocBtn = document.getElementById("saveDocBtn");
const preview = document.getElementById("preview");
const mainBtn = document.getElementById("mainBtn");
const statusEl = document.getElementById("status");

let currentText = "";
let currentUrl = "";

// ─── On Load ──────────────────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", async () => {
  // Load saved Doc ID
  chrome.runtime.sendMessage({ type: "GET_DOC_ID" }, ({ docId }) => {
    if (docId) docIdInput.value = docId;
  });

  // Ask the active tab's content script for the current selection
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  chrome.tabs.sendMessage(tab.id, { type: "GET_SELECTION" }, (response) => {
    if (chrome.runtime.lastError || !response) {
      setPreview("", "Could not read selection from this page.");
      return;
    }
    currentText = response.text || "";
    currentUrl = response.url || tab.url || "";
    setPreview(currentText);
  });
});

// ─── Save Doc ID ──────────────────────────────────────────────────────────────

saveDocBtn.addEventListener("click", () => {
  const id = docIdInput.value.trim();
  if (!id) return setStatus("Please enter a valid Doc ID.", "error");
  chrome.runtime.sendMessage({ type: "SET_DOC_ID", docId: id }, () => {
    setStatus("Doc ID saved!", "success");
  });
});

// ─── Save Highlight ───────────────────────────────────────────────────────────

mainBtn.addEventListener("click", () => {
  if (!currentText) return;
  mainBtn.disabled = true;
  setStatus("Saving…", "");

  chrome.runtime.sendMessage(
    { type: "SAVE_HIGHLIGHT", text: currentText, url: currentUrl },
    (response) => {
      mainBtn.disabled = false;
      if (response?.success) {
        setStatus("✅ Saved to your Google Doc!", "success");
      } else {
        setStatus(`❌ ${response?.error || "Unknown error"}`, "error");
      }
    }
  );
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function setPreview(text, fallback = "") {
  if (text) {
    preview.textContent = `"${text}"`;
    preview.classList.remove("empty");
    mainBtn.disabled = false;
  } else {
    preview.textContent = fallback || "No text selected on this page.";
    preview.classList.add("empty");
    mainBtn.disabled = true;
  }
}

function setStatus(msg, type = "") {
  statusEl.textContent = msg;
  statusEl.className = type;
}