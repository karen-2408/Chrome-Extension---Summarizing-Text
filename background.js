// background.js — Service Worker
// Handles: OAuth token retrieval, context menu, Google Docs API calls

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
    saveHighlight(info.selectionText.trim(), tab.url);
  }
});

// ─── Message Listener (from popup) ───────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "SAVE_HIGHLIGHT") {
    saveHighlight(message.text, message.url)
      .then(() => sendResponse({ success: true }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true; // keep channel open for async response
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
});

// ─── Core: Save Highlight to Google Doc ──────────────────────────────────────

async function saveHighlight(text, sourceUrl) {
  const token = await getAuthToken();
  const docId = await getStoredDocId();

  if (!docId) {
    throw new Error("No Google Doc ID set. Please configure one in the popup.");
  }

  const timestamp = new Date().toLocaleString();
  const snippet = buildSnippet(text, sourceUrl, timestamp);

  await appendToDoc(token, docId, snippet);
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

// ─── Google Docs API: Append text ────────────────────────────────────────────

async function appendToDoc(token, docId, text) {
  // 1. Get current doc end index
  const docRes = await fetch(`${GOOGLE_DOCS_API}/${docId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!docRes.ok) {
    const err = await docRes.json();
    throw new Error(`Failed to fetch doc: ${err.error?.message}`);
  }

  const doc = await docRes.json();
  const endIndex = doc.body.content.at(-1)?.endIndex ?? 1;

  // 2. Insert text at the end
  const batchRes = await fetch(`${GOOGLE_DOCS_API}/${docId}:batchUpdate`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      requests: [
        {
          insertText: {
            location: { index: endIndex - 1 },
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