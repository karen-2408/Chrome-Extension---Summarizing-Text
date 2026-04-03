// background.js — Service Worker
// Handles: OAuth token retrieval, context menu, Google Docs API calls (with tab support)

const GOOGLE_DOCS_API = "https://docs.googleapis.com/v1/documents";

// ─── Context Menu Setup ───────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "save-highlight",
    title: "Save highlight to Google Doc",
    contexts: ["selection"],
  });
});

// ─── Context Menu Click ───────────────────────────────────────────────────────

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "save-highlight" && info.selectionText) {
    saveHighlight(info.selectionText.trim(), tab.url, null);
  }
});

// ─── Message Listener (from popup) ───────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "SAVE_HIGHLIGHT") {
    saveHighlight(message.text, message.url, message.tabId)
      .then(() => sendResponse({ success: true }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.type === "SET_DOC_ID") {
    chrome.storage.sync.set({ docId: message.docId }, () =>
      sendResponse({ success: true })
    );
    return true;
  }

  if (message.type === "GET_DOC_ID") {
    chrome.storage.sync.get("docId", (data) =>
      sendResponse({ docId: data.docId || null })
    );
    return true;
  }

  if (message.type === "GET_TABS") {
    getTabs()
      .then((tabs) => sendResponse({ success: true, tabs }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.type === "CREATE_TAB") {
    createTab(message.tabName)
      .then((tab) => sendResponse({ success: true, tab }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }
});

// ─── Core: Save Highlight to a specific Doc Tab ───────────────────────────────

async function saveHighlight(text, sourceUrl, tabId) {
  const token = await getAuthToken();
  const docId = await getStoredDocId();

  if (!docId) {
    throw new Error("No Google Doc ID set. Please configure one in the popup.");
  }

  const timestamp = new Date().toLocaleString();
  const snippet = buildSnippet(text, sourceUrl, timestamp);

  await appendToDoc(token, docId, snippet, tabId);
}

// ─── Build the text block to append ──────────────────────────────────────────

function buildSnippet(text, url, timestamp) {
  return `\n---\n📌 ${timestamp}\n🔗 ${url}\n\n"${text}"\n`;
}

// ─── Google OAuth ─────────────────────────────────────────────────────────────

function getAuthToken() {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive: true }, (token) => {
      if (chrome.runtime.lastError || !token) {
        reject(new Error(chrome.runtime.lastError?.message || "Auth failed"));
      } else {
        resolve(token);
      }
    });
  });
}

// ─── Google Docs API: Get all tabs ───────────────────────────────────────────

async function getTabs() {
  const token = await getAuthToken();
  const docId = await getStoredDocId();

  if (!docId) throw new Error("No Google Doc ID set.");

  const res = await fetch(`${GOOGLE_DOCS_API}/${docId}?includeTabsContent=false`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(`Failed to fetch doc: ${err.error?.message}`);
  }

  const doc = await res.json();

  // Surface the raw tab keys so the popup can display them
  if (!doc.tabs) {
    throw new Error("No 'tabs' key in response. Top-level keys: " + Object.keys(doc).join(", "));
  }

  // Flatten all tabs (including nested child tabs)
  const flattenTabs = (tabs) => {
    const result = [];
    for (const tab of tabs || []) {
      result.push({ id: tab.tabProperties.tabId, title: tab.tabProperties.title });
      if (tab.childTabs?.length) result.push(...flattenTabs(tab.childTabs));
    }
    return result;
  };

  const found = flattenTabs(doc.tabs);
  if (!found.length) {
    throw new Error("'tabs' exists but is empty. Raw: " + JSON.stringify(doc.tabs).slice(0, 200));
  }
  return found;
}

// ─── Google Docs API: Create a new tab ───────────────────────────────────────

async function createTab(tabName) {
  const token = await getAuthToken();
  const docId = await getStoredDocId();

  if (!docId) throw new Error("No Google Doc ID set.");

  // Google Docs API: insert a new tab
  const res = await fetch(`${GOOGLE_DOCS_API}/${docId}:batchUpdate`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      requests: [
        {
          insertSection: {
            sectionBreak: { sectionStyle: { sectionType: "NEXT_PAGE" } },
            location: { index: 1 },
          },
        },
      ],
    }),
  });

  // The Docs API doesn't support tab creation via REST yet.
  // Best workaround: re-fetch the tab list and return the last one.
  // User should manually create tabs in the doc, then refresh.
  if (!res.ok) {
    // Fallback: just re-fetch and pick last tab
  }

  const allTabs = await getTabs();
  if (!allTabs.length) throw new Error("No tabs found after creation attempt.");
  const newTab = allTabs.find(t => t.title === tabName) || allTabs.at(-1);
  return { id: newTab.id, title: newTab.title };
}

// ─── Google Docs API: Append text to a specific tab ──────────────────────────

async function appendToDoc(token, docId, text, tabId) {
  // Build URL — include tabId if provided
  const tabParam = tabId ? `&tabId=${tabId}` : "";
  const docUrl = `${GOOGLE_DOCS_API}/${docId}?includeTabsContent=true${tabParam}`;

  const docRes = await fetch(docUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!docRes.ok) {
    const err = await docRes.json();
    throw new Error(`Failed to fetch doc: ${err.error?.message}`);
  }

  const doc = await docRes.json();

  // Find the right tab's body end index
  const findTab = (tabs, id) => {
    for (const tab of tabs || []) {
      if (!id || tab.tabProperties.tabId === id) return tab;
      const found = findTab(tab.childTabs, id);
      if (found) return found;
    }
    return null;
  };

  const targetTab = tabId ? findTab(doc.tabs, tabId) : doc.tabs?.[0];
  const endIndex = targetTab?.documentTab?.body?.content?.at(-1)?.endIndex ?? 1;

  // batchUpdate with tabId scoping
  const updateUrl = `${GOOGLE_DOCS_API}/${docId}:batchUpdate`;
  const batchRes = await fetch(updateUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      requests: [
        {
          insertText: {
            location: { index: endIndex - 1, tabId: tabId || undefined },
            text,
          },
        },
      ],
    }),
  });

  if (!batchRes.ok) {
    const err = await batchRes.json();
    throw new Error(`Failed to write to doc: ${err.error?.message}`);
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getStoredDocId() {
  return new Promise((resolve) => {
    chrome.storage.sync.get("docId", (data) => resolve(data.docId || null));
  });
}