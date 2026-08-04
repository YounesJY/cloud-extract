# Cloud Extract — Agent Context

## Project Overview

Web-based port of the C# "ContractProcessor" desktop app. Extracts structured data from Moroccan insurance PDFs using OpenRouter AI + regex validation.

## Stack

- **Frontend**: Vanilla HTML/CSS/JS + Bootstrap 5.3.3
- **PDF**: pdf.js 3.11.174 (Mozilla) for text extraction + page rendering with text layer
- **Export**: SheetJS (xlsx) + manual CSV
- **Storage**: localStorage (contracts, settings) + IndexedDB (PDF binary cache)
- **Server**: PowerShell `HttpListener` (no Python/Node — start.bat)

## Key Architecture Decisions

### No build step
Pure HTML/CSS/JS. No bundler, no npm, no transpiler. Zip and run.

### Client-side only
All logic runs in the browser. The PowerShell server just serves static files to avoid CORS issues with `file://`.

### AI API calls go directly to OpenRouter
The browser fetches `https://openrouter.ai/api/v1/chat/completions`. No proxy needed. User provides their own API key.

## Extraction Flow

1. User uploads PDF(s) — binary stored in IndexedDB, shows upload progress
2. pdf.js extracts text with spatial positioning (letter grouping by Y)
3. AI auto-detects contract category (RC, AT, AUTO, etc.) from text
4. Cleaned text sent to OpenRouter with category-specific prompt
   - Long texts are truncated (max 12000 chars) but always keep the head **and** the PRIME/pricing section
5. AI response parsed + cross-validated against PDF text via regex
6. Results displayed in sortable table, stored in localStorage

## Models

| Model | Cost | Accuracy |
|---|---|---|
| DeepSeek V3 | ~$0.003/file | Best (recommended) |
| GPT-4o Mini | ~$0.002/file | Good fallback |
| GPT-4.1 Nano | ~$0.001/file | Cheapest OpenAI |
| Gemini 2.0 Flash | Free | Basic |

## Features

### File Handling
- Drag & drop + browse upload, progress bar, PDF-only filter, 50MB limit
- Duplicate detection, per-row delete button with confirmation
- PDF binary cached in IndexedDB (survives page reload)

### PDF Preview
- Per-record modal (click 👁 on any row) with prev/next navigation and "Page X / Y" indicator
- Zoom in/out/reset (25%–400%), keyboard shortcuts (ArrowLeft/Right, Ctrl+Plus/Minus, Ctrl+0)
- Text layer overlay — select, copy, right-click text from PDF
- Search within PDF with yellow highlighting, match count, and "No matches" feedback
- PDF selector dropdown to switch between uploaded files

### Extraction
- Auto-detect category via AI before extraction
- OpenRouter AI with regex fallback (`regexExtract`); pricing fields use a dedicated regex layer (`fillPriceFields`) with label-first + value-before-label amount pairing
- AI API failures are surfaced in the UI: Method badge shows "regex (AI fail)" (error on hover), status bar reports fallback count
- OpenRouter 4xx errors (401/402/403/404) are NOT retried — they fail fast
- Parallel batch extraction via `Promise.allSettled`
- Per-file re-extract button with spinner
- Cross-validation: phone, CIN, dates, numeric, field sanity checks

### Display
- Dynamic table with per-row category dropdown (changeable anytime)
- Sortable columns (click any header to sort ▲/▼)
- Search/filter input filters contracts by filename or field values
- Field visibility toggles per category with Select All / Deselect All
- Drag-and-drop field reordering (persistent order)
- Inline editable fields (click to edit, Enter or blur to save)
- Scrollable table body (fills viewport: calc(100vh - 280px))
- XLSX/CSV export of visible columns, with a leading "File Name" column

### Settings
- API key with show/hide toggle
- Live model list from OpenRouter API (fallback to hardcoded)
- Batch category set for all contracts
- Dark mode toggle with persistent preference

### UI/UX
- Gradient navbar with drop shadow
- Card shadows with hover deepen effect
- Animated drop zone with scale-up icon on hover
- Per-record PDF preview modal
- Extraction table fills full viewport height
- Dark mode toggle with persistent preference
- Keyboard shortcuts: Enter to extract, ArrowLeft/Right for PDF pages, Ctrl+Plus/Minus for zoom
- Responsive layout (mobile-friendly)

## Cross-Validation Rules (port from C#)

- Police Num: regex `Police\s*N[°o]\s*:?\s*([A-Z0-9\-/]{3,25})` or `CONTRAT\s*N[°o]\s*:?\s*([A-Z0-9\-./]{3,30})`
- If no regex match and value looks like a phone (7-10 digits), move to Téléphone
- N° Client: regex `N[°o]\s*Client\s*:?\s*([A-Z0-9\-/]{3,20})`
- CIN: validate format `^[A-Z]{1,2}\d{4,10}$`, clear if invalid
- Téléphone: validate 10 digits starting with 0, clear if invalid
- Code Intermédiaire: must be short digit code, not description
- Nom Assuré: copy from Souscripteur if null
- Date swap: if effet > échéance, swap them
- Prime Totale TTC >= Prime Nette, swap if not
- Pricing (`fillPriceFields`): TTC ≈ Nette + Taxes (math check); never use "prime minimale"/franchise minimum as TTC; Taxes = labeled "Taxes" only (not FSEC/catastrophiques/accessoires); round to ≤2 decimals
- `cleanLabeledValue`: strips label-prefix junk ("Nom et prénom ou raison sociale :", "intermédiaire :") from Souscripteur/Adresse
- Téléphone hygiene: insurer/intermediary boilerplate numbers and dummy patterns (0600000000) are dropped
- Placeholder-only Police Num (literal ".....") and `N?`→`N°` OCR artifacts are cleaned
- `checkPriceConsistency` flags rows where TTC ≠ Nette + Taxes beyond tolerance (shown as a "review" badge)

## Build/Run

No build step. Just serve the folder via HTTP on port 8080:
```
start.bat
```
Then open http://localhost:8080.
