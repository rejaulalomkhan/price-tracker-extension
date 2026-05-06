/**
 * Ultimate POS Price Tracker — Popup UI
 */

const API_BASE = 'https://panel.armanazij.me/api';
const POS_HOST = '*://bclitstock.com/*';

function $(id) { return document.getElementById(id); }

/** Send message to POS tabs, suppress "no receiver" warning */
function broadcastToPOS(msg) {
  chrome.tabs.query({ url: [POS_HOST] }, function (tabs) {
    tabs.forEach(function (tab) {
      chrome.tabs.sendMessage(tab.id, msg, function () {
        // silently swallow "could not establish connection"
        void chrome.runtime.lastError;
      });
    });
  });
}

async function loadStatus() {
  const el = $('status');
  const count = $('productCount');
  const btn = $('syncBtn');

  el.className = 'status loading';
  el.textContent = 'Connecting…';
  btn.disabled = true;

  try {
    const res = await fetch(API_BASE + '/api/products');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    count.textContent = data.length;
    el.className = 'status connected';
    el.textContent = 'Connected — ' + data.length + ' product' + (data.length !== 1 ? 's' : '') + ' tracked';
    btn.disabled = false;
  } catch (err) {
    el.className = 'status error';
    el.textContent = 'Connection failed: ' + err.message;
    count.textContent = '—';
  }
}

async function syncPrices() {
  const btn = $('syncBtn');
  const el = $('status');
  btn.disabled = true;
  btn.textContent = '⏳ Syncing…';
  el.className = 'status loading';
  el.textContent = 'Triggering price scrape…';

  try {
    const res = await fetch(API_BASE + '/api/sync-prices', { method: 'POST' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    el.className = 'status connected';
    el.textContent = 'Synced! Updated ' + data.updated + ', Errors ' + data.errors;
    btn.textContent = '✅ Done';

    // Broadcast clearCache to content scripts on all open POS tabs
    broadcastToPOS({ action: 'clearCache' });
  } catch (err) {
    el.className = 'status error';
    el.textContent = 'Sync failed: ' + err.message;
    btn.textContent = '🔄 Retry';
  }

  setTimeout(function () {
    btn.disabled = false;
    btn.textContent = '🔄 Sync Prices';
    loadStatus();
  }, 4000);
}

function clearCache() {
  broadcastToPOS({ action: 'clearCache' });
  alert('Cache clear signal sent! Refresh the POS page.');
}

// Wire up buttons (no inline onclick — CSP blocks it)
document.addEventListener('DOMContentLoaded', function () {
  $('syncBtn').addEventListener('click', syncPrices);
  $('clearCacheBtn').addEventListener('click', clearCache);
  loadStatus();
});
