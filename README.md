# Cloud Extract

Web-based insurance contract data extraction tool. Upload Moroccan insurance PDFs (Allianz, Sanlam, etc.), extract structured data using AI, and export to Excel/CSV.

## Features

- **PDF Upload** — Drag & drop or file picker, batch upload with progress bar, 50MB limit
- **AI Extraction** — Uses OpenRouter API (DeepSeek V3, GPT-4o Mini, GPT-4.1 Nano, or Gemini 2.0 Flash)
- **Auto Category Detection** — AI classifies the document type before extraction
- **Smart Validation** — Cross-references AI output with PDF text via regex
- **PDF Preview** — Per-record modal with multi-page viewer, zoom (25%–400%), text selection, copy, and search
- **Results Table** — Sortable columns, per-row category change, search/filter, field visibility toggles, drag-and-drop field reordering
- **Per-file Actions** — Preview PDF, re-extract, or delete individual files
- **Per-file Actions** — Re-extract or delete individual files
- **Batch Operations** — Bulk set category, batch re-extract
- **Export to Excel/CSV** — Download visible columns only
- **Dark Mode** — Toggle in navbar, persists across reload
- **Persistent Storage** — Contracts in localStorage, PDF cache in IndexedDB (survives page reload)

## How to run

1. Unzip the folder
2. Double-click `start.bat`
3. Open `http://localhost:8080` in your browser
4. Enter your OpenRouter API key in Settings
5. Select contract category, upload PDFs, click Extract

## Requirements

- Modern browser (Chrome, Firefox, Edge)
- OpenRouter API key (free tier available at https://openrouter.ai)
- No Python, Node.js, or .NET — `start.bat` uses built-in Windows PowerShell

## Project Structure

```
cloud-extract/
├── index.html         Main UI
├── app.js             Application logic
├── styles.css         Custom styles
├── server.ps1         HTTP server script
├── start.bat          Launcher
├── start.vbs          Silent zero-window launcher
├── stop.bat           Stop the HTTP server
├── README.md
├── AGENTS.md
└── CHANGELOG.md
```

## License

Internal use.
