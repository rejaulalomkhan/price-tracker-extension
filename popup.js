/**
 * Ultimate POS Price Tracker - Popup UI
 */

const API_URL = 'https://panel.armanazij.me/api';

async function loadStatus() {
  const statusEl = document.getElementById('status');
  const productCountEl = document.getElementById('productCount');
  const syncBtn = document.getElementById('syncBtn');

  statusEl.className = 'status loading';
  statusEl.textContent = 'Connecting to Price Tracker...';
  syncBtn.disabled = true;

  try {
    const res = await fetch(`${API_URL}/products`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const products = await res.json();

    productCountEl.textContent = products.length;
    statusEl.className = 'status connected';
    statusEl.textContent = `✅ Connected — ${products.length} products tracked`;
    syncBtn.disabled = false;
  } catch (err) {
    statusEl.className = 'status error';
    statusEl.textContent = `❌ Connection failed: ${err.message}`;
    productCountEl.textContent = '0';
  }

  // Show "check POS page" status
  document.getElementById('matchCount').textContent = '—';
}

async function syncPrices() {
  const syncBtn = document.getElementById('syncBtn');
  const statusEl = document.getElementById('status');

  syncBtn.disabled = true;
  syncBtn.textContent = '⏳ Syncing...';

  try {
    const res = await fetch(`${API_URL}/sync-prices`, { method: 'POST' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    // Clear cache by messaging the content script
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'clearCache' }, () => {
          // Content script may not be loaded on this tab — that's OK
        });
      }
    });

    statusEl.className = 'status connected';
    statusEl.textContent = '✅ Sync triggered! Refresh POS page to see new prices.';
    syncBtn.textContent = '✅ Sync Complete';
  } catch (err) {
    statusEl.className = 'status error';
    statusEl.textContent = `❌ Sync failed: ${err.message}`;
    syncBtn.textContent = '🔄 Retry Sync';
  }

  setTimeout(() => {
    syncBtn.disabled = false;
    syncBtn.textContent = '🔄 Sync Prices Now';
    loadStatus();
  }, 3000);
}

function clearCache() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) {
      chrome.tabs.sendMessage(tabs[0].id, { action: 'clearCache' }, () => {
        document.getElementById('matchCount').textContent = 'Cleared';
        alert('Cache clear signal sent! Refresh the POS page to re-fetch prices.');
      });
    }
  });
}

// Init
document.addEventListener('DOMContentLoaded', loadStatus);
