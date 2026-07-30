# Cloud Extract

Web-based insurance contract data extraction tool. Upload Moroccan insurance PDFs (Allianz, Sanlam, etc.), extract structured data using AI, and export to Excel/CSV.

## Features

- **PDF Upload** — Drag & drop or file picker, batch upload with category selection
- **AI Extraction** — Uses OpenRouter API (GPT-4o-mini, DeepSeek, or other free models)
- **Smart Validation** — Cross-references AI output with PDF text via regex
- **PDF Preview** — Visual PDF viewer using pdf.js
- **Export to Excel/CSV** — Download results
- **Settings** — Configure API key, AI model, contract category
- **Global field toggle** — Show/hide columns in results table

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
├── README.md
├── AGENTS.md
├── CHANGELOG.md
└── lib/
    ├── pdf.min.js
    ├── pdf.worker.min.js
    ├── xlsx.full.min.js
    └── bootstrap@5.3.3/
        ├── css/bootstrap.min.css
        └── js/bootstrap.bundle.min.js
```

## License

Internal use.
