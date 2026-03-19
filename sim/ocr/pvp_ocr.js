// sim/ocr/pvp_ocr.js — PvP OCR v2
// Handles 3 distinct image formats:
//   1. Battle Report (dual-column Stat Bonuses): left=att, right=def troops+stats
//   2. Defender Stat Bonuses (single-column, right-aligned green values)
//   3. Defender Troop Ratio (popup with 1.1M total + shield/horse/crossbow %)
(function () {
  'use strict';

  /* ── Tesseract loader ───────────────────────────────────────────── */
  const CDN = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
  let _tPromise = null, _worker = null;
  function loadTesseract() {
    if (_tPromise) return _tPromise;
    _tPromise = new Promise((res, rej) => {
      if (window.Tesseract) { res(window.Tesseract); return; }
      const s = document.createElement('script');
      s.src = CDN;
      s.onload = () => res(window.Tesseract);
      s.onerror = () => rej(new Error('Tesseract load failed'));
      document.head.appendChild(s);
    });
    return _tPromise;
  }
  async function getWorker() {
    if (_worker) return _worker;
    const T = await loadTesseract();
    _worker = await T.createWorker('eng', 1, {});
    await _worker.setParameters({ tessedit_pageseg_mode: '6' });
    return _worker;
  }

  /* ── Canvas helpers ─────────────────────────────────────────────── */
  function fileToImage(file) {
    return new Promise((res, rej) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); res(img); };
      img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('Image load failed')); };
      img.src = url;
    });
  }

  function toCanvas(img, targetW = 1200) {
    const scale = targetW / img.naturalWidth;
    const c = document.createElement('canvas');
    c.width = targetW;
    c.height = Math.round(img.naturalHeight * scale);
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, c.width, c.height);
    return c;
  }

  function cropCanvas(img, x, y, w, h, targetW = 900) {
    const scale = targetW / w;
    const c = document.createElement('canvas');
    c.width  = Math.round(w  * scale);
    c.height = Math.round(h  * scale);
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, x, y, w, h, 0, 0, c.width, c.height);
    return c;
  }

  async function ocrFull(canvas) {
    const w = await getWorker();
    await w.setParameters({ tessedit_pageseg_mode: '6' });
    const { data } = await w.recognize(canvas.toDataURL('image/png'));
    return {
      text: data.text || '',
      words: (data.words || []).map(ww => ({
        text: String(ww.text).trim(),
        bbox: ww.bbox,
        conf: ww.confidence,
      })).filter(ww => ww.text.length > 0),
    };
  }

  /* ── Number / percentage parsers ────────────────────────────────── */
  function parseAmount(s) {
    if (!s) return null;
    s = String(s).trim();
    // Handle abbreviated: 1.1M, 2.5K, etc.
    const mAbbr = s.match(/^([\d,\.]+)\s*([KkMmBb])/);
    if (mAbbr) {
      const n = parseFloat(mAbbr[1].replace(/,/g, ''));
      if (!isFinite(n)) return null;
      const mul = { k:1e3, m:1e6, b:1e9 }[mAbbr[2].toLowerCase()] || 1;
      return Math.round(n * mul);
    }
    const m = s.replace(/[^\d]/g, '');
    const n = parseInt(m, 10);
    return isFinite(n) && n > 0 ? n : null;
  }

  function parsePct(s) {
    if (!s) return null;
    const clean = String(s).replace(/[Oo]/g, '0').replace(/,/, '.');
    const m = clean.match(/([+-]?\d{1,4}(?:\.\d{1,2})?)\s*%/);
    return m ? parseFloat(m[1]) : null;
  }

  /* ── Stat label matcher ─────────────────────────────────────────── */
  const LABEL_MAP = [
    [/\binf[a-z]*.*att/i,   'inf', 'atk'],
    [/\binf[a-z]*.*def/i,   'inf', 'def'],
    [/\binf[a-z]*.*leth/i,  'inf', 'let'],
    [/\binf[a-z]*.*hea/i,   'inf', 'hp' ],
    [/\bcav[a-z]*.*att/i,   'cav', 'atk'],
    [/\bcav[a-z]*.*def/i,   'cav', 'def'],
    [/\bcav[a-z]*.*leth/i,  'cav', 'let'],
    [/\bcav[a-z]*.*hea/i,   'cav', 'hp' ],
    [/\barc?h[a-z]*.*att/i, 'arc', 'atk'],
    [/\barc?h[a-z]*.*def/i, 'arc', 'def'],
    [/\barc?h[a-z]*.*leth/i,'arc', 'let'],
    [/\barc?h[a-z]*.*hea/i, 'arc', 'hp' ],
  ];
  function matchLabel(txt) {
    for (const [re, type, stat] of LABEL_MAP) {
      if (re.test(txt)) return { type, stat };
    }
    return null;
  }

  /* ── Parse stat block from ordered lines ────────────────────────── */
  // Handles both "Label   +123.4%" (same line) and label on one line, value on next
  function parseStatLines(lines) {
    const stats = {
      inf: { atk: 0, def: 0, let: 0, hp: 0 },
      cav: { atk: 0, def: 0, let: 0, hp: 0 },
      arc: { atk: 0, def: 0, let: 0, hp: 0 },
    };
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const key = matchLabel(line);
      if (!key) continue;
      // Try to find pct on same line or next line
      let pct = parsePct(line);
      if (pct == null && i + 1 < lines.length) pct = parsePct(lines[i + 1]);
      if (pct != null) stats[key.type][key.stat] = pct;
    }
    return stats;
  }

  /* ── PARSER 1: Battle Report (dual-column) ──────────────────────── */
  // Both attacker (left/red) and defender (right/green) troops + stats
  async function parseBattleReport(file) {
    const img = await fileToImage(file);
    const W = img.naturalWidth, H = img.naturalHeight;
    const mid = W * 0.47; // column split point

    // Crop left side for attacker
    const leftCanvas  = cropCanvas(img, 0,   0, mid,   H, 900);
    const rightCanvas = cropCanvas(img, mid, 0, W-mid, H, 900);

    const [leftOcr, rightOcr] = await Promise.all([ocrFull(leftCanvas), ocrFull(rightCanvas)]);

    const leftLines  = leftOcr.text.split('\n').map(l => l.trim()).filter(Boolean);
    const rightLines = rightOcr.text.split('\n').map(l => l.trim()).filter(Boolean);

    // Extract troop amounts: look for 3 numbers in the 100-999999 range close together
    function extractTroopAmounts(lines) {
      const nums = [];
      for (const line of lines) {
        const cleaned = line.replace(/[^0-9,]/g, '');
        const n = parseAmount(cleaned);
        if (n != null && n >= 100 && n <= 9999999) {
          nums.push(n);
          if (nums.length === 3) break;
        }
      }
      if (nums.length < 3) return null;
      return { inf: nums[0], cav: nums[1], arc: nums[2] };
    }

    const attTroops = extractTroopAmounts(leftLines);
    const defTroops = extractTroopAmounts(rightLines);
    const attStats  = parseStatLines(leftLines);
    const defStats  = parseStatLines(rightLines);

    return {
      attacker: { troops: attTroops, stats: attStats },
      defender: { troops: defTroops, stats: defStats },
    };
  }

  /* ── PARSER 2: Defender Stat Bonuses (single-column) ───────────── */
  // The defender-only stat screen: all values right-aligned, no left column
  async function parseDefStatBonuses(file) {
    const img = await fileToImage(file);
    const canvas = toCanvas(img, 1200);
    const { text } = await ocrFull(canvas);
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

    // In this layout each line is "Infantry Attack    +794.7%"
    // So parseStatLines handles it directly (same line label + value)
    const stats = parseStatLines(lines);

    // Also look for enemy penalties
    let letPenalty = 0, hpPenalty = 0;
    for (const line of lines) {
      if (/enemy.*leth/i.test(line)) {
        const p = parsePct(line);
        if (p != null) letPenalty = p;
      }
      if (/enemy.*health/i.test(line)) {
        const p = parsePct(line);
        if (p != null) hpPenalty = p;
      }
    }

    return { stats, enemyLetPenalty: letPenalty, enemyHpPenalty: hpPenalty, rawText: text };
  }

  /* ── PARSER 3: Defender Troop Ratio (popup screen) ─────────────── */
  // Shows "Troops Total: 1.1M" and a popup with "64.18%  35.81%  0%"
  async function parseDefTroopRatio(file) {
    const img = await fileToImage(file);
    const canvas = toCanvas(img, 1200);
    const { text } = await ocrFull(canvas);
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

    // Find "Troops Total" line and parse the number (could be 1.1M format)
    let total = null;
    for (const line of lines) {
      if (/troops?\s*total/i.test(line)) {
        // Extract everything after the colon
        const m = line.match(/troops?\s*total\s*[:\s]+(.+)/i);
        if (m) {
          // Parse abbreviated number like 1.1M
          const raw = m[1].replace(/[^0-9,.KkMmBb]/g, '');
          total = parseAmount(raw);
        }
        if (!total) {
          // Try next line
          const idx = lines.indexOf(line);
          if (idx + 1 < lines.length) {
            const raw = lines[idx + 1].replace(/[^0-9,.KkMmBb]/g, '');
            total = parseAmount(raw);
          }
        }
        if (total) break;
      }
    }

    // Find the troop type ratio popup: look for 3 percentage values in a row
    // They are shown as "64.18%  35.81%  0%" in the popup
    const allPcts = [];
    const pctRe = /(\d{1,3}(?:[.,]\d{1,2})?)\s*%/g;
    let m;
    const fullText = lines.join(' ');
    while ((m = pctRe.exec(fullText)) !== null) {
      const v = parseFloat(m[1].replace(',', '.'));
      if (v >= 0 && v <= 100) allPcts.push(v);
    }

    // The popup always has exactly 3 percentages that sum to ~100
    // Find the triplet that sums closest to 100
    let ratio = null;
    for (let i = 0; i <= allPcts.length - 3; i++) {
      const a = allPcts[i], b = allPcts[i+1], c = allPcts[i+2];
      const sum = a + b + c;
      if (sum >= 95 && sum <= 105) {
        ratio = { inf: a, cav: b, arc: c };
        break;
      }
    }

    // Fallback: use largest 3 values that sum to ~100
    if (!ratio && allPcts.length >= 3) {
      const sorted = [...allPcts].sort((a, b) => b - a);
      for (let i = 0; i < sorted.length - 2; i++) {
        const a = sorted[i], b = sorted[i+1], c = sorted[i+2];
        if (a + b + c >= 95 && a + b + c <= 105) {
          ratio = { inf: a, cav: b, arc: c };
          break;
        }
      }
    }

    let troops = null;
    if (total && ratio) {
      troops = {
        inf: Math.round(total * ratio.inf / 100),
        cav: Math.round(total * ratio.cav / 100),
        arc: Math.round(total * ratio.arc / 100),
      };
    }

    return { total, ratio, troops, rawText: text };
  }

  /* ── PARSER 4: Attacker Stats/Troops (left half only) ───────────── */
  async function parseAttackerStatsTroops(file) {
    const img = await fileToImage(file);
    const W = img.naturalWidth, H = img.naturalHeight;
    // Take left 52% of image
    const leftCanvas = cropCanvas(img, 0, 0, W * 0.52, H, 900);
    const { text, words } = await ocrFull(leftCanvas);
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

    // Extract 3 troop amounts
    const nums = [];
    for (const line of lines) {
      const cleaned = line.replace(/[^0-9,]/g, '');
      const n = parseAmount(cleaned);
      if (n != null && n >= 100 && n <= 9999999) {
        nums.push(n);
        if (nums.length === 3) break;
      }
    }
    const troops = nums.length >= 3 ? { inf: nums[0], cav: nums[1], arc: nums[2] } : null;
    const stats = parseStatLines(lines);

    return { troops, stats, rawText: text };
  }

  /* ── Public API ─────────────────────────────────────────────────── */
  window.KingSim = window.KingSim || {};
  window.KingSim.pvpOcr = {
    parseBattleReport,
    parseAttackReport: parseBattleReport,   // alias for backward compat
    parseDefStatBonuses,
    parseDefTroopRatio,
    parseAttackerStatsTroops,
  };
})();
