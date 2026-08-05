// ===================== CONFIGURATION =====================
const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const FIELD_NAMES = [
  'Police Num', 'Attestation', 'Souscripteur', 'Adresse',
  "Date d'effet", "Date d'échéance", 'Téléphone',
  'Code Intermédiaire', 'N° Client', 'CIN',
  'Prime Totale TTC', 'Prime Nette', 'Taxes',
  'Garanties', 'Montants Garantis', 'Franchises',
  'Date de Naissance', 'Profession', 'Nom Assuré'
];

const CATEGORY_FIELDS = {
  'AUTO': ['Immatriculation', 'Marque véhicule']
};

const NUMERIC_FIELDS = ['Prime Totale TTC', 'Prime Nette', 'Taxes'];

const CATEGORIES = [
  ['RC', 'Responsabilité Civile'],
  ['AT', 'Accident du Travail'],
  ['AUTO', 'Automobile'],
  ['Habitation', 'Habitation'],
  ['Individuelle Accidents', 'Individuelle Accidents'],
  ['Schengen Visa', 'Schengen Visa']
];

// ===================== STATE =====================
let state = {
  apiKey: '',
  model: '',
  contracts: [],
  visibleFields: new Set(FIELD_NAMES),
  pdfCache: {}, // { fileName: Uint8Array }
  currentPdfName: '',
  currentPage: 1,
  totalPages: 0,
  currentScale: 1.5,
  theme: 'light',
  lastPdf: '',
  sortField: '',
  sortAsc: true,
  fieldOrder: []
};

// ===================== STORAGE (localStorage — no CDN needed) =====================
const STORAGE_KEY = 'cloud_extract_data';

// ===================== INDEXEDDB (persistent PDF cache) =====================
const DB_NAME = 'cloud_extract_cache';
const DB_VERSION = 1;
const STORE_NAME = 'pdfs';

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function savePdfToCache(fileName, data) {
  try {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(data, fileName);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    });
  } catch (e) {
    console.warn('IndexedDB save failed:', e);
  }
}

async function loadAllPdfCache() {
  try {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).openCursor();
      const cache = {};
      req.onsuccess = e => {
        const cursor = e.target.result;
        if (cursor) {
          cache[cursor.key] = cursor.value;
          cursor.continue();
        }
      };
      tx.oncomplete = () => { db.close(); resolve(cache); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    });
  } catch (e) {
    console.warn('IndexedDB load failed:', e);
    return {};
  }
}

async function deletePdfFromCache(fileName) {
  try {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(fileName);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    });
  } catch (e) {
    console.warn('IndexedDB delete failed:', e);
  }
}

async function clearPdfCacheDb() {
  try {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).clear();
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    });
  } catch (e) {
    console.warn('IndexedDB clear failed:', e);
  }
}

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      state.apiKey = data.apiKey || '';
      state.model = data.model || '';
      state.contracts = data.contracts || [];
      if (data.visibleFields) state.visibleFields = new Set(data.visibleFields);
      if (data.fieldOrder) state.fieldOrder = data.fieldOrder;
      if (data.theme) state.theme = data.theme;
      if (data.lastPdf) state.lastPdf = data.lastPdf;
    }
  } catch (e) {
    console.warn('Storage read failed, using defaults:', e);
  }
  if (state.theme === 'dark') applyTheme('dark');
}

