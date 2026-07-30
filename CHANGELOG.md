# Changelog

## [1.4.0] — 2026-07-30

### Added
- Drag-and-drop field reordering in Fields modal (persistent order)
- PDF Preview in a per-record modal (click 👁 on any row)
- Extraction table fills full viewport height (`calc(100vh - 280px)`)
- OpenRouter retry logic (2 retries with 1s/2s backoff)
- PDF keyboard shortcuts: ArrowLeft/Right for page, Ctrl+Plus/Minus for zoom, Ctrl+0 to reset
- Per-row extraction progress: method badge shows "Extracting..." during batch
- PDF search match count in page info ("N matches" / "No matches")
- HTML escape (`esc()`) for all user data injected into innerHTML (XSS fix)
- Select All / Deselect All buttons regenerated inside updateFieldToggleList
- `start.vbs` for silent zero-window launch, `stop.bat` to kill server

### Changed
- PDF Preview moved from main layout to a Bootstrap modal (table now full-width)
- `server.ps1` updated for reliability
- `loadFromStorage` saves/loads `fieldOrder`
- Dark mode toggle moved to separate sync DOMContentLoaded listener (immune to async errors)

### Fixed
- XSS: field values and filenames now HTML-escaped before innerHTML injection
- Search clear button shows whenever there's text (not only when matches found)
- `renderCurrentPage` now shows user-facing error instead of silent spinner
- Race condition on rapid prev/next clicks — rendering lock prevents overlap
- Free models with `0` pricing no longer show "?" (falsy check fix)
- `lib/` directory removed from README (uses CDN)
- `.gitignore` added

## [1.3.0] — 2026-07-30

### Added
- Dark mode toggle with persistent preference in localStorage
- PDF text layer overlay (select, copy text from PDF preview)
- Search within PDF with yellow highlighting and clear button
- Zoom in/out/reset controls (25%–400%) in PDF preview header
- Table column sorting — click any header to sort ▲/▼
- Search/filter input in results header — filters contracts by filename or field values
- Batch category dropdown in results header — set category for all contracts at once
- Upload progress bar — status shows "Reading file X of Y..." during upload
- Auto-show first PDF preview after upload
- Remember last selected PDF across reload

### Changed
- UI/UX overhaul: gradient navbar, card shadows, animated drop zone, polished table styling
- PDF viewer card header redesigned with zoom nav, search, and page controls
- Results table: removed `table-bordered`, scrollable body (`max-height: 500px`), hover highlights
- Dark mode now uses Bootstrap CSS variables throughout instead of hardcoded colors
- Upload flow refactored into shared `readPdfFiles()` function with progress reporting

### Fixed
- Dark mode: body, drop zone, table, cards, and modals now properly adapt via CSS variables
- PDF viewer background uses `var(--bs-body-bg)` instead of hardcoded `bg-light`
- Action button delegation handles both delete and re-extract correctly

## [1.2.0] — 2026-07-30

### Added
- Auto-detect contract category via AI before extraction
- Per-row category dropdown with change persistence
- Per-file re-extract button with spinner state
- Individual file delete button per row
- PDF binary cache persisted in IndexedDB (survives reload)
- File size validation (50MB limit)
- Enhanced action buttons with Bootstrap outline styling

### Changed
- Extraction runs in parallel (`Promise.allSettled`) instead of sequential
- Model list: removed free-only filter, shows all OpenRouter models
- Hardcoded model list trimmed to 4 best options (DeepSeek V3, GPT-4o Mini, GPT-4.1 Nano, Gemini 2.0 Flash)
- Category dropdown widened to 160px inline style
- Model labels include pricing info
- `runExtraction` now retries `error` files

### Fixed
- `ArrayBuffer already detached` crash — pass `.slice()` to pdf.js `getDocument()`
- Extracted text passes through pdf.js without detaching cached buffer
- pdf.js CDN URL changed to version 3.11.174 (last UMD build)
- Dexie/IndexedDB CDN failure — replaced with localStorage + native IndexedDB

### Removed
- Dexie.js dependency
- Free models (Mistral 7B, Llama 3.2 3B) from dropdown
- GPT-4o (too expensive for value)

## [1.0.0] — 2026-07-30

### Added
- Initial web version of ContractProcessor
- PDF upload with drag & drop (batch support)
- Category selection per upload (RC, AT, AUTO, Habitation, Individuelle Accidents, Schengen Visa)
- AI extraction via OpenRouter with live free model list
- Cross-validation regex rules (ported from C#)
- PDF preview via pdf.js
- Results table with global field toggle
- Export to .xlsx (SheetJS) and .csv
- Settings panel: API key, model selection, field visibility
- Persistent storage via localStorage + IndexedDB
- start.bat + server.ps1 for one-click local server
