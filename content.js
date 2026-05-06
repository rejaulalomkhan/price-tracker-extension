/**
 * Ultimate POS Price Tracker — Content Script
 *
 * Watches #pos_table on bclitstock.com for product rows,
 * fuzzy-matches names against tracked products from panel.armanazij.me,
 * and injects colour-coded price badges into each row.
 *
 * Always injects a visible indicator per row (matched or unmatched)
 * so you can see it's working.
 */
(function () {
  'use strict';

  const API_BASE    = 'https://panel.armanazij.me/api';
  const PRODUCTS_EP = '/api/products';
  const CACHE_KEY   = 'pt_product_data';
  const CACHE_TTL   = 30 * 60 * 1000;       // 30 min
  const MIN_CONF    = 0.6;

  /* ── State ─────────────────────────────────────────────────── */
  let tracked  = null;                       // raw API array
  let priceMap = new Map();                  // norm_name → [{…}]
  let status   = 'init';                     // init|loading|ready|error

  /* ── Helpers ───────────────────────────────────────────────── */
  function norm(s) {
    return s.toLowerCase()
      .replace(/\b(wired|wireless|usb|bluetooth|black|white|red|for|with|and|the)\b/g, '')
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ').trim();
  }

  function similarity(a, b) {
    const na = norm(a), nb = norm(b);
    if (!na || !nb) return 0;
    if (na === nb) return 1;
    const ta = na.split(' ').filter(t => t.length > 2);
    const tb = nb.split(' ').filter(t => t.length > 2);
    const common = ta.filter(t => tb.includes(t));
    const shorter = Math.min(ta.length, tb.length);
    if (shorter > 0) {
      const c = common.length / shorter;
      if (c >= 0.6) return 0.5 + c * 0.5;
    }
    return common.length / Math.max(ta.length, tb.length, 1);
  }

  /* ── Fetch & cache ─────────────────────────────────────────── */
  async function fetchProducts() {
    status = 'loading';
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (raw) {
        const { data, ts } = JSON.parse(raw);
        if (Date.now() - ts < CACHE_TTL) { buildMap(data); status = 'ready'; return data; }
      }
    } catch (_) { /* ignore */ }

    try {
      const res = await fetch(API_BASE + PRODUCTS_EP);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      localStorage.setItem(CACHE_KEY, JSON.stringify({ data, ts: Date.now() }));
      buildMap(data);
      status = 'ready';
      console.log('[PT] fetched', data.length, 'products');
      return data;
    } catch (err) {
      status = 'error';
      console.error('[PT] fetch failed:', err);
      return null;
    }
  }

  function buildMap(products) {
    tracked = products;
    priceMap.clear();
    for (const p of products) {
      const key = norm(p.name);
      if (!priceMap.has(key)) priceMap.set(key, []);
      priceMap.get(key).push({
        id: p.id, name: p.name,
        source: (p.source || '').toLowerCase(),
        price: p.current_price,
        currency: p.currency,
        url: p.url,
        updated_at: p.updated_at
      });
    }
  }

  /* ── Matching ──────────────────────────────────────────────── */
  function findMatches(posName) {
    if (!tracked) return [];
    const key = norm(posName);
    if (priceMap.has(key)) return priceMap.get(key);
    let best = 0, entries = [];
    for (const [k, v] of priceMap) {
      const s = similarity(posName, k);
      if (s > best) { best = s; entries = v; }
      else if (s === best && s > 0) entries.push(...v);
    }
    return best >= MIN_CONF ? entries : [];
  }

  /* ── Extract name from POS row ─────────────────────────────── */
  function extractName(row) {
    const sel = 'td .text-link, td a.text-link, td span.text-link, td .product-name, td a.product-name';
    const el = row.querySelector(sel);
    if (el) {
      const t = (el.textContent || el.innerText || '').trim();
      const first = t.split(/\n/)[0].trim();
      return first.replace(/\s*[-–]\s*\d+\s*[A-Za-z]*$/, '').trim() || null;
    }
    const td = row.querySelector('td');
    if (td) {
      const t = (td.textContent || '').trim().split(/\n/)[0].trim();
      if (t.length > 3) return t;
    }
    return null;
  }

  /* ── Debug panel (floating, top-right corner) ──────────────── */
  let debugPanel = null;
  function createDebugPanel() {
    debugPanel = document.createElement('div');
    debugPanel.id = 'pt-debug';
    debugPanel.style.cssText = 'position:fixed;top:10px;right:10px;z-index:999999;background:#1a1a2e;color:#e0e0e0;padding:10px 14px;border-radius:8px;font:12px/1.6 monospace;border:1px solid #333;max-height:300px;overflow-y:auto;min-width:220px;box-shadow:0 4px 20px rgba(0,0,0,0.5);';
    document.body.appendChild(debugPanel);
  }
  function debug(msg) {
    if (!debugPanel) return;
    const line = document.createElement('div');
    line.textContent = msg;
    debugPanel.appendChild(line);
  }

  /* ── Build badge DOM ───────────────────────────────────────── */
  function buildBadge(matches, confidence) {
    const wrapper = document.createElement('div');
    wrapper.className = 'pt-wrapper';

    if (matches.length) {
      // Confidence indicator
      const dot = document.createElement('span');
      dot.className = 'pt-confidence';
      const pct = Math.round(confidence * 100);
      dot.textContent = pct >= 85 ? '✓' : pct >= 70 ? '~' : '?';
      dot.title = 'Match: ' + pct + '%';
      wrapper.appendChild(dot);

      for (const m of matches) {
        const a = document.createElement('a');
        a.className = 'pt-badge pt-store-' + m.source;
        a.href = m.url || '#';
        a.target = '_blank';
        a.rel = 'noopener noreferrer';

        const storeEl = document.createElement('span');
        storeEl.className = 'pt-store';
        storeEl.textContent = m.source.charAt(0).toUpperCase() + m.source.slice(1);

        const priceEl = document.createElement('span');
        priceEl.className = 'pt-price';
        priceEl.textContent = (m.currency === 'BDT' ? '৳' : '') + Number(m.price).toLocaleString();

        a.appendChild(storeEl);
        a.appendChild(priceEl);
        if (m.updated_at) {
          a.title = m.source + ' — Updated ' + new Date(m.updated_at).toLocaleDateString();
        }
        wrapper.appendChild(a);
      }
    } else {
      // No match indicator — always visible so you know it's working
      const noMatch = document.createElement('span');
      noMatch.className = 'pt-no-match';
      noMatch.textContent = '— no price match';
      wrapper.appendChild(noMatch);
    }
    return wrapper;
  }

  /* ── Inject into row ───────────────────────────────────────── */
  function injectRow(row) {
    if (row.dataset.ptDone) return;
    const name = extractName(row);
    if (!name) { row.dataset.ptDone = '1'; return; }

    const matches = findMatches(name);
    const conf = matches.length ? Math.max(similarity(name, matches[0].name), MIN_CONF) : 0;
    const badge = buildBadge(matches, conf);

    // Insert after product name element
    const target = row.querySelector('td > div[title]')
                || row.querySelector('td .product-name')
                || row.querySelector('td .text-link')
                || row.querySelector('td');
    if (target) {
      target.insertAdjacentElement('afterend', badge);
    } else {
      const first = row.querySelector('td');
      if (first) first.appendChild(badge);
    }
    row.dataset.ptDone = '1';

    if (matches.length) {
      console.log('[PT]', name, '→', matches.length, 'price(s)');
    }
    if (debugPanel) {
      debug(matches.length
        ? '✓ ' + name.substring(0, 40)
        : '✗ ' + name.substring(0, 40) + ' (no match)');
    }
  }

  /* ── Process all existing rows ─────────────────────────────── */
  function processAll() {
    const rows = document.querySelectorAll('#pos_table tbody tr.product_row, #pos_table tbody tr');
    let n = 0;
    rows.forEach(r => { if (!r.dataset.ptDone) { injectRow(r); n++; } });
    if (debugPanel) debug('Processed ' + n + ' rows (total tracked: ' + (tracked ? tracked.length : 0) + ')');
    if (n) console.log('[PT] processed', n, 'rows');
  }

  /* ── MutationObserver for dynamic rows ─────────────────────── */
  function observe() {
    const table = document.getElementById('pos_table');
    if (!table) { setTimeout(observe, 2000); return; }
    const target = table.querySelector('tbody') || table;
    new MutationObserver(mutations => {
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          if (node.nodeType !== 1) continue;
          if (node.matches && node.matches('tr')) injectRow(node);
          if (node.querySelectorAll) node.querySelectorAll('tr').forEach(injectRow);
        }
      }
    }).observe(target, { childList: true, subtree: true });
    if (debugPanel) debug('Observer active on #pos_table');
  }

  /* ── Popup message listener ────────────────────────────────── */
  if (typeof chrome !== 'undefined' && chrome.runtime) {
    chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
      if (msg.action === 'clearCache') {
        localStorage.removeItem(CACHE_KEY);
        tracked = null;
        priceMap.clear();
        document.querySelectorAll('[data-pt-done]').forEach(r => {
          delete r.dataset.ptDone;
          r.querySelectorAll('.pt-wrapper').forEach(w => w.remove());
        });
        init();
        reply({ ok: true });
      }
    });
  }

  /* ── Init ──────────────────────────────────────────────────── */
  async function init() {
    createDebugPanel();
    debug('Price Tracker loading…');

    const data = await fetchProducts();
    if (!data) {
      debug('ERROR: Could not fetch products');
      console.warn('[PT] no data');
      return;
    }
    debug('Loaded ' + data.length + ' tracked products');
    processAll();
    observe();
    debug('Ready ✓');
    console.log('[PT] ready');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  // Retry once after 5 s (POS may load table via AJAX)
  setTimeout(() => {
    if (!tracked) { debug('Retrying…'); init(); } else processAll();
  }, 5000);

})();
