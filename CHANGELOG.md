# Changelog

## [1.8.1] — 2026-08-04

### Fixed
- Client vs conducteur confusion: Souscripteur/Nom Assuré/Date de Naissance now come from the **Souscripteur** block (fallback: Propriétaire de Véhicule), never the "Conducteur Habituel" when a Souscripteur/Propriétaire exists (e.g. Souscripteur "SAMMOU ALI", Conducteur "SAMMOU MOHAMED")

## [1.8.0] — 2026-08-04

### Added
- New **Attestation** field for short-form auto attestation documents (e.g. "N° Attestation 203472207")

### Fixed
- Client vs intermediary confusion: Souscripteur/Nom Assuré now correctly picks the **client** (e.g. "Mme AMAQRAN Dounya") instead of the broker ("AKRAM EL KASSAD ASSURANCES SARL") in attestation formats
- Police Num no longer grabs the label "Attestation"; now captures the real policy number (e.g. "33B5795"), and `N° Souscripteur` maps to N° Client
- Adresse: trailing column labels glued by pypdf (e.g. trailing "ICE") are stripped
- Phone hygiene: added Maroc Assistance hotlines (0522957538, 0802057057) to the insurer boilerplate blacklist

## [1.7.2] — 2026-08-04

### Fixed
- Prompt rule added for **Franchises**: always extract the "minimum de X DH" / "X% du montant des dommages" clauses from the Franchise column (fixes CHARI losing its franchises)

## [1.7.1] — 2026-08-04

### Added
- **Per-record export**: each row has a download button that exports just that contract to a CSV named after its source file

## [1.7.0] — 2026-08-04

### Added
- **Per-record extraction**: each not-yet-extracted row now has its own "Extract" button (replaces the re-extract icon for pending rows) so a single PDF can be processed without running the whole batch
- **Price second-pass**: when `Prime Totale TTC` does not reconcile with `Prime Nette + Taxes`, the app re-asks the model (temperature 0) for just those three fields before flagging the row "review"

### Changed
- Determinism: extraction temperature lowered from 0.1 to 0 to stop fields flapping between runs
- Prompt hardening: per-guarantee amounts must be paired with their own labels (CHARI "Bris d'enseignes 10 000,00" → 10000.00, never 0.00); for "personne morale" contracts Souscripteur/Nom Assuré = the Raison sociale, not the conducteur individuel; Profession always filled when present; dates cross-checked against "Date d'effet"/"Date d'échéance" labels

## [1.6.2] — 2026-08-04

### Fixed
- Rounding now also cleans all-zero artifacts (e.g. `0.0000` -> `0`) that the previous `Math.abs(f) > 0.0005` guard skipped
- Names: prompt + post-fix split checkbox label "Sté" glued onto the person's name (e.g. `STÉCHARI DONIA` -> `CHARI DONIA`); legal suffix (SARL/SA) kept only when part of the written name

## [1.6.1] — 2026-08-04

### Fixed
- Prompt overcorrection: model was adding the Taxe FSEC line on top of the labeled "Taxes au comptant" (e.g. EL HADRI 110.48 = 99.79 + 10.69). Rule now: use the labeled Taxes amount ALONE; only sum FSEC + NARSA when no "Taxes" label exists (D2A-style)
- Prime Nette: clarified to use the DÉCOMPTE section value, never the garanties table "Total" (fixes D2A picking 4760.70 instead of 4409.05)

## [1.6.0] — 2026-08-04

### Added
- Export CSV/XLSX now includes a leading **File Name** column so each row is traceable to its source PDF
- "review" warning badge on rows where `Prime Totale TTC` does not match `Prime Nette + Taxes` (with tolerance for legit Accessoires/FSEC/catastrophiques extras) — hover for details

### Changed
- Prompt Taxes rule: use labeled "Taxes"/"Taxes au comptant" if present, otherwise the Taxe FSEC line; sum multiple tax lines (FSEC + NARSA)
- Téléphone hygiene: insurer/intermediary boilerplate numbers (0522499700, 0522420606, 0801001818, 0522957575, ...) and dummy patterns (0600000000) are dropped — field stays empty when the PDF has no client phone
- Placeholder-only Police Num values (PDFs with literal "....." fields) are dropped instead of exported

### Fixed
- D2A auto contract: Taxes was picking only the NARSA tax line; now the FSEC tax (or sum) is used
- OCR artifact `N?12` normalized to `N°12` in addresses/names

## [1.5.0] — 2026-07-31

### Added
- Truncated prompts now always include the PRIME/pricing section (head 8000 chars + pricing tail, max 12000) — fixes missing prices on long Allianz contracts
- Prompt NUMBERS rules for Allianz/Sanlam mashed tables:
  - Math check: `Prime Totale TTC = Prime Nette + Taxes` — TTC must be ≥ Nette and ≥ Taxes
  - Value-before-label examples (`1 411,20Prime nette`, `208,42208,42Taxes`, `Prime Total TTC 1 761,98`)
  - Never treat `prime minimale` / franchise `minimum de X DH` as the total premium
  - Taxes = the labeled "Taxes" amount only (not FSEC, événements catastrophiques, or accessoires)
  - Round to at most 2 decimals (e.g. 208.4220842 → 208.42)
- Dedicated regex pricing layer (`fillPriceFields`): label-first + value-before-label amount pairing, `Prime au comptant` fallback, plausibility checks, prime-minimale trap detection
- AI failures now visible in the UI: Method badge shows "regex (AI fail)" with the error on hover; final status bar reports how many contracts fell back
- `cleanLabeledValue`: strips label-prefix junk from Souscripteur/Adresse ("Nom et prénom ou raison sociale :", "intermédiaire :", "l'intermédiaire :", ...)

### Changed
- OpenRouter errors are no longer retried on 4xx statuses (401/402/403/404) — fail fast instead of 3 wasted attempts per file
- Pricing fields (Prime Nette, Taxes, Prime Totale TTC) handled by the dedicated regex layer instead of generic patterns

### Fixed
- Allianz mashed tables where the amount appears before its label now extract correctly (RAZREV 1500/214.20/1817.15, FECM 6000/1200/7250, CHOUROUK 1000/142.80/1198, OUAHMANE 112.50/15.75/154.94)
- "Prime minimale de 10 000 DH" no longer misread as the premium
- Rounding artifacts from mashed text (208.4220842 → 208.42)

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