function saveToStorage() {
  try {
    const data = {
      apiKey: state.apiKey,
      model: state.model,
      contracts: state.contracts,
      visibleFields: [...state.visibleFields],
      fieldOrder: state.fieldOrder,
      theme: state.theme,
      lastPdf: state.lastPdf
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.warn('Storage write failed:', e);
  }
}

// ===================== HTML ESCAPE =====================
function esc(str) {
  if (str == null) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ===================== DARK MODE =====================
function applyTheme(theme) {
  state.theme = theme;
  document.documentElement.setAttribute('data-bs-theme', theme);
  const icon = document.querySelector('#darkModeToggle i');
  if (icon) icon.className = theme === 'dark' ? 'bi bi-sun-fill' : 'bi bi-moon-fill';
}

// ===================== PDF EXTRACTION (pdf.js from CDN) =====================
console.log('pdf.js available:', typeof pdfjsLib !== 'undefined');
const pdfjsAvailable = typeof pdfjsLib !== 'undefined';

if (pdfjsAvailable) {
  try {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
    console.log('pdf.js worker src set to:', pdfjsLib.GlobalWorkerOptions.workerSrc);
  } catch (e) {
    console.warn('pdf.js worker setup failed:', e);
  }
} else {
  console.error('pdf.js NOT loaded — check CDN URL. Attempted: https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js');
}

async function extractTextFromPdf(pdfData) {
  if (!pdfjsAvailable) throw new Error('pdf.js library not loaded');
  console.log('extractTextFromPdf called, data length:', pdfData.byteLength);
  const pdf = await pdfjsLib.getDocument({ data: pdfData.slice() }).promise;
  console.log('PDF loaded, pages:', pdf.numPages);
  const lines = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const tc = await page.getTextContent();
    const byY = {};

    for (const item of tc.items) {
      const y = Math.round(item.transform[5]);
      if (!byY[y]) byY[y] = [];
      byY[y].push({ text: item.str, x: item.transform[4] });
    }

    const ySorted = Object.keys(byY).sort((a, b) => Number(b) - Number(a));
    for (const y of ySorted) {
      byY[y].sort((a, b) => a.x - b.x);
      lines.push(byY[y].map(l => l.text).join(''));
    }
  }

  return cleanText(lines.join('\n'));
}

function cleanText(raw) {
  if (!raw) return '';
  let s = raw;
  // Remove control chars (keep \n)
  s = s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
  // Remove isolated short lines
  let lines = s.split('\n').map(l => l.trim()).filter(l => l.length >= 2 || l.length === 0);
  s = lines.join('\n');
  // Normalize whitespace
  s = s.replace(/[^\S\n]+/g, ' ');
  // Remove excessive blank lines
  s = s.replace(/\n{3,}/g, '\n\n');
  // Fix spaced-out uppercase letters
  s = s.replace(/(\b[A-Z])\s+(?=[A-Z]\b)/g, '$1');
  return s.trim();
}

// ===================== PDF PAGE RENDER (preview) =====================
async function renderPdfPreview(pdfData, pageNum, scale = 1.5) {
  if (!pdfjsAvailable) throw new Error('pdf.js library not loaded');
  const pdf = await pdfjsLib.getDocument({ data: pdfData.slice() }).promise;
  const page = await pdf.getPage(pageNum);
  const viewport = page.getViewport({ scale });

  const container = document.createElement('div');
  container.style.cssText = `position:relative;width:${viewport.width}px;height:${viewport.height}px;margin:0 auto`;

  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext('2d');
  await page.render({ canvasContext: ctx, viewport }).promise;
  container.appendChild(canvas);

  const textLayer = document.createElement('div');
  textLayer.className = 'pdf-text-layer';
  textLayer.style.cssText = `position:absolute;top:0;left:0;width:${viewport.width}px;height:${viewport.height}px;overflow:hidden`;

  const textContent = await page.getTextContent();
  for (const item of textContent.items) {
    const span = document.createElement('span');
    span.textContent = item.str;
    span.dataset.text = item.str;
    const tx = item.transform;
    const fontSize = Math.round(tx[0] * scale * 100) / 100;
    const x = Math.round(tx[4] * scale);
    const y = Math.round(viewport.height - tx[5] * scale - fontSize);
    span.style.cssText = `position:absolute;left:${x}px;top:${y}px;font-size:${fontSize}px;font-family:sans-serif;color:transparent;white-space:pre;pointer-events:auto;user-select:text`;
    textLayer.appendChild(span);
  }

  container.appendChild(textLayer);
  return { canvas, container, numPages: pdf.numPages, pageNum, scale };
}

// ===================== OPENROUTER API =====================
const HARDCODED_MODELS = [
  { id: 'deepseek/deepseek-chat', name: 'DeepSeek V3 (best accuracy)', pricing: { prompt: '0.27', completion: '1.10' } },
  { id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini (fast fallback)', pricing: { prompt: '0.15', completion: '0.60' } },
  { id: 'openai/gpt-4.1-nano', name: 'GPT-4.1 Nano (cheapest)', pricing: { prompt: '0.10', completion: '0.40' } },
  { id: 'google/gemini-2.0-flash-exp', name: 'Gemini 2.0 Flash (free)', pricing: { prompt: '0', completion: '0' } },
];

async function fetchFreeModels(apiKey) {
  const headers = {};
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

  const resp = await fetch(`${OPENROUTER_BASE}/models`, { headers });
  if (!resp.ok) throw new Error(`OpenRouter returned ${resp.status}`);
  const data = await resp.json();
  const list = data.data || [];
  return list
    .filter(m => m.id)
    .sort((a, b) => a.name?.localeCompare(b.name));
}

function buildPromptText(pdfText) {
  if (!pdfText) return '';
  const MAX = 12000;
  if (pdfText.length <= MAX) return pdfText;
  // Keep the beginning (identity fields) AND guarantee the PRIME/pricing section is included.
  const head = pdfText.slice(0, 8000);
  const primeRe = /^\s*(?:[IVX]{1,4}\s*[-–—:]\s*)?PRIME\s*:?\s*$/m;
  const m = pdfText.match(primeRe);
  if (m && m.index > 8000) {
    const tail = pdfText.slice(m.index, Math.min(m.index + 4000, pdfText.length));
    return head + '\n...\n' + tail;
  }
  return pdfText.slice(0, MAX);
}

async function callOpenRouter(pdfText, category) {
  const fieldNames = getFieldsForCategory(category);
  const truncated = buildPromptText(pdfText);

  const prompt = `Extract data from a Moroccan ${category} insurance contract (Allianz/Sanlam).

Return EXACTLY this JSON with these EXACT keys (use null if not found):
${JSON.stringify(Object.fromEntries(fieldNames.map(f => [f, 'value'])), null, 2)}

RULES — Follow exactly:

CRITICAL — Distinguish these codes carefully:
- Police Num = CONTRACT/POLICY number. Look near 'N° Police', 'Police N°', 'N° police'. NEVER use the word "Attestation" as Police Num — an attestation is the document, not the policy number (e.g. N° Police "33B5795", N° Attestation "203472207" are DIFFERENT values).
- Attestation = the attestation/certificate number. Look near 'N° Attestation'. Only fill when the document is an attestation (often the header of these short-form auto contracts).
- N° Client / N° Souscripteur = CLIENT identifier (e.g. 5558134). Look near 'N° Client', 'N° Souscripteur', 'Numéro client'. Can be alphanumeric like MG1401.
- Code Intermédiaire = SHORT intermediary code (3-8 digits). NOT a long description or name.
- CIN = National ID card number. Format: 1-2 letters followed by 4-10 digits (e.g. EE123456, A123456). Never a word like 'traitant', 'cabinet', 'gérant'.
- Téléphone = 10-digit Moroccan phone starting with 0. If looks like phone (06xx, 07xx, 05xx), put in Téléphone, NOT Police Num.

NAMES — CLIENT vs INTERMEDIARY vs CONDUCTEUR (very important in these attestation formats):
- The "Intermédiaire" (broker/agent, e.g. "AKRAM EL KASSAD ASSURANCES SARL") is the intermediary, NOT the client.
- Souscripteur and Nom Assuré = the CLIENT (the person/company being insured), e.g. "Mme AMAQRAN Dounya".
- Use the name under the "Souscripteur" block first. If that block is absent or empty, use "Propriétaire du Véhicule". ONLY use "Conducteur Habituel" when neither Souscripteur nor Propriétaire du Véhicule is available.
- CRITICAL: "Conducteur Habituel" may be a DIFFERENT person than the client (e.g. Souscripteur "SAMMOU ALI", Conducteur habituel "SAMMOU MOHAMED"). Do NOT use the conducteur as Souscripteur/Nom Assuré when a Souscripteur/Propriétaire block exists.
- Date de Naissance = the CLIENT's birth date (the same person chosen for Souscripteur/Nom Assuré), NOT the conducteur's.
- NEVER use the intermediary's name as Souscripteur or Nom Assuré, even though it appears first in the document.

NUMBERS (Prime Totale TTC, Prime Nette, Taxes):
- Digits and dot only. NO currency (DH, MAD, dhs, €, $, Dirhams)
- Convert comma to dot: "10.000,00" → "10000.00" (remove thousand separators)
- MATH CHECK: Prime Totale TTC = Prime Nette + Taxes (+ small extras). TTC MUST be >= Prime Nette and >= Taxes. If your amounts break this, you picked the wrong numbers — re-read the text.
- In Allianz/Sanlam tables the amount often appears BEFORE its label on the same line:
  "1 411,20Prime nette"  → Prime Nette = 1411.20
  "208,42208,42Taxes"    → Taxes = 208.42 (the same number may repeat twice — use one copy)
  "Prime Total TTC 1 761,98 1 761,98" → Prime Totale TTC = 1761.98
  "1 198,00Prime TTC (en DH) :" → Prime Totale TTC = 1198.00
- The amount may also sit alone on the line just above or below its label — search nearby lines and pair each label with its nearest amount.
- NEVER use "prime minimale", "prime minimale de 10 000", "Prime nette annuelle minimale" or a franchise "minimum de X DH" as Prime Totale TTC — those are minimums/floors, NOT the total premium.
- Prime Nette: use the amount in the DÉCOMPTE DE PRIME À PAYER / payment section. NEVER use the "Total" row at the bottom of the garanties/primes table (e.g. "Total 4 760,70") as Prime Nette — use the nette inside the décompte (e.g. "4 409,05").
- Taxes = the labeled "Taxes"/"Taxes au comptant" amount, ALONE. Do NOT add "Taxe parafiscale FSEC" or anything else on top of it (e.g. "Taxes au comptant : 99,79" plus "Taxe parafiscale FSEC : 10,69" → Taxes = 99.79, NOT 110.48).
- ONLY if there is NO "Taxes"/"Taxes au comptant" label anywhere: use the "Taxe parafiscale au profit du FSEC" amount; when several tax lines exist (FSEC + Taxe NARSA), return their SUM (e.g. 773,09 + 115,74 = 888,83).
- Never use "Prime événements catastrophiques" or "Accessoires"/"Assistance" as Taxes.
- Round to at most 2 decimals (e.g. 208.4220842 is wrong — it is 208.42).

DATES:
- Date d'effet = START (earlier), Date d'échéance = END (later)
- CRITICAL: effet date MUST be earlier than échéance — swap if reversed
- Format: DD/MM/YYYY only
- When the text shows a date range spanning roughly one year, the earlier date is the effet and the later is the échéance. Beware pypdf column scrambling: verify dates against adjacent labels ("Date d'effet", "Date d'échéance", "Renouvelable").

PHONE:
- 10-digit Moroccan number starting with 0 (e.g. 0522499700)
- Digits only: remove spaces, +212, parentheses, hyphens
- If you see 9 digits, add leading 0

MONTANTS GARANTIS (per-guarantee amounts):
- Output amounts in the SAME ORDER as the Garanties list, one value per guarantee, comma-separated.
- Pair each amount with its own guarantee label. Example: "Bris d'enseignes | 10 000,00" → 10000.00, NOT 0.00. A trailing "0,00" next to a Garanti/Non-Garanti checkbox is NOT the amount.
- Never output 0.00 for a guarantee that has a real value.

FRANCHISES:
- Franchises are the "minimum de X DH" / "X% du montant des dommages" clauses in the guarantee table's Franchise column, or a "Franchise" section.
- Example: "Franchise | 15% du montant des dommages avec un minimum de 10 000 DH | Franchise | 15% du montant des dommages avec un minimum de 20 000 DH" → "15% du montant des dommages avec un minimum de 10000 DH, 15% du montant des dommages avec un minimum de 20000 DH".
- If the contract has franchise clauses, ALWAYS fill Franchises — do not leave it empty.

NAMES (Souscripteur, Nom Assuré): UPPERCASE
For ${category} contracts, Nom Assuré is often the same company as Souscripteur
- Output the name exactly as written. Do NOT merge checkbox/civil-status labels into the name:
  e.g. "Mme Mlle M. X Sté" followed by "CHARI DONIA" → "CHARI DONIA" (NOT "STÉCHARI DONIA"),
  "Sté" is a checkbox label meaning société, never part of the person's name.
- Only keep a legal suffix (SARL, SA, S.A.R.L) if it is actually part of the written company name.
- When the contract lists a company as "personne morale / Raison sociale" AND a separate individual "Nom et Prénom" (e.g. conducteur habituel), Souscripteur/Nom Assuré = the Raison sociale (the company), NOT the individual.
- Profession: always fill it when present (e.g. "CABINET DENTAIRE", "ENTREPRISE CONSTRUCTION"), even if it appears after the address.

Return ONLY the JSON object — no markdown, no explanation, no extra text.

Contract text:
${truncated}`;

  return openRouterRequest(prompt, fieldNames, 2000, 0);
}

// Second-pass: when the price math check fails, ask the model to focus ONLY on the
// three price fields and fix them from the contract text (temperature 0).
async function recheckPrices(fields, text, category) {
  const fieldNames = ['Prime Totale TTC', 'Prime Nette', 'Taxes'];
  const current = fieldNames.map(f => `${f}: ${fields[f] != null ? fields[f] : 'null'}`).join('\n');
  const prompt = `A Moroccan ${category} insurance contract (Allianz/Sanlam) was already partially extracted, but the amounts do NOT reconcile (Prime Totale TTC should equal Prime Nette + Taxes).

Current (possibly wrong) values:
${current}

From the contract text below, determine the CORRECT Prime Totale TTC, Prime Nette and Taxes.
Rules:
- Digits and dot only. No currency. Convert "10.000,00" → "10000.00".
- Prime Nette comes from the DÉCOMPTE DE PRIME À PAYER section, NEVER the "Total" row of the garanties table.
- Taxes = the labeled "Taxes"/"Taxes au comptant" amount ALONE (never add FSEC on top). Only when there is no such label, use FSEC (sum FSEC + NARSA when both exist).
- Prime Totale TTC must be >= Prime Nette and >= Taxes.

Return EXACTLY this JSON with these EXACT keys (use null if a value is genuinely absent):
${JSON.stringify(Object.fromEntries(fieldNames.map(f => [f, 'value'])), null, 2)}

Return ONLY the JSON object — no markdown, no extra text.

Contract text:
${buildPromptText(text)}`;

  const result = await openRouterRequest(prompt, fieldNames, 1000, 0);
  return Object.keys(result).length ? result : null;
}

async function openRouterRequest(prompt, fieldNames, maxTokens = 2000, temperature = 0) {
  const maxRetries = 2;
  let lastErr;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const resp = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${state.apiKey}`,
          'HTTP-Referer': window.location.origin,
          'X-Title': 'Cloud Extract'
        },
        body: JSON.stringify({
          model: state.model,
          messages: [{ role: 'user', content: prompt }],
          temperature,
          max_tokens: maxTokens
        })
      });

      if (!resp.ok) {
        const errText = await resp.text();
        const err = new Error(`OpenRouter error ${resp.status}: ${errText}`);
        err.statusCode = resp.status;
        throw err;
      }

      const data = await resp.json();
      const content = data.choices?.[0]?.message?.content || '';
      return parseJsonResponse(content, fieldNames);
    } catch (err) {
      lastErr = err;
      const status = err && err.statusCode;
      const noRetry = typeof status === 'number' && status >= 400 && status < 500;
      if (!noRetry && attempt < maxRetries) {
        const delay = (attempt + 1) * 1000;
        console.warn(`OpenRouter attempt ${attempt + 1} failed, retrying in ${delay}ms:`, err.message);
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }
  throw lastErr;
}

function parseJsonResponse(text, fieldNames) {
  // Strip markdown
  text = text.replace(/```(?:json)?\s*/g, '').replace(/```\s*/g, '').trim();
  const jsonStart = text.indexOf('{');
  const jsonEnd = text.lastIndexOf('}');
  if (jsonStart >= 0 && jsonEnd > jsonStart) {
    text = text.slice(jsonStart, jsonEnd + 1);
  }
  try {
    const parsed = JSON.parse(text);
    const result = {};
    for (const field of fieldNames) {
      const val = parsed[field];
      if (val !== null && val !== undefined && val !== '') {
        const str = Array.isArray(val) ? val.join(', ') : String(val);
        if (str.trim()) result[field] = str.trim();
      }
    }
    return result;
  } catch {
    return {};
  }
}

// ===================== FIELDS PER CATEGORY =====================
function getFieldsForCategory(category) {
  const extra = CATEGORY_FIELDS[category] || [];
  return [...FIELD_NAMES, ...extra];
}

function syncFieldOrder() {
  const expected = getFieldsForCategory(document.getElementById('categorySelect').value);
  // Add any missing expected fields at the end
  for (const f of expected) {
    if (!state.fieldOrder.includes(f)) state.fieldOrder.push(f);
  }
  // Remove fields no longer in the expected set
  state.fieldOrder = state.fieldOrder.filter(f => expected.includes(f));
}

// ===================== VALIDATION (ported from C#) =====================
function validateAndFix(fields) {
  // Clean numeric fields
  const cleanNumeric = (raw) => {
    let s = raw.replace(/\b(DH|MAD|dhs|Dhs|dh|€|\$|EUR|USD)\b/gi, '');
    s = s.replace(/(\d)\s+(?=\d)/g, '$1');
    s = s.replace(',', '.');
    s = s.replace(/[^0-9.\-]/g, '');
    return s.trim();
  };

  for (const field of NUMERIC_FIELDS) {
    if (fields[field]) {
      const cleaned = cleanNumeric(fields[field]);
      if (cleaned !== fields[field]) {
        fields[field] = cleaned;
      }
      // Round over-precise values (model artifact from mashed text, e.g. "208.4220842", "0.0000") to 2 decimals
      const f = parseFloat(fields[field]);
      if (!isNaN(f) && (Math.abs(f) > 0.0005 || f === 0) && String(fields[field]).replace(/\s/g, '').match(/[.,](\d+)/)?.[1].length > 2) {
        fields[field] = String(Math.round(f * 100) / 100);
      }
    }
  }

  // Date swap
  if (fields["Date d'effet"] && fields["Date d'échéance"]) {
    const parseDate = (s) => {
      const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
      return m ? new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1])) : null;
    };
    const dEffet = parseDate(fields["Date d'effet"]);
    const dEcheance = parseDate(fields["Date d'échéance"]);
    if (dEffet && dEcheance && dEffet > dEcheance) {
      [fields["Date d'effet"], fields["Date d'échéance"]] = [fields["Date d'échéance"], fields["Date d'effet"]];
    }
  }

  // TTC >= Nette sanity
  if (fields['Prime Totale TTC'] && fields['Prime Nette']) {
    const ttc = parseFloat(fields['Prime Totale TTC']);
    const nette = parseFloat(fields['Prime Nette']);
    if (!isNaN(ttc) && !isNaN(nette) && ttc < nette) {
      [fields['Prime Totale TTC'], fields['Prime Nette']] = [fields['Prime Nette'], fields['Prime Totale TTC']];
    }
  }

  // Phone cleanup
  if (fields['Téléphone']) {
    let digits = fields['Téléphone'].replace(/\D/g, '');
    if (digits.length === 9 && digits[0] !== '0') {
      digits = '0' + digits;
    }
    if (digits.length >= 10) {
      fields['Téléphone'] = digits.slice(-10);
    }
  }

  // Phone hygiene: drop insurer boilerplate numbers and dummy placeholders (not the client's phone)
  if (fields['Téléphone']) {
    const digits = fields['Téléphone'].replace(/\D/g, '');
    const insurerPhones = ['0522499700', '0522420606', '0801001818', '0522225521', '0522957575', '0522957538', '0802057057'];
    if (insurerPhones.includes(digits) || /^060+$/.test(digits) || /^0{10}$/.test(digits)) {
      delete fields['Téléphone'];
    }
  }

  // Police Num: strip placeholder-only values (PDFs with literal "....." fields)
  if (fields['Police Num'] && /^[.\-—_•\s]+$/.test(fields['Police Num'])) {
    delete fields['Police Num'];
  }

  // Police Num: "Attestation" is the document type, not a policy number
  if (fields['Police Num'] && /^attestation$/i.test(fields['Police Num'].trim())) {
    delete fields['Police Num'];
  }

  // Adresse: drop trailing column labels glued by pypdf (e.g. "... agadir ICE")
  if (fields['Adresse']) {
    fields['Adresse'] = fields['Adresse'].replace(/\s+ICE\s*$/i, '').trim();
  }

  // Normalize mangled degree sign (OCR artifact "N?12" -> "N°12")
  for (const field of ['Adresse', 'Souscripteur', 'Nom Assuré', 'Profession']) {
    if (fields[field] && fields[field].includes('N?')) {
      fields[field] = fields[field].replace(/N\?(\d)/g, 'N°$1');
    }
  }

  // Split "STÉ" glued onto a name (checkbox "Sté" + person name, e.g. "STÉCHARI DONIA" -> "CHARI DONIA")
  for (const field of ['Souscripteur', 'Nom Assuré']) {
    if (fields[field] && /^STÉ(?=[A-Z]{2,})/.test(fields[field])) {
      fields[field] = fields[field].replace(/^STÉ/, '');
    }
  }
}

function crossValidateAndFill(fields, pdfText) {
  if (!pdfText) return;
  const fullText = pdfText.replace(/\n/g, ' ').replace(/\r/g, ' ');

  // 1. Police Num
  let policeVal = null;
  let policeMatch = fullText.match(/(?:Police\s*N[°o]\s*:?|N[°o]\s*Police\s*:?)\s*([A-Z0-9\-/]{3,25})/i);
  if (!policeMatch) {
    policeMatch = fullText.match(/Noms\s*[|]?\s*([A-Z0-9]{4,20}?)\s*Dur[eé]e|([A-Z0-9]{5,12})\s*Dur[eé]e\s*Trimestrielle/i);
  }
  if (policeMatch) {
    policeVal = (policeMatch[1] || policeMatch[2] || '').trim();
    if (policeVal) fields['Police Num'] = policeVal;
  } else {
    // Try CONTRAT N°
    const contratMatch = fullText.match(/CONTRAT\s*N[°o]\s*:?\s*([A-Z0-9\-./]{3,30})/i);
    if (contratMatch) {
      policeVal = contratMatch[1].trim();
      if (policeVal) fields['Police Num'] = policeVal;
    } else if (fields['Police Num']) {
      // Phone check
      const digits = fields['Police Num'].replace(/\D/g, '');
      if (digits.length >= 7 && digits.length <= 10 && !fields['Téléphone']) {
        fields['Téléphone'] = fields['Police Num'];
        delete fields['Police Num'];
      }
    }
  }

  if (fields['Police Num'] && /^attestation$/i.test(fields['Police Num'].trim())) {
    delete fields['Police Num'];
  }

  // 1b. Attestation number (short-form auto attestation documents)
  if (!fields['Attestation']) {
    const attM = fullText.match(/N[°o]\s*Attestation\s*:?\s*(\d{4,20})/i);
    if (attM) fields['Attestation'] = attM[1];
  }

  // 1c. N° Souscripteur -> N° Client (attestation format uses "N° Souscripteur")
  if (!fields['N° Client']) {
    const subM = fullText.match(/N[°o]\s*Souscripteur\s*:?\s*([A-Z0-9\-/]{3,20})/i);
    if (subM) fields['N° Client'] = subM[1];
  }

  // 2. Regex-fill null fields (non-price fields)
  const patterns = {
    "N° Client": /N[°o]\s*Client\s*:?\s*([A-Z0-9\-/]{3,20})/i,
    "CIN": /(?:N[°o]\s+CIN\b|CIN\s*:|Carte\s+identité)\s*:?\s*([A-Z]{1,2}\d{4,10})/i,
    "Téléphone": /(?:T[eé]l[eé]?phone|Tél|Mobile)\s*:?\s*([\d\s\-+]{8,15})/i,
    "Code Intermédiaire": /Code\s*Int[eé]rm[eé]diaire\s*:?\s*(\d{4,10})/i
  };

  for (const [field, pattern] of Object.entries(patterns)) {
    if (!fields[field]) {
      const match = fullText.match(pattern);
      if (match && match[1]) {
        let value = match[1].trim().replace(/\s{2,}/g, ' ').replace(/[.:,;]+$/, '');
        if (value.length >= 2) fields[field] = value;
      }
    }
  }

  // 2b. Price fields: fill nulls or override implausible values (Allianz mashed tables)
  fillPriceFields(fields, fullText);

  // 3. Code Intermédiaire: fix long descriptions
  if (fields['Code Intermédiaire'] && (fields['Code Intermédiaire'].length > 15 || fields['Code Intermédiaire'].toUpperCase().includes('ALLIANZ'))) {
    const m = fullText.match(/Code\s*Int[eé]rm[eé]diaire\s*:?\s*(\d{4,10})/i);
    if (m) fields['Code Intermédiaire'] = m[1];
  }

  // 4. Nom Assuré: copy from Souscripteur if null
  if (!fields['Nom Assuré'] && fields['Souscripteur']) {
    fields['Nom Assuré'] = fields['Souscripteur'];
  }

  // 5. CIN: validate format
  if (fields['CIN'] && !/^[A-Z]{1,2}\d{4,10}$/i.test(fields['CIN'])) {
    delete fields['CIN'];
  }

  // 6. Téléphone: validate 10 digits starting with 0
  if (fields['Téléphone']) {
    const telDigits = fields['Téléphone'].replace(/\D/g, '');
    if (telDigits.length !== 10 || telDigits[0] !== '0') {
      delete fields['Téléphone'];
    }
  }
}

// ===================== PRICE REGEX FILL (Allianz mashed tables) =====================
function toNum(raw) {
  if (raw == null) return NaN;
  let s = String(raw).replace(/\b(DH|MAD|dhs|Dhs|dh|€|\$|EUR|USD)\b/gi, '');
  s = s.replace(/(\d)\s+(?=\d)/g, '$1');
  s = s.replace(',', '.');
  s = s.replace(/[^0-9.\-]/g, '');
  return parseFloat(s);
}

function priceIsPlausible(field, val, fields) {
  if (isNaN(val) || val < 0) return false;
  const nette = toNum(fields['Prime Nette']);
  const taxes = toNum(fields['Taxes']);
  const ttc = toNum(fields['Prime Totale TTC']);
  if (field === 'Prime Totale TTC') {
    if (!isNaN(nette) && nette > 0 && val < nette) return false;
    if (!isNaN(nette) && !isNaN(taxes) && nette > 0 && taxes > 0 && val < nette + taxes) return false;
    return true;
  }
  if (field === 'Prime Nette') {
    if (!isNaN(ttc) && ttc > 0 && val > ttc) return false;
    if (!isNaN(ttc) && ttc > 0 && val < ttc * 0.1) return false;
    return true;
  }
  if (field === 'Taxes') {
    if (!isNaN(ttc) && ttc > 0 && val > ttc) return false;
    return true;
  }
  return true;
}

function fillPriceFields(fields, fullText) {
  // Number pattern for one French-format amount: "1 411,20", "208,42", "7 250,00", "1761,98"
  // (thousands separator may be space, NBSP, dot, or comma — or absent)
  const AMT = '(?:\\d{1,3}(?:[ ,.\\u00A0]\\d{3})*(?:,\\d{1,2})?|\\d{4,6}(?:,\\d{1,2})?)';

  const strongTtc = [
    /(?:Prime\s*Totale\s*TTC|Prime\s*Total\s*TTC|Total\s*TTC|Prime\s*TTC|Net\s*à\s*payer)\s*:?\s*([\d\s,.]+)\s*(?:DH|MAD|dhs)?/i,
    new RegExp(`(${AMT})\\s{0,2}(?:DH|MAD|dhs)?\\s{0,2}Prime\\s*(?:Totale\\s*)?TTC\\b`, 'i')
  ];
  const netteRe = [
    /(?:Prime\s*Nette|Prime\s*Hors\s*[Tt]axe|Prime\s*pure)\s*:?\s*([\d\s,.]+)\s*(?:DH|MAD|dhs)?/i,
    new RegExp(`(${AMT})\\s{0,2}(?:DH|MAD|dhs)?\\s{0,2}Prime\\s*[Nn]ette\\b`, 'i')
  ];
  const taxesRe = [
    /(?:Taxes\s*au\s*comptant|Taxes?\b(?!\s*parafiscale))\s*:?\s*([\d\s,.]+)\s*(?:DH|MAD|dhs)?/i,
    new RegExp(`(${AMT})\\s{0,2}(?:DH|MAD|dhs)?\\s{0,2}Taxes?\\b(?!\\s*parafiscale)`, 'i')
  ];
  const auComptantRe = [
    new RegExp(`Prime\\s*au\\s*comptant\\s*(?:\\([^)]*\\))?\\s*:?\\s*(${AMT})`, 'i'),
    new RegExp(`(${AMT})\\s{0,2}(?:DH|MAD|dhs)?\\s{0,2}Prime\\s*au\\s*comptant\\b`, 'i')
  ];

  const isTtcTrap = () => {
    const cur = toNum(fields['Prime Totale TTC']);
    if (isNaN(cur)) return false;
    const trap = fullText.match(new RegExp(`(?:minimum|minimale|minimal)\\s+de\\s*(${AMT})`, 'i'));
    return !!trap && !isNaN(toNum(trap[1])) && Math.abs(toNum(trap[1]) - cur) < 0.01;
  };

  const fill = (field, regexes) => {
    const current = toNum(fields[field]);
    const plausible = priceIsPlausible(field, current, fields);
    const trapped = field === 'Prime Totale TTC' && isTtcTrap();
    if (fields[field] && plausible && !trapped) return;
    for (const re of regexes) {
      const m = fullText.match(re);
      if (!m || m[1] == null) continue;
      const cand = toNum(m[1]);
      if (!priceIsPlausible(field, cand, fields)) continue;
      fields[field] = String(Math.round(cand * 100) / 100);
      return;
    }
  };

  const trappedTtc = isTtcTrap();
  // Stage 1: reliable "Prime TTC" labels (label-first or mashed value-first)
  fill('Prime Totale TTC', strongTtc);
  // Stage 2: "Prime au comptant" = total payable (fees+taxes included) — used when no reliable TTC label
  if (!fields['Prime Totale TTC'] || trappedTtc || !priceIsPlausible('Prime Totale TTC', toNum(fields['Prime Totale TTC']), fields)) {
    fill('Prime Totale TTC', auComptantRe);
  }
  // Stage 3: nette & taxes with TTC as anchor
  fill('Prime Nette', netteRe);
  fill('Taxes', taxesRe);
}

// Math check: TTC should ≈ Nette + Taxes. Returns true when consistent.
// Allianz/Sanlam contracts legitimately add Accessoires/FSEC/catastrophiques on top,
// so rows with an "Accessoires" line in the text are trusted unless the gap is extreme.
function checkPriceConsistency(fields, fullText) {
  const ttc = toNum(fields['Prime Totale TTC']);
  const nette = toNum(fields['Prime Nette']);
  const taxes = toNum(fields['Taxes']);
  if (isNaN(ttc) || isNaN(nette) || ttc <= 0 || nette <= 0) return true;
  // Trap: Prime Nette must not be the "Total" row of the garanties/primes table
  if (fullText) {
    const totalM = fullText.match(/Total\s+([\d\s.,]+)/i);
    if (totalM && !isNaN(toNum(totalM[1])) && Math.abs(toNum(totalM[1]) - nette) < 0.01) return false;
  }
  const gap = Math.abs(ttc - nette - (isNaN(taxes) ? 0 : taxes));
  if (gap <= Math.max(1, ttc * 0.05)) return true;
  if (fullText && /Accessoires\b/i.test(fullText) && gap <= ttc * 0.2) return true;
  return false;
}

// ===================== EXTRACTION PIPELINE =====================
async function detectCategory(text) {
  if (!state.apiKey || !state.model) return null;
  const catList = CATEGORIES.map(([val, label]) => `${val}: ${label}`).join('\n');
  const prompt = `Classify this insurance contract into exactly one category:\n${catList}\n\nReturn ONLY the category code (e.g., "RC", "AT", "AUTO", "Habitation", "Individuelle Accidents", "Schengen Visa") — no explanation.\n\nContract text:\n${text.slice(0, 2000)}`;

  try {
    const resp = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${state.apiKey}`,
        'HTTP-Referer': window.location.origin,
        'X-Title': 'Cloud Extract'
      },
      body: JSON.stringify({
        model: state.model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0,
        max_tokens: 20
      })
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    const result = (data.choices?.[0]?.message?.content || '').trim().replace(/^["']|["']$/g, '');
    const match = CATEGORIES.find(([val]) => val === result);
    return match ? match[0] : null;
  } catch {
    return null;
  }
}

async function extractSingle(pdfData, fileName, category) {
  console.log('extractSingle:', fileName, 'pdfData type:', typeof pdfData, 'length:', pdfData?.byteLength);
  const text = await extractTextFromPdf(pdfData);
  console.log('extractSingle text length:', text?.length);

  // Auto-detect category from text
  const detected = await detectCategory(text);
  if (detected && detected !== category) {
    console.log(`Category auto-detected: ${category} -> ${detected}`);
    category = detected;
  }

  let fields = {};
  let rawResponse = '';
  let method = 'regex';
  let aiError = '';

  if (state.apiKey && state.model) {
    try {
      const result = await callOpenRouter(text, category);
      fields = result;
      method = 'OpenRouter';
    } catch (err) {
      aiError = (err && err.message) ? err.message.slice(0, 300) : String(err);
      console.warn('OpenRouter failed, using regex fallback:', err);
    }
  }

  if (Object.keys(fields).length === 0) {
    fields = regexExtract(text, category);
    method = 'regex';
  }

  // Validate
  validateAndFix(fields);
  crossValidateAndFill(fields, text);
  validateAndFix(fields);

  let priceWarning = !checkPriceConsistency(fields, text);

  // Second-pass: re-ask for just the price fields when they don't reconcile
  if (priceWarning && method === 'OpenRouter' && state.apiKey && state.model) {
    try {
      const fix = await recheckPrices(fields, text, category);
      if (fix) {
        let changed = false;
        for (const f of ['Prime Totale TTC', 'Prime Nette', 'Taxes']) {
          if (fix[f] && fix[f] !== fields[f]) {
            fields[f] = fix[f];
            changed = true;
          }
        }
        if (changed) {
          validateAndFix(fields);
          priceWarning = !checkPriceConsistency(fields, text);
        }
      }
    } catch (err) {
      console.warn('Price recheck failed, keeping first-pass values:', err.message);
    }
  }

  return { fields, rawResponse, method, text, category, aiError, priceWarning };
}

function cleanLabeledValue(val) {
  return val
    .replace(/^(?:Nom\s*et\s*pr[eé]nom\s*ou\s*raison\s*sociale|Raison\s*sociale|D[eé]signation\s+(?:ou\s+nom)?|Nom)\s*:?\s*/i, '')
    .replace(/^(?:de\s+)?(?:l['’\u2019])?interm[eé]diaire\s*:?\s*/i, '')
    .trim();
}

function regexExtract(text, category) {
  // Basic regex fallback (port of FieldExtractor.Extract)
  const fields = {};
  const patterns = {
    "Police Num": /(?:Police\s*N[°o]\s*:?|N[°o]\s*Police\s*:?)\s*([A-Z0-9\-/]{3,25})/i,
    "Attestation": /N[°o]\s*Attestation\s*:?\s*(\d{4,20})/i,
    "Souscripteur": /Souscripteur\s*:?\s*(.+)/i,
    "Adresse": /Adresse\s*:?\s*(.+)/i,
    "Date d'effet": /Date\s*d['e]ffet\s*:?\s*(\d{2}\/\d{2}\/\d{4})/i,
    "Date d'échéance": /Date\s*d['e]chéance\s*:?\s*(\d{2}\/\d{2}\/\d{4})/i,
    "Code Intermédiaire": /Code\s*Int[eé]rm[eé]diaire\s*:?\s*(\d{4,10})/i,
    "N° Client": /N[°o]\s*Client\s*:?\s*([A-Z0-9\-/]{3,20})/i
  };

  for (const [field, pattern] of Object.entries(patterns)) {
    const match = text.match(pattern);
    if (match && match[1]) {
      let val = match[1].trim();
      if (field === 'Souscripteur' || field === 'Adresse') {
        val = cleanLabeledValue(val);
      }
      if (val.length >= 2) fields[field] = val;
    }
  }

  const catExtra = CATEGORY_FIELDS[category] || [];
  for (const extra of catExtra) {
    const pattern = new RegExp(`${extra}\\s*:?\\s*(.+)`, 'i');
    const match = text.match(pattern);
    if (match && match[1]) fields[extra] = cleanLabeledValue(match[1]);
  }

  return fields;
}

// ===================== EXPORT =====================
function exportToXlsx(contracts, columns) {
  const data = buildExportData(contracts, columns);
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Contracts');
  XLSX.writeFile(wb, `export_${new Date().toISOString().slice(0,19).replace(/[:-]/g, '')}.xlsx`);
}

function exportToCsv(contracts, columns) {
  exportToCsvNamed(contracts, columns, `export_${new Date().toISOString().slice(0,19).replace(/[:-]/g, '')}.csv`);
}

function exportToCsvNamed(contracts, columns, downloadName) {
  const data = buildExportData(contracts, columns);
  const ws = XLSX.utils.json_to_sheet(data);
  const csv = XLSX.utils.sheet_to_csv(ws);
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = downloadName;
  a.click();
  URL.revokeObjectURL(url);
}

function exportSingleContract(contract) {
  const columns = [...state.visibleFields].filter(f => contract.fields[f]);
  const base = (contract.fileName || 'export').replace(/\.pdf$/i, '').replace(/[\\/:*?"<>|]/g, '_');
  exportToCsvNamed([contract], columns, `${base}.csv`);
}

function buildExportData(contracts, columns) {
  return contracts.map(c => {
    const row = { 'File Name': c.fileName || '' };
    for (const col of columns) {
      row[col] = c.fields[col] || '';
    }
    return row;
  });
}

// ===================== UI =====================
function showStatus(msg, type = 'info', progress = -1) {
  const bar = document.getElementById('statusBar');
  const text = document.getElementById('statusText');
  const wrap = document.getElementById('progressWrap');
  const pbar = document.getElementById('progressBar');

  bar.className = `alert alert-${type} py-2 mb-3`;
  text.textContent = msg;
  bar.classList.remove('d-none');

  if (progress >= 0) {
    wrap.classList.remove('d-none');
    pbar.style.width = `${progress}%`;
  } else {
    wrap.classList.add('d-none');
  }

  if (bar._dismissTimer) clearTimeout(bar._dismissTimer);
  if (type === 'success') {
    bar._dismissTimer = setTimeout(hideStatus, 5000);
  }
}

function hideStatus() {
  const bar = document.getElementById('statusBar');
  bar.classList.add('d-none');
  if (bar._dismissTimer) clearTimeout(bar._dismissTimer);
}

function updateExtractBtn() {
  const btn = document.getElementById('extractBtn');
  const count = state.contracts.filter(c => c.method === 'pending' || c.method === 'regex' || c.method === 'error').length;
  btn.innerHTML = `<i class="bi bi-magic"></i> Extract${count ? ` (${count})` : ''}`;
  btn.disabled = state.contracts.length === 0;
}

async function refreshModelList() {
  const select = document.getElementById('modelSelect');
  select.innerHTML = '<option value="">Loading...</option>';

  // Use key from the input field (might be unsaved)
  const apiKey = document.getElementById('apiKeyInput').value.trim() || state.apiKey;

  let models = [];
  try {
    models = await fetchFreeModels(apiKey);
  } catch {
    // Fall back to hardcoded list
  }

  if (!models || models.length === 0) {
    models = HARDCODED_MODELS;
  }

  select.innerHTML = '<option value="">Select a model...</option>';
  for (const m of models) {
    const opt = document.createElement('option');
    opt.value = m.id;
    const pricing = m.pricing ? ` (prompt: ${m.pricing.prompt != null ? m.pricing.prompt : '?'})` : '';
    opt.textContent = `${m.name || m.id}${pricing}`;
    select.appendChild(opt);
  }
  if (state.model) select.value = state.model;

  // Show pricing for selected model
  updateModelPricing();
}

function updateModelPricing() {
  const select = document.getElementById('modelSelect');
  const pricing = document.getElementById('modelPricing');
  const selected = select.options[select.selectedIndex];
  pricing.textContent = selected && selected.value ? `Selected: ${selected.textContent}` : '';
}

function updateFieldToggleList() {
  const body = document.getElementById('fieldToggleBody');
  const allFields = getFieldsForCategory(document.getElementById('categorySelect').value);

  syncFieldOrder();
  const ordered = allFields.sort((a, b) => {
    const ai = state.fieldOrder.indexOf(a);
    const bi = state.fieldOrder.indexOf(b);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });

  let html = '<div class="mb-2 d-flex gap-2">';
  html += '<button class="btn btn-outline-primary btn-sm" id="selectAllFields">Select All</button>';
  html += '<button class="btn btn-outline-secondary btn-sm" id="deselectAllFields">Deselect All</button>';
  html += '</div>';
  for (const field of ordered) {
    const checked = state.visibleFields.has(field) ? 'checked' : '';
    html += `<div class="form-check field-order-item" draggable="true" data-field="${field}">
      <span class="drag-handle" title="Drag to reorder"><i class="bi bi-grip-vertical"></i></span>
      <input class="form-check-input field-toggle" type="checkbox" value="${field}" id="toggle_${field}" ${checked}>
      <label class="form-check-label" for="toggle_${field}">${field}</label>
    </div>`;
  }
  body.innerHTML = html;

  document.querySelectorAll('.field-toggle').forEach(cb => {
    cb.addEventListener('change', () => {
      if (cb.checked) state.visibleFields.add(cb.value);
      else state.visibleFields.delete(cb.value);
      renderTable();
    });
  });

  // Re-register Select All / Deselect All since we replaced their DOM
  document.getElementById('selectAllFields')?.addEventListener('click', () => {
    document.querySelectorAll('.field-toggle').forEach(cb => { cb.checked = true; state.visibleFields.add(cb.value); });
    renderTable();
  });
  document.getElementById('deselectAllFields')?.addEventListener('click', () => {
    document.querySelectorAll('.field-toggle').forEach(cb => { cb.checked = false; state.visibleFields.delete(cb.value); });
    renderTable();
  });

  // Drag-and-drop reordering
  let dragSrc = null;
  document.querySelectorAll('.field-order-item').forEach(item => {
    item.addEventListener('dragstart', e => {
      dragSrc = item;
      item.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', item.dataset.field);
    });
    item.addEventListener('dragend', () => {
      item.classList.remove('dragging');
      document.querySelectorAll('.field-order-item').forEach(i => i.classList.remove('drag-over'));
    });
    item.addEventListener('dragover', e => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      document.querySelectorAll('.field-order-item').forEach(i => i.classList.remove('drag-over'));
      item.classList.add('drag-over');
    });
    item.addEventListener('dragleave', () => {
      item.classList.remove('drag-over');
    });
    item.addEventListener('drop', e => {
      e.preventDefault();
      if (!dragSrc || dragSrc === item) return;
      const all = [...document.querySelectorAll('.field-order-item')];
      const fromIdx = all.indexOf(dragSrc);
      const toIdx = all.indexOf(item);
      if (fromIdx === -1 || toIdx === -1) return;
      const field = dragSrc.dataset.field;
      state.fieldOrder = state.fieldOrder.filter(f => f !== field);
      state.fieldOrder.splice(toIdx < fromIdx ? toIdx : toIdx - 1, 0, field);
      saveToStorage();
      renderTable();
      updateFieldToggleList();
    });
  });
}

function renderTable() {
  const head = document.getElementById('tableHead');
  const body = document.getElementById('tableBody');
  const wrap = document.getElementById('tableWrap');
  const empty = document.getElementById('resultsWrap');

  const query = document.getElementById('searchInput').value.toLowerCase().trim();
  const filtered = query
    ? state.contracts.filter(c =>
        c.fileName.toLowerCase().includes(query) ||
        Object.values(c.fields).some(v => String(v).toLowerCase().includes(query))
      )
    : state.contracts;

  let visible = [...state.visibleFields].filter(f =>
    filtered.some(c => c.fields[f])
  );
  // Apply user-defined field order
  if (state.fieldOrder.length > 0) {
    visible.sort((a, b) => {
      const ai = state.fieldOrder.indexOf(a);
      const bi = state.fieldOrder.indexOf(b);
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    });
  }

  if (filtered.length === 0 || visible.length === 0) {
    empty.classList.remove('d-none');
    wrap.classList.add('d-none');
    document.getElementById('exportBtn').disabled = true;
    document.getElementById('clearBtn').disabled = state.contracts.length === 0;
    updateExtractBtn();
    return;
  }

  empty.classList.add('d-none');
  wrap.classList.remove('d-none');
  document.getElementById('exportBtn').disabled = filtered.length === 0;
  document.getElementById('clearBtn').disabled = false;

  // Header
  const sortIcon = f => state.sortField === f ? (state.sortAsc ? ' ▲' : ' ▼') : '';
  head.innerHTML = '<tr><th></th><th style="cursor:pointer" data-sort="fileName">File' + sortIcon('fileName') + '</th>' +
    '<th style="cursor:pointer" data-sort="category">Category' + sortIcon('category') + '</th>' +
    '<th style="cursor:pointer" data-sort="method">Method' + sortIcon('method') + '</th>' +
    visible.map(f => `<th style="cursor:pointer" data-sort="${f}">${f}${sortIcon(f)}</th>`).join('') + '<th></th></tr>';

  // Sort
  let sorted = filtered;
  if (state.sortField) {
    sorted = [...filtered].sort((a, b) => {
      let va = state.sortField === 'fileName' ? a.fileName : state.sortField === 'category' ? a.category : state.sortField === 'method' ? a.method : a.fields[state.sortField] || '';
      let vb = state.sortField === 'fileName' ? b.fileName : state.sortField === 'category' ? b.category : state.sortField === 'method' ? b.method : b.fields[state.sortField] || '';
      const numA = parseFloat(va), numB = parseFloat(vb);
      if (!isNaN(numA) && !isNaN(numB)) return state.sortAsc ? numA - numB : numB - numA;
      return state.sortAsc ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va));
    });
  }

  // Body
  body.innerHTML = sorted.map((c, i) => {
    const catOptions = CATEGORIES.map(([val, label]) =>
      `<option value="${val}"${c.category === val ? ' selected' : ''}>${label}</option>`
    ).join('');
    const fields = visible.map(f =>
      (c.fields[f] || '')
        ? `<span class="editable-field" data-file="${esc(c.fileName)}" data-field="${esc(f)}" contenteditable>${esc(c.fields[f])}</span>`
        : '<span class="text-muted">—</span>'
    ).join('</td><td>');
    return `<tr>
      <td>${i + 1}</td>
      <td class="text-nowrap"><small>${esc(c.fileName)}</small></td>
      <td><select class="form-select form-select-sm cat-select" data-file="${esc(c.fileName)}" style="min-width:160px">${catOptions}</select></td>
      <td><span class="badge bg-${c._extracting ? 'warning' : c.method === 'OpenRouter' ? 'success' : 'secondary'}" title="${c._extracting ? 'Extracting...' : c.aiError ? esc(c.aiError) : ''}">${c._extracting ? 'Extracting...' : c.aiError && c.method !== 'OpenRouter' ? 'regex (AI fail)' : esc(c.method)}</span>${!c._extracting && c.method !== 'error' && c.priceWarning ? ' <span class="badge bg-warning text-dark" title="TTC does not match Nette + Taxes — verify manually">review</span>' : ''}</td>
      <td>${fields}</td>
      <td class="text-nowrap d-flex gap-1">
        <button class="btn btn-sm btn-outline-info preview-btn" data-file="${esc(c.fileName)}" title="Preview PDF"><i class="bi bi-eye"></i></button>
        ${c.method === 'OpenRouter' ? `<button class="btn btn-sm btn-outline-secondary reextract-btn" data-file="${esc(c.fileName)}" title="Re-extract"><i class="bi bi-arrow-clockwise"></i></button>` : `<button class="btn btn-sm btn-primary extract-one-btn" data-file="${esc(c.fileName)}" title="Extract this record"><i class="bi bi-magic"></i> Extract</button>`}
        <button class="btn btn-sm btn-outline-success export-one-btn" data-file="${esc(c.fileName)}" title="Export this record to CSV"><i class="bi bi-download"></i></button>
        <button class="btn btn-sm btn-outline-danger delete-btn" data-file="${esc(c.fileName)}" title="Remove"><i class="bi bi-x-lg"></i></button>
      </td>
    </tr>`;
  }).join('');

  // Event delegation for action buttons
  body._listener = body._listener || (body.addEventListener('click', async e => {
    const previewBtn = e.target.closest('.preview-btn');
    if (previewBtn) {
      const fileName = previewBtn.dataset.file;
      if (!state.pdfCache[fileName]) {
        showStatus(`"${fileName}" not in cache. Re-upload the file to preview.`, 'warning');
        return;
      }
      const modalEl = document.getElementById('pdfPreviewModal');
      const modal = bootstrap.Modal.getInstance(modalEl) || new bootstrap.Modal(modalEl);
      document.getElementById('pdfSelector').value = fileName;
      modal.show();
      modalEl.addEventListener('shown.bs.modal', () => {
        document.getElementById('pdfSelector').dispatchEvent(new Event('change'));
      }, { once: true });
      return;
    }

    const deleteBtn = e.target.closest('.delete-btn');
    if (deleteBtn) {
      const fileName = deleteBtn.dataset.file;
      if (!confirm(`Remove "${fileName}"?`)) return;
      state.contracts = state.contracts.filter(c => c.fileName !== fileName);
      delete state.pdfCache[fileName];
      await deletePdfFromCache(fileName);
      saveToStorage();
      renderTable();
      updatePdfSelector();
      document.getElementById('extractBtn').disabled = state.contracts.length === 0;
      showStatus(`Removed "${fileName}".`, 'info');
      return;
    }

    const exportOneBtn = e.target.closest('.export-one-btn');
    if (exportOneBtn) {
      const fileName = exportOneBtn.dataset.file;
      const contract = state.contracts.find(c => c.fileName === fileName);
      if (!contract || !contract.fields || Object.keys(contract.fields).length === 0) {
        showStatus('Extract this record before exporting it.', 'warning');
        return;
      }
      exportSingleContract(contract);
      showStatus(`Exported "${fileName}".`, 'success');
      return;
    }

    const reBtn = e.target.closest('.reextract-btn') || e.target.closest('.extract-one-btn');
    if (!reBtn || reBtn.disabled) return;    const fileName = reBtn.dataset.file;
    const contract = state.contracts.find(c => c.fileName === fileName);
    if (!contract) return;

    reBtn.disabled = true;
    reBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';
    showStatus(`Re-extracting "${fileName}"...`, 'info', 0);

    try {
      if (!state.pdfCache[fileName]) {
        throw new Error('File not in cache. Please re-upload.');
      }
      const result = await extractSingle(state.pdfCache[fileName], fileName, contract.category);
      contract.fields = result.fields;
      contract.category = result.category || contract.category;
      contract.method = result.method;
      contract.aiError = result.aiError || '';
      contract.priceWarning = result.priceWarning || false;
      saveToStorage();
      renderTable();
      showStatus(`Re-extraction complete: "${fileName}" (${result.method}).`, 'success');
    } catch (err) {
      contract.method = 'error';
      saveToStorage();
      renderTable();
      showStatus(`Re-extraction failed: ${err.message}`, 'danger');
    }
  }), true);

  // Event delegation for category changes
  body._catListener = body._catListener || (body.addEventListener('change', e => {
    const sel = e.target.closest('.cat-select');
    if (!sel) return;
    const fileName = sel.dataset.file;
    const contract = state.contracts.find(c => c.fileName === fileName);
    if (!contract) return;
    contract.category = sel.value;
    saveToStorage();
    updateFieldToggleList();
    showStatus(`Category changed to "${sel.value}" for "${fileName}". Re-extract to update fields.`, 'info');
  }));

  body._editListener = body._editListener || (body.addEventListener('focusout', e => {
    const span = e.target.closest('.editable-field');
    if (!span || !span.textContent.trim()) return;
    const fileName = span.dataset.file;
    const field = span.dataset.field;
    const contract = state.contracts.find(c => c.fileName === fileName);
    if (!contract) return;
    contract.fields[field] = span.textContent.trim();
    saveToStorage();
  }, true));

  body._editKeyListener = body._editKeyListener || (body.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.closest('.editable-field')) {
      e.preventDefault();
      e.target.blur();
    }
  }));

  head._sortListener = head._sortListener || (head.addEventListener('click', e => {
    const th = e.target.closest('th[data-sort]');
    if (!th) return;
    const field = th.dataset.sort;
    if (state.sortField === field) state.sortAsc = !state.sortAsc;
    else { state.sortField = field; state.sortAsc = true; }
    renderTable();
  }));

  updateExtractBtn();
}

// ===================== EVENT HANDLERS =====================
document.addEventListener('DOMContentLoaded', async () => {
  loadFromStorage();
  document.getElementById('apiKeyInput').value = state.apiKey;

  if (!pdfjsAvailable) {
    showStatus('pdf.js failed to load. Check internet or reload. Extraction & preview disabled.', 'danger');
  }

  state.pdfCache = await loadAllPdfCache();

  if (state.contracts.length > 0) {
    renderTable();
    updatePdfSelector();
  }

  updateFieldToggleList();

  // Settings modal
  document.getElementById('saveSettingsBtn').addEventListener('click', () => {
    const apiKey = document.getElementById('apiKeyInput').value.trim();
    const model = document.getElementById('modelSelect').value;
    state.apiKey = apiKey;
    state.model = model;
    saveToStorage();
    const modal = bootstrap.Modal.getInstance(document.getElementById('settingsModal'));
    if (modal) modal.hide();
    showStatus('Settings saved.', 'success');
  });

  document.getElementById('settingsModal').addEventListener('show.bs.modal', refreshModelList);

  // Toggle API key visibility
  document.getElementById('toggleKeyBtn').addEventListener('click', () => {
    const input = document.getElementById('apiKeyInput');
    input.type = input.type === 'password' ? 'text' : 'password';
  });

  // Refresh models
  document.getElementById('refreshModelsBtn').addEventListener('click', refreshModelList);

  // Drag & drop upload
  const dropZone = document.getElementById('dropZone');
  const fileInput = document.getElementById('fileInput');

  dropZone.addEventListener('dragover', e => {
    e.preventDefault();
    dropZone.classList.add('border-primary', 'bg-light');
  });

  dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('border-primary', 'bg-light');
  });

  dropZone.addEventListener('drop', async e => {
    e.preventDefault();
    e.stopPropagation();
    dropZone.classList.remove('border-primary', 'bg-light');
    const pdfs = await readPdfFiles(e.dataTransfer.files);
    handleFiles(pdfs);
  });

  document.getElementById('filePickerLink').addEventListener('click', e => {
    e.preventDefault();
    fileInput.click();
  });

  // Extract
  document.getElementById('extractBtn').addEventListener('click', runExtraction);

  // Export
  document.getElementById('exportBtn').addEventListener('click', () => {
    bootstrap.Modal.getOrCreateInstance(document.getElementById('exportModal')).show();
  });

  document.getElementById('exportXlsxBtn').addEventListener('click', () => {
    const visible = [...state.visibleFields].filter(f => state.contracts.some(c => c.fields[f]));
    exportToXlsx(state.contracts, visible);
    bootstrap.Modal.getInstance(document.getElementById('exportModal')).hide();
    showStatus('Exported to XLSX.', 'success');
  });

  document.getElementById('exportCsvBtn').addEventListener('click', () => {
    const visible = [...state.visibleFields].filter(f => state.contracts.some(c => c.fields[f]));
    exportToCsv(state.contracts, visible);
    bootstrap.Modal.getInstance(document.getElementById('exportModal')).hide();
    showStatus('Exported to CSV.', 'success');
  });

  document.getElementById('clearBtn').addEventListener('click', async () => {
    if (!confirm('Clear all extracted data? This cannot be undone.')) return;
    state.contracts = [];
    state.pdfCache = {};
    await clearPdfCacheDb();
    saveToStorage();
    renderTable();
    updatePdfSelector();
    document.getElementById('pdfViewer').innerHTML = '<div class="text-center text-muted p-5"><i class="bi bi-file-earmark-pdf fs-1 d-block mb-2"></i><p class="mb-0">Upload PDFs to preview</p></div>';
    document.getElementById('pageNav').classList.add('d-none');
    document.getElementById('pageInfo').classList.add('d-none');
    document.getElementById('zoomNav').classList.add('d-none');
    document.getElementById('pdfSearchWrap').classList.add('d-none');
    document.getElementById('extractBtn').disabled = true;
    showStatus('All data cleared.', 'info');
  });

  // Category change updates fields
  document.getElementById('categorySelect').addEventListener('change', updateFieldToggleList);

  // PDF preview selector
  document.getElementById('pdfSelector').addEventListener('change', async e => {
    const fileName = e.target.value;
    console.log('pdfSelector change:', fileName, 'in cache:', !!state.pdfCache[fileName], 'cache keys:', Object.keys(state.pdfCache));
    if (!fileName || !state.pdfCache[fileName]) {
      document.getElementById('pdfViewer').innerHTML = '<div class="text-center text-muted p-5"><i class="bi bi-file-earmark-pdf fs-1 d-block mb-2"></i><p class="mb-0">Select a PDF</p></div>';
      document.getElementById('pageNav').classList.add('d-none');
      document.getElementById('pageInfo').classList.add('d-none');
      document.getElementById('zoomNav').classList.add('d-none');
      document.getElementById('pdfSearchWrap').classList.add('d-none');
      return;
    }
    state.currentPdfName = fileName;
    state.lastPdf = fileName;
    saveToStorage();
    state.currentPage = 1;
    state.totalPages = 0;
    state.currentScale = 1.5;
    document.getElementById('zoomReset').textContent = '150%';
    const viewer = document.getElementById('pdfViewer');
    viewer.innerHTML = '<div class="text-center p-3"><div class="spinner-border"></div></div>';
    try {
      const result = await renderPdfPreview(state.pdfCache[fileName], 1, state.currentScale);
      viewer.innerHTML = '';
      viewer.appendChild(result.container);
      result.container.style.width = '100%';
      result.container.style.height = 'auto';
      state.totalPages = result.numPages;
      document.getElementById('pageNav').classList.remove('d-none');
      document.getElementById('pageInfo').classList.remove('d-none');
      document.getElementById('zoomNav').classList.remove('d-none');
      document.getElementById('pdfSearchWrap').classList.remove('d-none');
      document.getElementById('prevPage').disabled = true;
      document.getElementById('nextPage').disabled = result.numPages <= 1;
      document.getElementById('zoomOut').disabled = state.currentScale <= 0.25;
      document.getElementById('zoomIn').disabled = state.currentScale >= 4;
      document.getElementById('pageInfo').textContent = `Page ${result.pageNum} / ${result.numPages}`;
      document.getElementById('pdfSearchInput').value = '';
      document.getElementById('pdfSearchInput').dispatchEvent(new Event('input'));
    } catch (err) {
      console.error('PDF preview render failed:', err);
      viewer.innerHTML = '<div class="text-center text-danger p-5">Failed to render PDF preview</div>';
      document.getElementById('pageNav').classList.add('d-none');
      document.getElementById('pageInfo').classList.add('d-none');
      document.getElementById('zoomNav').classList.add('d-none');
      document.getElementById('pdfSearchWrap').classList.add('d-none');
    }
  });

  let _rendering = false;
  async function renderCurrentPage() {
    if (!state.pdfCache[state.currentPdfName] || _rendering) return;
    _rendering = true;
    document.getElementById('prevPage').disabled = state.currentPage <= 1;
    document.getElementById('nextPage').disabled = state.currentPage >= state.totalPages;
    document.getElementById('zoomOut').disabled = state.currentScale <= 0.25;
    document.getElementById('zoomIn').disabled = state.currentScale >= 4;
    const viewer = document.getElementById('pdfViewer');
    viewer.innerHTML = '<div class="text-center p-3"><div class="spinner-border"></div></div>';
    try {
      const result = await renderPdfPreview(state.pdfCache[state.currentPdfName], state.currentPage, state.currentScale);
      viewer.innerHTML = '';
      viewer.appendChild(result.container);
      result.container.style.width = '100%';
      result.container.style.height = 'auto';
      document.getElementById('pageInfo').textContent = `Page ${result.pageNum} / ${result.numPages}`;
      document.getElementById('zoomReset').textContent = Math.round(state.currentScale * 100) + '%';
      const q = document.getElementById('pdfSearchInput').value.trim().toLowerCase();
      if (q) highlightInPdf(q);
      _rendering = false;
    } catch (err) {
      console.error('PDF render failed:', err);
      viewer.innerHTML = '<div class="text-center text-danger p-5">Failed to render PDF page. Try re-uploading the file.</div>';
      _rendering = false;
    }
  }

  document.getElementById('prevPage').addEventListener('click', async () => {
    if (state.currentPage <= 1 || !state.pdfCache[state.currentPdfName]) return;
    state.currentPage--;
    await renderCurrentPage();
  });

  document.getElementById('nextPage').addEventListener('click', async () => {
    if (state.currentPage >= state.totalPages || !state.pdfCache[state.currentPdfName]) return;
    state.currentPage++;
    await renderCurrentPage();
  });

  document.getElementById('zoomIn').addEventListener('click', async () => {
    state.currentScale = Math.min(state.currentScale + 0.25, 4);
    await renderCurrentPage();
  });

  document.getElementById('zoomOut').addEventListener('click', async () => {
    state.currentScale = Math.max(state.currentScale - 0.25, 0.25);
    await renderCurrentPage();
  });

  document.getElementById('zoomReset').addEventListener('click', async () => {
    state.currentScale = 1.5;
    await renderCurrentPage();
  });

  function highlightInPdf(query) {
    const textLayer = document.querySelector('.pdf-text-layer');
    if (!textLayer) return;
    const spans = textLayer.querySelectorAll('span');
    let count = 0;
    for (const span of spans) {
      span.style.background = '';
      span.style.color = 'transparent';
      if (query && span.dataset.text.toLowerCase().includes(query)) {
        span.style.background = 'rgba(255,255,0,0.5)';
        span.style.color = '#000';
        count++;
      }
    }
    return count;
  }

  document.getElementById('pdfSearchInput').addEventListener('input', e => {
    const q = e.target.value.trim().toLowerCase();
    if (q) {
      const count = highlightInPdf(q);
      document.getElementById('pdfSearchClear').style.display = '';
      const info = document.getElementById('pageInfo');
      if (count === 0) info.textContent = info.textContent.replace(/ — .*/, '') + ' — No matches';
      else info.textContent = info.textContent.replace(/ — .*/, '') + ` — ${count} match${count > 1 ? 'es' : ''}`;
    } else {
      highlightInPdf('');
      document.getElementById('pdfSearchClear').style.display = 'none';
      document.getElementById('pageInfo').textContent = document.getElementById('pageInfo').textContent.replace(/ — .*/, '');
    }
  });

  document.getElementById('pdfSearchClear').addEventListener('click', () => {
    document.getElementById('pdfSearchInput').value = '';
    document.getElementById('pdfSearchInput').dispatchEvent(new Event('input'));
  });

  document.getElementById('searchInput').addEventListener('input', renderTable);

  document.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.tagName !== 'INPUT' && e.target.tagName !== 'SELECT' && e.target.tagName !== 'TEXTAREA') {
      if (!document.getElementById('extractBtn').disabled) document.getElementById('extractBtn').click();
    }
    // PDF navigation shortcuts — only when PDF preview modal is open
    if (document.getElementById('pdfPreviewModal')?.classList.contains('show')) {
      if (e.key === 'ArrowLeft' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        document.getElementById('prevPage')?.click();
      } else if (e.key === 'ArrowRight' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        document.getElementById('nextPage')?.click();
      } else if (e.key === 'Equal' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        document.getElementById('zoomIn')?.click();
      } else if (e.key === 'Minus' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        document.getElementById('zoomOut')?.click();
      } else if (e.key === 'Digit0' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        document.getElementById('zoomReset')?.click();
      }
    }
  });

  document.getElementById('batchCategorySelect').addEventListener('change', e => {
    const cat = e.target.value;
    if (!cat) return;
    const count = state.contracts.length;
    if (!confirm(`Set category to "${cat}" for all ${count} contracts?`)) {
      e.target.value = '';
      return;
    }
    state.contracts.forEach(c => c.category = cat);
    saveToStorage();
    renderTable();
    showStatus(`All ${count} contracts set to "${cat}". Re-extract to apply field rules.`, 'info');
    e.target.value = '';
  });
});

