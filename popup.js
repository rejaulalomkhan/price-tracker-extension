/**
 * Ultimate POS Price Tracker — Popup UI
 */

const API_BASE = 'https://panel.armanazij.me/api';

function $(id) { return document.getElementById(id); }

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

    // Broadcast clearCache to all open POS tabs
    chrome.runtime.sendMessage({ action: 'clearCache' }, function () {
      // tabs may not have content script — ignore errors
    });
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

document.addEventListener('DOMContentLoaded', loadStatus);
