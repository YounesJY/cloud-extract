// ===================== CONFIGURATION =====================
const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const FIELD_NAMES = [
  'Police Num', 'Souscripteur', 'Adresse',
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

// ===================== STATE =====================
let state = {
  apiKey: '',
  model: '',
  contracts: [],
  visibleFields: new Set(FIELD_NAMES),
  pdfCache: {} // { fileName: Uint8Array }
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
    }
  } catch (e) {
    console.warn('Storage read failed, using defaults:', e);
  }
}

function saveToStorage() {
  try {
    const data = {
      apiKey: state.apiKey,
      model: state.model,
      contracts: state.contracts,
      visibleFields: [...state.visibleFields]
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.warn('Storage write failed:', e);
  }
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
async function renderPdfPreview(pdfData, pageNum) {
  if (!pdfjsAvailable) throw new Error('pdf.js library not loaded');
  const pdf = await pdfjsLib.getDocument({ data: pdfData.slice() }).promise;
  const page = await pdf.getPage(pageNum);
  const viewport = page.getViewport({ scale: 1.5 });
  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext('2d');
  await page.render({ canvasContext: ctx, viewport }).promise;
  return canvas;
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

async function callOpenRouter(pdfText, category) {
  const fieldNames = getFieldsForCategory(category);
  const truncated = pdfText.length > 6000 ? pdfText.slice(0, 6000) + '...' : pdfText;

  const prompt = `Extract data from a Moroccan ${category} insurance contract (Allianz/Sanlam).

Return EXACTLY this JSON with these EXACT keys (use null if not found):
${JSON.stringify(Object.fromEntries(fieldNames.map(f => [f, 'value'])), null, 2)}

RULES — Follow exactly:

CRITICAL — Distinguish these codes carefully:
- Police Num = CONTRACT/POLICY number. Look near 'Police N°', 'N° police'. NEVER use a phone number here.
- N° Client = CLIENT identifier. Look near 'N° Client', 'Numéro client'. Can be alphanumeric like MG1401.
- Code Intermédiaire = SHORT intermediary code (3-8 digits). NOT a long description or name.
- CIN = National ID card number. Format: 1-2 letters followed by 4-10 digits (e.g. EE123456, A123456). Never a word like 'traitant', 'cabinet', 'gérant'.
- Téléphone = 10-digit Moroccan phone starting with 0. If looks like phone (06xx, 07xx, 05xx), put in Téléphone, NOT Police Num.

NUMBERS (Prime Totale TTC, Prime Nette, Taxes):
- Digits and dot only. NO currency (DH, MAD, dhs, €, $, Dirhams)
- Convert comma to dot: "10.000,00" → "10000.00" (remove thousand separators)
- Check the whole text carefully for these amounts.

DATES:
- Date d'effet = START (earlier), Date d'échéance = END (later)
- CRITICAL: effet date MUST be earlier than échéance — swap if reversed
- Format: DD/MM/YYYY only

PHONE:
- 10-digit Moroccan number starting with 0 (e.g. 0522499700)
- Digits only: remove spaces, +212, parentheses, hyphens
- If you see 9 digits, add leading 0

NAMES (Souscripteur, Nom Assuré): UPPERCASE
For ${category} contracts, Nom Assuré is often the same company as Souscripteur

Return ONLY the JSON object — no markdown, no explanation, no extra text.

Contract text:
${truncated}`;

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
      temperature: 0.1,
      max_tokens: 2000
    })
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`OpenRouter error ${resp.status}: ${errText}`);
  }

  const data = await resp.json();
  const content = data.choices?.[0]?.message?.content || '';
  return parseJsonResponse(content, fieldNames);
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
}