// ===================== FILE HANDLING =====================
async function readPdfFiles(fileList) {
  const pdfs = [];
  let done = 0;
  const total = fileList.length;
  showStatus(`Reading files...`, 'info', 0);
  for (const file of fileList) {
    if (!file.name.toLowerCase().endsWith('.pdf')) continue;
    if (file.size > MAX_FILE_SIZE) { console.warn('File too large:', file.name, file.size); continue; }
    showStatus(`Reading ${file.name}...`, 'info', Math.round((done / total) * 100));
    const bytes = await file.arrayBuffer();
    const data = new Uint8Array(bytes);
    state.pdfCache[file.name] = data;
    await savePdfToCache(file.name, data);
    pdfs.push(file);
    done++;
  }
  showStatus(`Read ${done} PDF(s).`, 'success');
  return pdfs;
}

function handleFiles(files) {
  const category = document.getElementById('categorySelect').value;
  const extractBtn = document.getElementById('extractBtn');
  let firstNew = '';

  for (const file of files) {
    if (!file.name.toLowerCase().endsWith('.pdf')) continue;
    if (state.contracts.some(c => c.fileName === file.name)) continue;
    if (!firstNew) firstNew = file.name;
    state.contracts.push({
      fileName: file.name,
      category,
      fields: {},
      method: 'pending',
      date: new Date().toISOString()
    });
  }

  updatePdfSelector();
  renderTable();
  updateExtractBtn();
  saveToStorage();

  if (firstNew && state.pdfCache[firstNew]) {
    state.lastPdf = firstNew;
    saveToStorage();
  }
}

