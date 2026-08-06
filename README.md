# Cloud Extract

Web-based insurance contract data extraction tool. Upload Moroccan insurance PDFs (Allianz, Sanlam, etc.), extract structured data using AI, and export to Excel/CSV.

## Features

- **PDF Upload** — Drag & drop or file picker, batch upload with progress bar, 50MB limit
- **AI Extraction** — Uses OpenRouter API (DeepSeek V3, GPT-4o Mini, GPT-4.1 Nano, or Gemini 2.0 Flash) with a regex fallback when AI fails. Runs at temperature 0 for deterministic, repeatable results.
- **Auto Category Detection** — AI classifies the document type before extraction
- **Price Consistency** — A second AI pass re-asks for just `Prime Nette`/`Taxes`/`Prime Totale TTC` when they don't reconcile, before flagging a row "review"
- **Smart Validation** — Cross-references AI output with PDF text via regex
- **19 Fields** — incl. `Police Num`, `Attestation`, `Souscripteur`, `Nom Assuré`, all price amounts, garanties, montants, franchises, and more
- **PDF Preview** — Per-record modal with multi-page viewer, zoom (25%–400%), text selection, copy, and search
- **Results Table** — Sortable columns, per-row category change, search/filter, field visibility toggles, drag-and-drop field reordering
- **Per-file Actions** — Preview PDF, extract one record, re-extract, export one record to CSV, or delete individual files
- **Batch Operations** — Bulk set category, batch re-extract, full-batch export
- **Export to Excel/CSV** — Download visible columns only, plus per-record single-CSV export
- **Dark Mode** — Toggle in navbar, persists across reload
- **Persistent Storage** — Contracts in localStorage, PDF cache in IndexedDB (survives page reload)
- **Report issue** — navbar button opens a GitHub issue pre-filled with the source file, category, extraction method, AI error, and fields

## How to run (local)

1. Unzip the folder
2. Double-click `start.bat`
3. Open `http://localhost:8080` in your browser
4. Enter your OpenRouter API key in Settings
5. Select contract category, upload PDFs, click Extract

## Host on GitHub Pages (no server needed)

The app is a static site — all libraries load from CDN, and AI calls go directly to OpenRouter from the browser. So it runs on **GitHub Pages** with zero installation.

1. Push this repo to GitHub
2. Enable Pages: repo → **Settings → Pages → Source → "GitHub Actions"**
3. The included workflow (`.github/workflows/deploy.yml`) auto-deploys on every push to `main`
4. App is live at `https://<username>.github.io/cloud-extract/`

Client needs only: internet connection, a modern browser, and their own OpenRouter API key.

## Extraction Accuracy

Verified end-to-end against real contracts across **4 document formats**:

- **Allianz/Sanlam full contracts** — 9/9 contracts with correct prices (Prime Nette, Taxes, Prime Totale TTC all reconcile)
- **Allianz short-form auto attestations** (e.g. AMAQRAN Dounya) — 100% accurate incl. the `Attestation` field
- **SANLAM Assur Auto attestations** (e.g. SAMMOU ALI) — 100% accurate after the client-vs-conducteur fix

Known-handled edge cases: insurer/intermediary phone numbers (dropped), placeholder police numbers (`.....`), OCR artifacts (`N?12`→`N°12`), glued checkbox labels (`STÉCHARI DONIA`→`CHARI DONIA`), client vs intermediary vs conducteur identity, FSEC/NARSA tax sums, garanties-table "Total" trap.

## Requirements

- Modern browser (Chrome, Firefox, Edge)
- OpenRouter API key + a small credit balance (single contracts cost ~$0.001–0.003; add credits at https://openrouter.ai/settings/credits)
- Local run: no Python, Node.js, or .NET — `start.bat` uses built-in Windows PowerShell

## AI Model & Pricing

- **Default model: DeepSeek V3** (`deepseek/deepseek-chat`, **$0.2574 in / $1.0287 out per 1M**).
  Verified open accuracy: **11/11** contracts vs ~4/11 (V4 Flash 0423) and ~2/11 (V4 Flash 0731).
- **Expected cost:** ~$0.003/file → **~$4/month, ~$50/year at max 1,500 PDFs/mo** (negligible).
- **Speed:** OpenRouter routes V3 at ~21–30 tok/s, ~0.7–1.2s to first token; a full contract extracts
  in ~30–45s.
- **Paid vs free:** DeepSeek V3 is paid-only. The free tier (Gemini 2.0 Flash, `:free`) is
  rate-limited (~20 req/min, ~1000 req/day) and too unstable at this volume.
- **Prompt caching:** OpenRouter lists no cached-input price for V3 (full-rate repeats). Revisit
  when a cache tier appears.
- Full analysis lives in the LaTeX report `/Rapport_Modeles_Cout.tex`.

## Project Structure

```
cloud-extract/
├── .github/workflows/
│   └── deploy.yml     Auto-deploy to GitHub Pages on push
├── index.html         Main UI
├── app.js             Application logic
├── styles.css         Custom styles
├── server.ps1         HTTP server script (local use)
├── start.bat          Launcher (local use)
├── start.vbs          Silent zero-window launcher (local use)
├── stop.bat           Stop the HTTP server (local use)
├── README.md
├── AGENTS.md
└── CHANGELOG.md
```

## License

Internal use.
