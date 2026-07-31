# Cloud Extract

Web-based insurance contract data extraction tool. Upload Moroccan insurance PDFs (Allianz, Sanlam, etc.), extract structured data using AI, and export to Excel/CSV.

## Features

- **PDF Upload** — Drag & drop or file picker, batch upload with progress bar, 50MB limit
- **AI Extraction** — Uses OpenRouter API (DeepSeek V3, GPT-4o Mini, GPT-4.1 Nano, or Gemini 2.0 Flash) with a regex fallback when AI fails
- **Auto Category Detection** — AI classifies the document type before extraction
- **Smart Validation** — Cross-references AI output with PDF text via regex
- **PDF Preview** — Per-record modal with multi-page viewer, zoom (25%–400%), text selection, copy, and search
- **Results Table** — Sortable columns, per-row category change, search/filter, field visibility toggles, drag-and-drop field reordering
- **Per-file Actions** — Preview PDF, re-extract, or delete individual files
- **Batch Operations** — Bulk set category, batch re-extract
- **Export to Excel/CSV** — Download visible columns only
- **Dark Mode** — Toggle in navbar, persists across reload
- **Persistent Storage** — Contracts in localStorage, PDF cache in IndexedDB (survives page reload)

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

## Requirements

- Modern browser (Chrome, Firefox, Edge)
- OpenRouter API key + a small credit balance (single contracts cost ~$0.001–0.003; add credits at https://openrouter.ai/settings/credits)
- Local run: no Python, Node.js, or .NET — `start.bat` uses built-in Windows PowerShell

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
