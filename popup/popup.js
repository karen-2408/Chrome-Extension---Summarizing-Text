// popup.js — Popup UI Logic (with tab support)

const docIdInput     = document.getElementById("docIdInput");
const saveDocBtn     = document.getElementById("saveDocBtn");
const tabSelect      = document.getElementById("tabSelect");
const refreshTabsBtn = document.getElementById("refreshTabsBtn");
const newTabInput    = document.getElementById("newTabInput");
const createTabBtn   = document.getElementById("createTabBtn");
const preview        = document.getElementById("preview");
const mainBtn        = document.getElementById("mainBtn");
const statusEl       = document.getElementById("status");

let currentText = "";
let currentUrl  = "";

// ─── On Load ──────────────────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", async () => {
  // Load saved Doc ID
  chrome.runtime.sendMessage({ type: "GET_DOC_ID" }, ({ docId }) => {
    if (docId) {
      docIdInput.value = docId;
      loadTabs();
    } else {
      tabSelect.innerHTML = '<option value="">— Save a Doc ID first —</option>';
    }
  });

  // Get current selection from active tab
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  chrome.tabs.sendMessage(tab.id, { type: "GET_SELECTION" }, (response) => {
    if (chrome.runtime.lastError || !response) {
      setPreview("", "Could not read selection from this page.");
      return;
    }
    currentText = response.text || "";
    currentUrl  = response.url || tab.url || "";
    setPreview(currentText);
  });
});

// ─── Save Doc ID ──────────────────────────────────────────────────────────────

saveDocBtn.addEventListener("click", () => {
  const id = docIdInput.value.trim();
  if (!id) return setStatus("Please enter a valid Doc ID.", "error");
  chrome.runtime.sendMessage({ type: "SET_DOC_ID", docId: id }, () => {
    setStatus("Doc ID saved!", "success");
    loadTabs();
  });
});

// ─── Load Tabs into Dropdown ──────────────────────────────────────────────────

function loadTabs() {
  tabSelect.innerHTML = '<option value="">— Loading… —</option>';
  chrome.runtime.sendMessage({ type: "GET_TABS" }, (response) => {
    if (!response?.success) {
      tabSelect.innerHTML = '<option value="">— Failed to load tabs —</option>';
      setStatus(`❌ ${response?.error || "Could not fetch tabs"}`, "error");
      return;
    }

    const tabs = response.tabs;
    if (!tabs.length) {
      tabSelect.innerHTML = '<option value="">— No tabs found —</option>';
      return;
    }

    tabSelect.innerHTML = tabs
      .map((t) => `<option value="${t.id}">${t.title}</option>`)
      .join("");
  });
}

refreshTabsBtn.addEventListener("click", loadTabs);

// ─── Create New Tab ───────────────────────────────────────────────────────────

createTabBtn.addEventListener("click", () => {
  const name = newTabInput.value.trim();
  if (!name) return setStatus("Enter a tab name first.", "error");

  createTabBtn.disabled = true;
  setStatus("Creating tab…", "");

  chrome.runtime.sendMessage({ type: "CREATE_TAB", tabName: name }, (response) => {
    createTabBtn.disabled = false;
    if (!response?.success) {
      setStatus(`❌ ${response?.error || "Failed to create tab"}`, "error");
      return;
    }

    // Add new tab to dropdown and select it
    const opt = document.createElement("option");
    opt.value = response.tab.id;
    opt.textContent = response.tab.title;
    tabSelect.appendChild(opt);
    tabSelect.value = response.tab.id;

    newTabInput.value = "";
    setStatus(`✅ Tab "${response.tab.title}" created!`, "success");
  });
});

// ─── Save Highlight ───────────────────────────────────────────────────────────

mainBtn.addEventListener("click", () => {
  if (!currentText) return;

  const tabId = tabSelect.value || null;

  mainBtn.disabled = true;
  setStatus("Saving…", "");

  chrome.runtime.sendMessage(
    { type: "SAVE_HIGHLIGHT", text: currentText, url: currentUrl, tabId },
    (response) => {
      mainBtn.disabled = false;
      if (response?.success) {
        const tabName = tabSelect.options[tabSelect.selectedIndex]?.text || "doc";
        setStatus(`✅ Saved to "${tabName}"!`, "success");
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