// Dark mode toggle — separate sync handler so async errors in DOMContentLoaded can't break it
document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('darkModeToggle');
  if (btn) {
    btn.addEventListener('click', () => {
      const next = state.theme === 'dark' ? 'light' : 'dark';
      applyTheme(next);
      saveToStorage();
    });
  }
});

// Report issue — opens a pre-filled GitHub issue with the current contract context
document.addEventListener('DOMContentLoaded', () => {
  const link = document.getElementById('reportIssueBtn');
  if (!link) return;
  link.addEventListener('click', (e) => {
    e.preventDefault();
    const sel = document.getElementById('pdfSelector');
    const fileName = (sel && sel.value) || (state.contracts[0] || {}).fileName || '';
    const contract = state.contracts.find(c => c.fileName === fileName) || {};
    const method = contract.method || 'not extracted';
    const aiErr = contract.aiError ? `\n\n**AI error:** \`${contract.aiError}\`` : '';
    const fields = Object.entries(contract.fields || {})
      .map(([k, v]) => `- ${k}: ${String(v).slice(0, 120)}`)
      .join('\n').slice(0, 2500) || '(no fields extracted)';
    const title = encodeURIComponent(`Issue: ${fileName || 'Cloud Extract'} (${method})`);
    const body = encodeURIComponent(
`## What happened?
<!-- Describe the problem or leave feedback -->


## Context
- **File:** ${fileName || '—'}
- **Category:** ${contract.category || '—'}
- **Method:** ${method}
- **App version:** 1.5.0
${aiErr}

## Extracted fields
${fields}

## Steps to reproduce
1. 
2. 
3. 
`
    );
    link.href = `https://github.com/YounesJY/cloud-extract/issues/new?title=${title}&body=${body}`;
    window.open(link.href, '_blank', 'noopener');
  });
});

