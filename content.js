/**
 * Ultimate POS Price Tracker - Content Script
 * Watches #pos_table for product rows and injects competitor price badges.
 */

(function () {
  'use strict';

  const CONFIG = {
    apiUrl: 'https://panel.armanazij.me/api',
    matchEndpoint: '/api/match-products',
    productsEndpoint: '/api/products',
    minConfidence: 0.65,
    cacheKey: 'pt_product_matches',
    cacheTtlMs: 30 * 60 * 1000, // 30 minutes
  };

  // Store fetched competitor data
  let competitorProducts = null;
  let lastFetch = 0;

  // ---- Utility: Normalize product name for matching ----
  function normalizeName(name) {
    return name
      .toLowerCase()
      .replace(/\b(wired|wireless|usb|bluetooth|black|white|red|for|with|and|the)\b/g, '')
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // ---- Utility: Similarity score (0-1) — token containment based ----
  function similarity(a, b) {
    const na = normalizeName(a);
    const nb = normalizeName(b);
    if (!na || !nb) return 0;
    if (na === nb) return 1.0;

    // Extract meaningful tokens (skip very short ones)
    const tokensA = na.split(' ').filter(t => t.length > 2);
    const tokensB = nb.split(' ').filter(t => t.length > 2);
    const common = tokensA.filter(t => tokensB.includes(t));

    // Key metric: what % of the SHORTER name's tokens are in the longer one
    const shorterCount = Math.min(tokensA.length, tokensB.length);
    if (shorterCount > 0) {
      const containment = common.length / shorterCount;
      if (containment >= 0.6) {
        return 0.5 + (containment * 0.5); // 0.6→0.8, 1.0→1.0
      }
    }

    // Fallback: simple word overlap
    return common.length / Math.max(tokensA.length, tokensB.length, 1);
  }

  // ---- Fetch competitor products from API ----
  async function fetchCompetitorProducts() {
    // Check cache first
    try {
      const cached = localStorage.getItem(CONFIG.cacheKey);
      if (cached) {
        const { data, timestamp } = JSON.parse(cached);
        if (Date.now() - timestamp < CONFIG.cacheTtlMs) {
          competitorProducts = data;
          lastFetch = timestamp;
          console.log('[PT] Loaded from cache, count:', data.length);
          return data;
        }
      }
    } catch (e) {
      console.warn('[PT] Cache read error:', e);
    }

    try {
      const res = await fetch(CONFIG.apiUrl + CONFIG.productsEndpoint, {
        method: 'GET',
        headers: { 'Accept': 'application/json' }
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      // Cache it
      localStorage.setItem(CONFIG.cacheKey, JSON.stringify({
        data,
        timestamp: Date.now()
      }));

      competitorProducts = data;
      lastFetch = Date.now();
      console.log('[PT] Fetched from API, count:', data.length);
      return data;
    } catch (err) {
      console.error('[PT] Failed to fetch products:', err);
      return null;
    }
  }

  // ---- Match a single POS product name against competitor data ----
  function findBestMatch(productName) {
    if (!competitorProducts || !competitorProducts.length) return null;

    let bestMatch = null;
    let bestScore = 0;

    for (const competitor of competitorProducts) {
      // competitor.name is the tracked product name
      const score = similarity(productName, competitor.name);
      if (score > bestScore) {
        bestScore = score;
        bestMatch = competitor;
      }
    }

    if (bestScore >= CONFIG.minConfidence) {
      return { product: bestMatch, confidence: bestScore };
    }
    return null;
  }

  // ---- Extract product name from a POS table row ----
  function extractProductName(row) {
    const span = row.querySelector('td .text-link');
    if (!span) return null;
    // The span contains text with <br> and a number after it
    // e.g. "A4TECH HS-19 Headphone<br>1145"
    const fullText = span.textContent || span.innerText;
    // Split by lines, first line is the product name
    const lines = fullText.trim().split('\n');
    let name = lines[0].trim();
    // Remove trailing SKU/number patterns like " - 0187 A4TECH"
    name = name.replace(/\s*[-–]\s*\d+\s*[A-Za-z]*$/, '').trim();
    return name || null;
  }

  // ---- Build price badges HTML ----
  function buildBadges(match) {
    const { product, confidence } = match;
    const container = document.createElement('div');
    container.className = 'pt-price-badges';

    // Confidence indicator
    const confBadge = document.createElement('span');
    confBadge.className = 'pt-confidence';
    confBadge.title = `Match confidence: ${Math.round(confidence * 100)}%`;
    if (confidence >= 0.85) {
      confBadge.textContent = '✓';
    } else if (confidence >= 0.7) {
      confBadge.textContent = '~';
    } else {
      confBadge.textContent = '?';
    }
    container.appendChild(confBadge);

    // Store competitor prices (from the product object)
    const prices = product.prices || [];
    if (!prices.length) {
      const noData = document.createElement('span');
      noData.className = 'pt-badge pt-no-data';
      noData.textContent = 'No prices tracked';
      container.appendChild(noData);
      return container;
    }

    for (const p of prices) {
      const badge = document.createElement('span');
      badge.className = `pt-badge pt-store-${(p.store || '').toLowerCase().replace(/\s+/g, '')}`;

      const storeName = document.createElement('span');
      storeName.className = 'pt-store-name';
      storeName.textContent = p.store || 'Unknown';

      const priceValue = document.createElement('span');
      priceValue.className = 'pt-price-value';
      priceValue.textContent = `৳${p.price}`;

      badge.appendChild(storeName);
      badge.appendChild(priceValue);

      // Tooltip with last updated info
      if (p.updated_at) {
        badge.title = `Updated: ${new Date(p.updated_at).toLocaleDateString()}`;
      }

      container.appendChild(badge);
    }

    return container;
  }

  // ---- Inject badges into a product row ----
  function injectBadges(row) {
    // Skip if already processed
    if (row.dataset.ptProcessed === '1') return;

    const productName = extractProductName(row);
    if (!productName) return;

    const match = findBestMatch(productName);

    // Create a container for badges
    const badgeWrapper = document.createElement('div');
    badgeWrapper.className = 'pt-badge-wrapper';

    if (match) {
      badgeWrapper.appendChild(buildBadges(match));
      row.dataset.ptMatched = '1';
      console.log(`[PT] Matched "${productName}" → ${match.product.name} (${Math.round(match.confidence * 100)}%)`);
    } else {
      const noMatch = document.createElement('span');
      noMatch.className = 'pt-no-match';
      noMatch.textContent = 'No match found';
      noMatch.title = productName;
      badgeWrapper.appendChild(noMatch);
      row.dataset.ptMatched = '0';
    }

    // Insert after the product name div
    const nameDiv = row.querySelector('td > div[title]');
    if (nameDiv) {
      nameDiv.parentNode.insertBefore(badgeWrapper, nameDiv.nextSibling);
    } else {
      const firstTd = row.querySelector('td');
      if (firstTd) {
        firstTd.appendChild(badgeWrapper);
      }
    }

    row.dataset.ptProcessed = '1';
  }

  // ---- Process all existing rows ----
  function processExistingRows() {
    const rows = document.querySelectorAll('#pos_table tbody tr.product_row');
    rows.forEach(row => injectBadges(row));
    console.log(`[PT] Processed ${rows.length} existing rows`);
  }

  // ---- Observe DOM for new rows ----
  function setupObserver() {
    const table = document.getElementById('pos_table');
    if (!table) {
      console.warn('[PT] #pos_table not found, retrying in 2s...');
      setTimeout(setupObserver, 2000);
      return;
    }

    const tbody = table.querySelector('tbody') || table;

    const observer = new MutationObserver((mutations) => {
      let hasNewRows = false;
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            if (node.matches && node.matches('tr.product_row')) {
              injectBadges(node);
              hasNewRows = true;
            }
            // Check children for product rows
            if (node.querySelectorAll) {
              const childRows = node.querySelectorAll('tr.product_row');
              childRows.forEach(row => {
                injectBadges(row);
                hasNewRows = true;
              });
            }
          }
        }
      }
      if (hasNewRows) {
        console.log('[PT] New product row(s) detected');
      }
    });

    observer.observe(tbody, { childList: true, subtree: true });
    console.log('[PT] MutationObserver attached to #pos_table');
  }

  // ---- Initialize ----
  async function init() {
    console.log('[PT] Price Tracker extension initializing...');

    // Fetch competitor products first
    const data = await fetchCompetitorProducts();
    if (!data) {
      console.warn('[PT] No competitor data available — badges will not appear.');
      return;
    }

    // Process existing rows
    processExistingRows();

    // Set up observer for dynamic rows
    setupObserver();

    console.log('[PT] Initialization complete');
  }

  // Start when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Also retry in case POS loads via AJAX later
  setTimeout(() => {
    if (!competitorProducts) init();
    else processExistingRows();
  }, 5000);

})();
