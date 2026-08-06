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
4. Cleaned text sent to OpenRouter with category-specific prompt (temperature 0 for determinism)
   - Long texts are truncated (max 12000 chars) but always keep the head **and** the PRIME/pricing section
5. AI response parsed + cross-validated against PDF text via regex
6. If `Prime Totale TTC` does not reconcile with `Prime Nette + Taxes`, a **second AI pass** (`recheckPrices`) re-asks for just those three fields at temperature 0 before the row is flagged "review"
7. Results displayed in sortable table, stored in localStorage

## Models

Hardcoded fallback list (live OpenRouter list used when API key set). Prices are the verified
OpenRouter catalogue rates per 1M tokens (05/08/2026).

| Model | ID (OpenRouter) | Input | Output | Accuracy (test) | Role |
|---|---|---|---|---|---|
| DeepSeek V3 | `deepseek/deepseek-chat` | $0.2574 | $1.0287 | 11/11 (100%) | **Default (recommended)** |
| DeepSeek V4 Flash | `deepseek/deepseek-v4-flash` | $0.14 | $0.28 | ~4/11 | Fast fallback |
| GPT-4o Mini | `openai/gpt-4o-mini` | $0.15 | $0.60 | Good | Fallback |
| GPT-4.1 Nano | `openai/gpt-4.1-nano` | $0.10 | $0.40 | Good | Cheap fallback |
| Gemini 2.0 Flash | `google/gemini-2.0-flash-exp` | $0 | $0 | Basic | Free tier |

### Model decision (2026-08-05)
- **DeepSeek V3 is the default.** Tested against 11 real contracts it scored **11/11**, while
  DeepSeek V4 Flash 0423 scored ~4/11 and V4 Flash 0731 ~2/11 (Flash models confuse agency address
  with client, extract placeholder labels like `/prénom ou raison sociale :`, take phone numbers for
  the insured name, and produce missing/wrong amounts).
- V4 Flash models are NOT used because accuracy loss outweighs the ~2× cheaper price.
- **Cost at max volume (1,500 PDF/mo): ~$4/mo (~$50/yr)** — negligible. ~$0.003/file.
- **Speed is sufficient:** OpenRouter routes V3 at ~21–30 tok/s (~0.7–1.2s TTFT); a ~900-token
  extraction takes ~30–45s (~10–15s per document across 50/day, or overnight batch).
- **Paid vs free:** DeepSeek V3 is a paid model only (not on the `:free` tier). The free tier
  (Gemini 2.0 Flash, `:free` variants) is rate-limited (~20 req/min, ~1000 req/day) and unstable at
  this volume.
- **Prompt caching note:** OpenRouter publishes no cached-input price for V3; repeats are billed at
  full input rate. Revisit when they add a cache tier.
- Costs below reused by the LeTeX report at `Rapport_Modeles_Cout.tex`.

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
- Temperature 0 for deterministic output; repeated runs return stable results
- `recheckPrices`: second AI pass (temperature 0) focused on the 3 price fields when the math check fails
- Parallel batch extraction via `Promise.allSettled`
- Per-record extraction button on each pending row; per-row re-extract button with spinner
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
- Per-record export button exports a single contract to a CSV named after its source file

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

- Police Num: regex `(?:Police\s*N[°o]\s*:?|N[°o]\s*Police\s*:?)\s*([A-Z0-9\-/]{3,25})` or `CONTRAT\s*N[°o]\s*:?\s*([A-Z0-9\-./]{3,30})`; the label "Attestation" is never a policy number
- Attestation: regex `N[°o]\s*Attestation\s*:?\s*(\d{4,20})` (short-form auto attestation documents)
- `N° Souscripteur` is mapped to N° Client (attestation format naming)
- If no regex match and value looks like a phone (7-10 digits), move to Téléphone
- N° Client: regex `N[°o]\s*Client\s*:?\s*([A-Z0-9\-/]{3,20})`
- CIN: validate format `^[A-Z]{1,2}\d{4,10}$`, clear if invalid
- Téléphone: validate 10 digits starting with 0, clear if invalid
- Code Intermédiaire: must be short digit code, not description
- Nom Assuré: copy from Souscripteur if null
- Date swap: if effet > échéance, swap them
- Prime Totale TTC >= Prime Nette, swap if not
- Pricing (`fillPriceFields`): TTC ≈ Nette + Taxes (math check); never use "prime minimale"/franchise minimum as TTC; Taxes = labeled "Taxes" only (not FSEC/catastrophiques/accessoires); round to ≤2 decimals
- `checkPriceConsistency` flags rows where TTC ≠ Nette + Taxes beyond tolerance (5%, or 20% when "Accessoires"/"Assistance" present); also detects the garanties-table "Total" trap (nette must not equal a table "Total" row) — shown as a "review" badge
- `cleanLabeledValue`: strips label-prefix junk ("Nom et prénom ou raison sociale :", "intermédiaire :") from Souscripteur/Adresse
- Téléphone hygiene: insurer/intermediary/assistance boilerplate numbers (0522499700, 0522420606, 0801001818, 0522225521, 0522957575, 0522957538, 0802057057, ...) and dummy patterns (0600000000) are dropped
- Placeholder-only Police Num (literal ".....") and `N?`→`N°` OCR artifacts are cleaned
- Names: glued "Sté" checkbox labels are split (`STÉCHARI DONIA`→`CHARI DONIA`); legal suffixes (SARL/SA) kept only when part of the written name
- Adresse: trailing column labels glued by pypdf (e.g. trailing "ICE") are stripped
- Client identity (prompt-driven): Souscripteur/Nom Assuré/Date de Naissance come from the **Souscripteur** block, falling back to **Propriétaire de Véhicule**, then **Conducteur Habituel** — never the intermediary (broker) or a conducteur who differs from the client
- SANLAM **"Assur Auto"** attestations list TWO people under the Souscripteur section (client + conducteur habituel) and the model sometimes picks the conducteur. Deterministic post-fix `fixAssurAutoClientIdentity`: for this format, derive Souscripteur/Nom Assuré/CIN/Date de Naissance from the **Propriétaire de véhicule** block (name, ID, DOB), overriding only when the AI's Souscripteur differs from that client. Handles wrapped names (e.g. "AIT OULAHYANE MOHAMED") and skips invalid/numeric CINs (e.g. "56053"). NO-OP when AI already correct (SAMMOU ALI, D2A ELEC).
- Price second-pass: when reconciliation fails, `recheckPrices` re-asks the model for only `Prime Totale TTC`, `Prime Nette`, `Taxes` (temperature 0)

## Build/Run

No build step. Just serve the folder via HTTP on port 8080:
```
start.bat
```
Then open http://localhost:8080.