function crossValidateAndFill(fields, pdfText) {
  if (!pdfText) return;
  const fullText = pdfText.replace(/\n/g, ' ').replace(/\r/g, ' ');

  // 1. Police Num
  let policeVal = null;
  let policeMatch = fullText.match(/Police\s*N[°o]\s*:?\s*([A-Z0-9\-/]{3,25})/i);
  if (policeMatch) {
    policeVal = policeMatch[1].trim();
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

  // 2. Regex-fill null fields
  const patterns = {
    "N° Client": /N[°o]\s*Client\s*:?\s*([A-Z0-9\-/]{3,20})/i,
    "CIN": /(?:N[°o]\s+CIN\b|CIN\s*:|Carte\s+identité)\s*:?\s*([A-Z]{1,2}\d{4,10})/i,
    "Téléphone": /(?:T[eé]l[eé]?phone|Tél|Mobile)\s*:?\s*([\d\s\-+]{8,15})/i,
    "Prime Totale TTC": /(?:Prime\s*Totale\s*TTC|Total\s*TTC|Net\s*à\s*payer)\s*:?\s*([\d\s,.]+)\s*(?:DH|MAD|dhs)?/i,
    "Prime Nette": /(?:Prime\s*Nette|Prime\s*Hors\s*[Tt]axe|Prime\s*pure)\s*:?\s*([\d\s,.]+)\s*(?:DH|MAD|dhs)?/i,
    "Taxes": /Taxes?\s*:?\s*([\d\s,.]+)\s*(?:DH|MAD|dhs)?/i,
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

// ===================== EXTRACTION PIPELINE =====================
async function extractSingle(pdfData, fileName, category) {
  console.log('extractSingle:', fileName, 'pdfData type:', typeof pdfData, 'length:', pdfData?.byteLength);
  const text = await extractTextFromPdf(pdfData);
  console.log('extractSingle text length:', text?.length);

  let fields = {};
  let rawResponse = '';
  let method = 'regex';

  if (state.apiKey && state.model) {
    try {
      const result = await callOpenRouter(text, category);
      fields = result;
      method = 'OpenRouter';
    } catch (err) {
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

  return { fields, rawResponse, method, text };
}

function regexExtract(text, category) {
  // Basic regex fallback (port of FieldExtractor.Extract)
  const fields = {};
  const patterns = {
    "Police Num": /Police\s*N[°o]\s*:?\s*([A-Z0-9\-/]{3,25})/i,
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
      if (val.length >= 2) fields[field] = val;
    }
  }

  const catExtra = CATEGORY_FIELDS[category] || [];
  for (const extra of catExtra) {
    const pattern = new RegExp(`${extra}\\s*:?\\s*(.+)`, 'i');
    const match = text.match(pattern);
    if (match && match[1]) fields[extra] = match[1].trim();
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
  const data = buildExportData(contracts, columns);
  const ws = XLSX.utils.json_to_sheet(data);
  const csv = XLSX.utils.sheet_to_csv(ws);
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `export_${new Date().toISOString().slice(0,19).replace(/[:-]/g, '')}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function buildExportData(contracts, columns) {
  return contracts.map(c => {
    const row = {};
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
}

function hideStatus() {
  document.getElementById('statusBar').classList.add('d-none');
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
    const pricing = m.pricing ? ` (prompt: ${m.pricing.prompt || '?'})` : '';
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

  let html = '';
  for (const field of allFields) {
    const checked = state.visibleFields.has(field) ? 'checked' : '';
    html += `<div class="form-check">
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
}

function renderTable() {
  const head = document.getElementById('tableHead');
  const body = document.getElementById('tableBody');
  const wrap = document.getElementById('tableWrap');
  const empty = document.getElementById('resultsWrap');

  const visible = [...state.visibleFields].filter(f =>
    state.contracts.some(c => c.fields[f])
  );

  if (state.contracts.length === 0 || visible.length === 0) {
    empty.classList.remove('d-none');
    wrap.classList.add('d-none');
    document.getElementById('exportBtn').disabled = true;
    return;
  }

  empty.classList.add('d-none');
  wrap.classList.remove('d-none');
  document.getElementById('exportBtn').disabled = false;

  // Header
  head.innerHTML = '<tr><th>#</th><th>File</th><th>Method</th>' +
    visible.map(f => `<th>${f}</th>`).join('') + '<th></th></tr>';

  // Body
  body.innerHTML = state.contracts.map((c, i) => {
    const fields = visible.map(f => c.fields[f] || '<span class="text-muted">—</span>').join('</td><td>');
    return `<tr>
      <td>${i + 1}</td>
      <td class="text-nowrap"><small>${c.fileName}</small></td>
      <td><span class="badge bg-${c.method === 'OpenRouter' ? 'success' : 'secondary'}">${c.method}</span></td>
      <td>${fields}</td>
      <td><button class="btn btn-sm btn-outline-danger border-0 delete-btn" data-file="${c.fileName}" title="Remove"><i class="bi bi-x-lg"></i></button></td>
    </tr>`;
  }).join('');

  // Event delegation for delete buttons
  body._listener = body._listener || (body.addEventListener('click', async e => {
    const btn = e.target.closest('.delete-btn');
    if (!btn) return;
    const fileName = btn.dataset.file;
    if (!confirm(`Remove "${fileName}"?`)) return;
    state.contracts = state.contracts.filter(c => c.fileName !== fileName);
    delete state.pdfCache[fileName];
    await deletePdfFromCache(fileName);
    saveToStorage();
    renderTable();
    updatePdfSelector();
    document.getElementById('extractBtn').disabled = state.contracts.length === 0;
    showStatus(`Removed "${fileName}".`, 'info');
  }), true);
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
    const files = e.dataTransfer.files;
    for (const file of files) {
      if (!file.name.toLowerCase().endsWith('.pdf')) continue;
      if (file.size > MAX_FILE_SIZE) { console.warn('File too large:', file.name, file.size); continue; }
      try {
        const bytes = await file.arrayBuffer();
        const data = new Uint8Array(bytes);
        state.pdfCache[file.name] = data;
        await savePdfToCache(file.name, data);
      } catch (err) {
        console.error('File read failed:', file.name, err);
      }
    }
    handleFiles(files);
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
  });

  document.getElementById('exportCsvBtn').addEventListener('click', () => {
    const visible = [...state.visibleFields].filter(f => state.contracts.some(c => c.fields[f]));
    exportToCsv(state.contracts, visible);
    bootstrap.Modal.getInstance(document.getElementById('exportModal')).hide();
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
      return;
    }
    const viewer = document.getElementById('pdfViewer');
    viewer.innerHTML = '<div class="text-center p-3"><div class="spinner-border"></div></div>';
    try {
      const canvas = await renderPdfPreview(state.pdfCache[fileName], 1);
      viewer.innerHTML = '';
      viewer.appendChild(canvas);
      canvas.style.width = '100%';
      canvas.style.height = 'auto';
    } catch (err) {
      console.error('PDF preview render failed:', err);
      viewer.innerHTML = '<div class="text-center text-danger p-5">Failed to render PDF preview</div>';
    }
  });
});

// ===================== FILE HANDLING =====================
function handleFiles(files) {
  const category = document.getElementById('categorySelect').value;
  const extractBtn = document.getElementById('extractBtn');

  for (const file of files) {
    if (!file.name.toLowerCase().endsWith('.pdf')) continue;
    if (state.contracts.some(c => c.fileName === file.name)) continue;

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
  extractBtn.disabled = state.contracts.length === 0;
  saveToStorage();}

async function runExtraction() {
  const extractBtn = document.getElementById('extractBtn');
  extractBtn.disabled = true;

  const pending = state.contracts.filter(c => c.method === 'pending' || c.method === 'regex' || c.method === 'error');
  if (pending.length === 0) {
    showStatus('All contracts already extracted.', 'info');
    extractBtn.disabled = false;
    return;
  }

  showStatus(`Extracting ${pending.length} contract(s)...`, 'info', 0);

  const results = await Promise.allSettled(pending.map(async (c, i) => {
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
        contract.method = result.method;
      }
    } else {
      console.error('Extraction failed:', r.reason);
    }
  }

  saveToStorage();
  renderTable();

  showStatus(`Extraction complete. ${pending.filter(c => c.method === 'OpenRouter').length} AI, ${pending.filter(c => c.method === 'regex').length} regex.`, 'success');
  extractBtn.disabled = false;

  // Update first PDF preview
  updatePdfSelector();
  if (state.contracts.length > 0) {
    const first = state.contracts[0];
    if (state.pdfCache[first.fileName]) {
      document.getElementById('pdfSelector').value = first.fileName;
      document.getElementById('pdfSelector').dispatchEvent(new Event('change'));
    }
  }
}

function updatePdfSelector() {
  const select = document.getElementById('pdfSelector');
  const current = select.value;
  select.innerHTML = '<option value="">Select PDF...</option>' +
    state.contracts.map(c => `<option value="${c.fileName}">${c.fileName}</option>`).join('');
  if (current && state.contracts.some(c => c.fileName === current)) {
    select.value = current;
  }
}

document.getElementById('fileInput').addEventListener('change', async e => {
  const files = e.target.files;
  for (const file of files) {
    if (!file.name.toLowerCase().endsWith('.pdf')) continue;
    if (file.size > MAX_FILE_SIZE) { console.warn('File too large:', file.name, file.size); continue; }
    const bytes = await file.arrayBuffer();
    const data = new Uint8Array(bytes);
    state.pdfCache[file.name] = data;
    await savePdfToCache(file.name, data);
  }
  handleFiles(files);
});
