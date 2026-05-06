// Price Tracker Extension v2.0 — Click-only, no auto-run

const API_BASE = "https://panel.armanazij.me/api";

const statusEl = document.getElementById("status");
const resultsEl = document.getElementById("results");
const countEl = document.getElementById("count");
const syncBtn = document.getElementById("syncBtn");

function setStatus(text, type, html) {
  if (html) {
    statusEl.innerHTML = html;
  } else {
    statusEl.textContent = text;
  }
  statusEl.className = "status " + type;
}

function norm(s) {
  return s
    .toLowerCase()
    .replace(/\b(wired|wireless|usb|bluetooth|black|white|red|for|with|and|the)\b/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function calcSimilarity(trackedName, posName) {
  const a = norm(trackedName).split(" ");
  const b = norm(posName).split(" ");
  const shorter = a.length < b.length ? a : b;
  const longer = a.length < b.length ? b : a;
  const common = shorter.filter((t) => longer.includes(t) && t.length > 2);
  if (shorter.length === 0) return { score: 0, matched: 0, total: 0 };
  const score = common.length / shorter.length;
  return { score, matched: common.length, total: shorter.length };
}

function matchClass(score) {
  if (score >= 0.85) return "high";
  if (score >= 0.70) return "medium";
  if (score >= 0.60) return "low";
  return "none";
}

function sourceClass(src) {
  const s = src.toLowerCase();
  if (s.includes("ryans")) return "ryans";
  if (s.includes("startech") || s.includes("star tech")) return "startech";
  if (s.includes("daraz")) return "daraz";
  return "other";
}

async function fetchPrices() {
  const res = await fetch(API_BASE + "/products", {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error("HTTP " + res.status);
  return res.json();
}

// Step 1: Extract products from POS table
async function extractPosProducts(tabId) {
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      const rows = document.querySelectorAll("#pos_table tbody tr, #pos_table tr.product_row, #pos_table tr[data-row_index]");
      const products = [];
      rows.forEach((row, i) => {
        // Try to find product name
        const nameEl =
          row.querySelector(".text-link.text-info") ||
          row.querySelector("td:nth-child(2) a") ||
          row.querySelector("a[href*='product']") ||
          row.querySelector("td:nth-child(2)");

        if (!nameEl) return;

        // Get text before <br> (product name without SKU)
        const rawText = nameEl.innerHTML || nameEl.textContent;
        const name = rawText.split("<br>")[0].replace(/<[^>]*>/g, "").trim();
        if (!name) return;

        // Get price
        const priceEl =
          row.querySelector(".hidden_base_unit_sell_price") ||
          row.querySelector('input[name*="price"]') ||
          row.querySelector('input[name*="rate"]');
        const price = priceEl ? parseFloat(priceEl.value || priceEl.textContent) : null;

        products.push({
          rowIndex: i,
          name,
          price,
          rowId: row.getAttribute("data-row_index") || ("row-" + i),
        });
      });
      return products;
    },
  });
  return results[0]?.result || [];
}

// Step 2: Inject badges into the page
async function injectBadges(tabId, results) {
  await chrome.scripting.executeScript({
    target: { tabId },
    func: (data) => {
      // Remove old badges (both old and new class)
      document.querySelectorAll(".pt-badge").forEach((el) => el.remove());

      data.forEach((item) => {
        const row = document.querySelector(
          `tr[data-row_index="${item.rowId}"], tr:nth-child(${item.rowIndex + 1})`
        );
        if (!row) return;

        // Find the price/name cell to attach badge
        // Inject after the product name link
        let nameEl = row.querySelector("a.text-link") || row.querySelector("a") || row.querySelector("td:first-child");
        let target = nameEl || row.querySelector("td") || row;
        if (!target) return;

        // Create badge container
        const badge = document.createElement("div");
        badge.className = "pt-badge";
        badge.style.cssText =
          "margin-top:6px;display:flex;flex-wrap:wrap;gap:4px;padding:4px 0;";
        badge.setAttribute('data-pt-badge', '1');

        if (!item.matches || item.matches.length === 0) {
          const noMatch = document.createElement("span");
          noMatch.style.cssText = "font-size:10px;color:#888;";
          noMatch.textContent = "— no price match";
          badge.appendChild(noMatch);
        } else {
          item.matches.forEach((m) => {
            const tag = document.createElement("a");
            tag.href = m.url || "#";
            tag.target = "_blank";
            tag.rel = "noopener";
            const src = (m.source || "").toLowerCase();
            let bg = "#eee", color = "#333", border = "#ccc";
            if (src.includes("ryans")) { bg = "#e8f5e9"; color = "#1b5e20"; border = "#4caf50"; }
            else if (src.includes("star")) { bg = "#e3f2fd"; color = "#0d47a1"; border = "#2196f3"; }
            else if (src.includes("daraz")) { bg = "#fff3e0"; color = "#e65100"; border = "#ff9800"; }
            tag.style.cssText = `display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;background:${bg};color:${color};border:1px solid ${border};text-decoration:none;`;
            tag.textContent = `${m.source || "?"}: ৳${m.price || "?"}`;
            badge.appendChild(tag);
          });
        }

        target.appendChild(badge);
      });
    },
    args: [results],
  });
}

// Step 3: Match POS products against tracked prices
function matchProducts(posProducts, trackedProducts) {
  return posProducts.map((pos) => {
    let best = null;
    let bestScore = 0;
    for (const tp of trackedProducts) {
      const sim = calcSimilarity(tp.name, pos.name);
      if (sim.score >= 0.6 && sim.score > bestScore) {
        bestScore = sim.score;
        best = { ...tp, similarity: sim };
      }
    }
    if (best) {
      // API returns flat objects with current_price, source, url
      return {
        ...pos,
        matchName: best.name,
        similarity: best.similarity,
        matches: [{
          source: best.source,
          price: best.current_price,
          url: best.url,
        }],
      };
    }
    return { ...pos, matches: [] };
  });
}

// Main flow
(async function () {
  try {
    // Get current tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) {
      setStatus("No active tab", "error");
      return;
    }

    // Check if we're on the POS page
    if (!tab.url?.includes("bclitstock.com")) {
      setStatus("", "error", 'Navigate to <a href="https://bclitstock.com/pos/create" target="_blank">bclitstock.com/pos/create</a>');
      statusEl.addEventListener("click", (e) => {
        if (e.target.tagName === "A") return; // let link handle itself
        chrome.tabs.create({ url: "https://bclitstock.com/pos/create" });
        window.close();
      });
      return;
    }

    setStatus("Scanning POS products…", "loading");

    // Extract products
    const posProducts = await extractPosProducts(tab.id);
    countEl.textContent = posProducts.length;

    if (posProducts.length === 0) {
      setStatus("No products found in POS table", "error");
      return;
    }

    setStatus("Fetching competitor prices…", "loading");

    // Fetch tracked products from API
    const trackedProducts = await fetchPrices();

    // Match
    const results = matchProducts(posProducts, trackedProducts);
    console.log('[PT] Match results:', JSON.stringify(results, null, 2));

    // Inject badges into page
    await injectBadges(tab.id, results);

    setStatus(`✓ Found ${posProducts.length} products — badges injected`, "connected");
    syncBtn.disabled = false;

    // Render popup results
    results.forEach((r) => {
      const card = document.createElement("div");
      card.className = "result-card";

      const nameDiv = document.createElement("div");
      nameDiv.className = "name";
      nameDiv.textContent = r.name;
      card.appendChild(nameDiv);

      if (r.matchName) {
        const matchInfo = document.createElement("div");
        matchInfo.className = "match-info";
        const dot = `<span class="dot ${matchClass(r.similarity.score)}"></span>`;
        matchInfo.innerHTML = `${dot} Matched: "${r.matchName}" (${Math.round(r.similarity.score * 100)}%)`;
        card.appendChild(matchInfo);
      }

      const tagsDiv = document.createElement("div");
      tagsDiv.className = "price-tags";

      if (r.matches && r.matches.length > 0) {
        r.matches.forEach((m) => {
          const tag = document.createElement("a");
          tag.className = `price-tag ${sourceClass(m.source)}`;
          tag.href = m.url || "#";
          tag.target = "_blank";
          tag.rel = "noopener";
          tag.innerHTML = `<span class="label">${m.source || "?"}</span> <span class="amount">৳${m.price || "?"}</span>`;
          tagsDiv.appendChild(tag);
        });
      } else {
        const noMatch = document.createElement("span");
        noMatch.className = "no-match";
        noMatch.textContent = "— no price match found";
        tagsDiv.appendChild(noMatch);
      }

      card.appendChild(tagsDiv);
      resultsEl.appendChild(card);
    });
  } catch (err) {
    setStatus("Error: " + err.message, "error");
    console.error("[PT]", err);
  }
})();

// Sync button
syncBtn.addEventListener("click", async () => {
  syncBtn.disabled = true;
  syncBtn.textContent = "⏳ Syncing…";
  try {
    await fetch(API_BASE + "/sync-prices", { method: "POST" });
    syncBtn.textContent = "✓ Synced!";
    setTimeout(() => {
      syncBtn.textContent = "🔄 Sync Prices";
      syncBtn.disabled = false;
    }, 2000);
  } catch (err) {
    syncBtn.textContent = "✗ Sync failed";
    syncBtn.disabled = false;
    console.error("[PT] sync failed:", err);
  }
});
