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

  // Load match count from localStorage
  try {
    const cached = localStorage.getItem('pt_product_matches');
    if (cached) {
      const { timestamp } = JSON.parse(cached);
      const age = Math.round((Date.now() - timestamp) / 60000);
      document.getElementById('matchCount').textContent = age < 60 ? `${age}m ago` : 'Expired';
    }
  } catch (e) {}
}

async function syncPrices() {
  const syncBtn = document.getElementById('syncBtn');
  const statusEl = document.getElementById('status');

  syncBtn.disabled = true;
  syncBtn.textContent = '⏳ Syncing...';

  try {
    const res = await fetch(`${API_URL}/sync-prices`, { method: 'POST' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    // Clear cache so content script refetches
    localStorage.removeItem('pt_product_matches');

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
  localStorage.removeItem('pt_product_matches');
  document.getElementById('matchCount').textContent = 'Cleared';
  alert('Cache cleared! Refresh the POS page to re-fetch prices.');
}

// Init
document.addEventListener('DOMContentLoaded', loadStatus);
