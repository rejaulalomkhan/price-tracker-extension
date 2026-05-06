# 🏷️ Ultimate POS Price Tracker - Chrome Extension

Shows competitor prices (Ryans, StarTech, Daraz) as badges on Ultimate POS product rows.

## How It Works

1. Extension loads on `bclitstock.com` POS page
2. Fetches tracked products from `panel.armanazij.me/api/products`
3. Watches `#pos_table` for new product rows via MutationObserver
4. Fuzzy-matches POS product names against tracked products
5. Injects color-coded price badges into each row

## Install

1. Open Chrome → `chrome://extensions/`
2. Enable **Developer mode**
3. Click **Load unpacked** → select this folder (not a zip, the folder itself)
4. Open your POS page — badges appear automatically

## Architecture

```
POS Page (bclitstock.com)
    │
    ▼
content.js ──── fetch ────► panel.armanazij.me/api/products
    │                           │
    │                    Price Tracker DB
    │                    (Ryans, StarTech, etc.)
    │
    ▼
Injects badges into #pos_table rows
```

## Badge Indicators

| Symbol | Confidence | Meaning |
|--------|------------|---------|
| ✓ | ≥85% | High match |
| ~ | 70-84% | Medium match |
| ? | 65-69% | Low match — verify manually |

## Files

- `manifest.json` - Extension config (Manifest V3)
- `content.js` - Main script: fetches prices, watches DOM, injects badges
- `styles.css` - Badge styling
- `popup.html/js` - Extension popup (sync status, settings)
- `icons/` - Extension icons

## Backend API

- `GET /api/products` - Returns all tracked products with prices
- `POST /api/match-products` - Fuzzy match POS names (used by extension)
- `POST /api/sync-prices` - Trigger price sync (scrape all sources)

CORS enabled for `https://bclitstock.com`