async function runExtraction() {
  const extractBtn = document.getElementById('extractBtn');
  extractBtn.disabled = true;
  extractBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Extracting...';

  const pending = state.contracts.filter(c => c.method === 'pending' || c.method === 'regex' || c.method === 'error');
  if (pending.length === 0) {
    showStatus('All contracts already extracted.', 'info');
    updateExtractBtn();
    return;
  }

  showStatus(`Extracting ${pending.length} contract(s)...`, 'info', 0);

  const results = await Promise.allSettled(pending.map(async (c, i) => {
    c._extracting = true;
    renderTable();
    showStatus(`[${i + 1}/${pending.length}] ${c.fileName}...`, 'info', Math.round((i / pending.length) * 90));

    if (!state.pdfCache[c.fileName]) {
      return { contract: c, error: new Error('File not in cache') };
    }

    const result = await extractSingle(state.pdfCache[c.fileName], c.fileName, c.category);
    return { contract: c, result };
  }));

  for (const r of results) {
    if (r.status === 'fulfilled') {
      const { contract, result, error } = r.value;
      if (error) {
        showStatus(`Error extracting ${contract.fileName}: ${error.message}`, 'danger');
        contract.method = 'error';
      } else {
        contract.fields = result.fields;
        contract.category = result.category || contract.category;
        contract.method = result.method;
        contract.aiError = result.aiError || '';
        contract.priceWarning = result.priceWarning || false;
      }
    } else {
      console.error('Extraction failed:', r.reason);
    }
  }

  state.contracts.forEach(c => delete c._extracting);
  saveToStorage();
  renderTable();
  updateFieldToggleList();

  const aiCount = pending.filter(c => c.method === 'OpenRouter').length;
  const regexCount = pending.filter(c => c.method === 'regex').length;
  const aiFailed = pending.filter(c => c.aiError).length;
  const msg = `Extraction complete. ${aiCount} AI, ${regexCount} regex.` + (aiFailed ? ` ${aiFailed} used regex fallback because the AI API failed (hover the Method badge).` : '');
  showStatus(msg, aiFailed ? 'warning' : 'success');
  updateExtractBtn();
  updatePdfSelector();
}

function updatePdfSelector() {
  const select = document.getElementById('pdfSelector');
  const current = select.value;
  select.innerHTML = '<option value="">Select PDF...</option>' +
    state.contracts.map(c => `<option value="${esc(c.fileName)}">${esc(c.fileName)}</option>`).join('');
  if (current && state.contracts.some(c => c.fileName === current)) {
    select.value = current;
  }
}

document.getElementById('fileInput').addEventListener('change', async e => {
  const pdfs = await readPdfFiles(e.target.files);
  handleFiles(pdfs);
  e.target.value = '';
});
