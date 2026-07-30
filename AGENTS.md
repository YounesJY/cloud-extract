# Cloud Extract — Agent Context

## Project Overview

Web-based port of the C# "ContractProcessor" desktop app. Extracts structured data from Moroccan insurance PDFs using OpenRouter AI + regex validation.

## Stack

- **Frontend**: Vanilla HTML/CSS/JS + Bootstrap 5.3.3
- **PDF**: pdf.js (Mozilla) for text extraction + page rendering
- **Export**: SheetJS (xlsx) + manual CSV
- **Storage**: IndexedDB via Dexie.js (contracts, settings)
- **Server**: PowerShell `HttpListener` (no Python/Node — start.bat)

## Key Architecture Decisions

### No build step
Pure HTML/CSS/JS. No bundler, no npm, no transpiler. Zip and run.

### Client-side only
All logic runs in the browser. The PowerShell server just serves static files to avoid CORS issues with `file://`.

### AI API calls go directly to OpenRouter
The browser fetches `https://openrouter.ai/api/v1/chat/completions`. No proxy needed. User provides their own API key.

## Extraction Flow

1. User uploads PDF(s) and selects category
2. pdf.js extracts text with spatial positioning (letter grouping by Y)
3. Cleaned text sent to OpenRouter with category-specific prompt
4. AI response parsed + cross-validated against PDF text via regex
5. Results displayed in table, stored in IndexedDB

## Field Categories

| Category | Specific Fields | Common Fields |
|---|---|---|
| AUTO | Immatriculation, Marque véhicule | Police Num, Souscripteur, Adresse, Dates, Téléphone, Code Intermédiaire, N° Client, CIN, Prime Totale TTC, Prime Nette, Taxes, Garanties, Montants Garantis, Franchises, Date de Naissance, Profession, Nom Assuré |
| RC | (none extra) | Same common fields |
| AT | (none extra) | Same common fields |
| Habitation | (none extra) | Same common fields |
| Individuelle Accidents | (none extra) | Same common fields |

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

## Build/Run

No build step. Just serve the folder via HTTP on port 8080:
```
start.bat
```
Then open http://localhost:8080.
