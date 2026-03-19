// sim/ocr/pvp_ocr.js — v3
// KEY FIX: troop amounts and stat values are in DIFFERENT vertical zones.
// In the battle report image layout:
//   Top zone  (~top 35% of image): troop icons + numeric counts
//   Bottom zone (~bottom 65%):     "Stat Bonuses" table with +X% values
// We crop the TOP zone to extract troop numbers (avoids stat values being mistaken for troops).
// We use the FULL image for stat parsing (labels + values span full height).
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

  // Crop a rectangle from the original image (pixel coords of the original)
  function cropCanvas(img, x, y, w, h, targetW = 900) {
    const scale = targetW / w;
    const c = document.createElement('canvas');
    c.width  = Math.round(w * scale);
    c.height = Math.round(h * scale);
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

  /* ── Number parsers ─────────────────────────────────────────────── */
  function parseAmount(s) {
    if (!s) return null;
    s = String(s).trim();
    const mAbbr = s.match(/^([\d,\.]+)\s*([KkMmBb])/);
    if (mAbbr) {
      const n = parseFloat(mAbbr[1].replace(/,/g, ''));
      if (!isFinite(n)) return null;
      const mul = { k: 1e3, m: 1e6, b: 1e9 }[mAbbr[2].toLowerCase()] || 1;
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
    [/\binfantry\s+att/i,   'inf', 'atk'],
    [/\binfantry\s+def/i,   'inf', 'def'],
    [/\binfantry\s+leth/i,  'inf', 'let'],
    [/\binfantry\s+hea/i,   'inf', 'hp' ],
    [/\bcavalry\s+att/i,    'cav', 'atk'],
    [/\bcavalry\s+def/i,    'cav', 'def'],
    [/\bcavalry\s+leth/i,   'cav', 'let'],
    [/\bcavalry\s+hea/i,    'cav', 'hp' ],
    [/\barc?her\w*\s+att/i, 'arc', 'atk'],
    [/\barc?her\w*\s+def/i, 'arc', 'def'],
    [/\barc?her\w*\s+leth/i,'arc', 'let'],
    [/\barc?her\w*\s+hea/i, 'arc', 'hp' ],
    // short forms fallback
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

  /* ── Parse stat block from lines ────────────────────────────────── */
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
      let pct = parsePct(line);
      if (pct == null && i + 1 < lines.length) pct = parsePct(lines[i + 1]);
      if (pct != null) stats[key.type][key.stat] = pct;
    }
    return stats;
  }

  /* ── TROOP EXTRACTION — vertical zone aware ─────────────────────── */
  // The battle report image has a fixed vertical layout:
  //   0%  – 10%  : header bar / background
  //   10% – 35%  : troop icons + troop COUNT numbers  ← we want THIS zone
  //   35% – 45%  : transition / "Stat Bonuses" header
  //   45% – 95%  : stat table with +X% values         ← NOT this zone for troop counts
  //
  // We crop the TOP 38% of the image to extract troop numbers.
  // Stat numbers (+579.2% etc.) only appear in the bottom 60%+ of the image.
  //
  // This completely eliminates the ambiguity between troop counts and stat values.

  const TROOP_ZONE_BOTTOM = 0.38; // use top 38% of image for troop extraction
  const STAT_ZONE_TOP     = 0.30; // use bottom 70% of image for stat extraction

  async function extractTroopsFromZone(img, xStart, xEnd) {
    const W = img.naturalWidth, H = img.naturalHeight;
    const zoneH = Math.round(H * TROOP_ZONE_BOTTOM);
    const canvas = cropCanvas(img, xStart, 0, xEnd - xStart, zoneH, 900);
    const { text } = await ocrFull(canvas);
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

    const nums = [];
    for (const line of lines) {
      // Only accept lines that look like pure numbers (with optional commas)
      // Reject lines containing letters (which would be stat labels or "Lv. 10.0")
      const hasLetters = /[a-zA-Z]/.test(line);
      if (hasLetters) continue;
      const cleaned = line.replace(/[^0-9,]/g, '');
      if (!cleaned) continue;
      const n = parseAmount(cleaned);
      // Troop counts: 1,000 to 9,999,999 (reasonable troop range)
      if (n != null && n >= 1000 && n <= 9999999) {
        nums.push(n);
        if (nums.length === 3) break;
      }
    }
    if (nums.length < 3) return null;
    return { inf: nums[0], cav: nums[1], arc: nums[2] };
  }

  async function extractStatsFromZone(img, xStart, xEnd) {
    const W = img.naturalWidth, H = img.naturalHeight;
    const zoneTop = Math.round(H * STAT_ZONE_TOP);
    const canvas = cropCanvas(img, xStart, zoneTop, xEnd - xStart, H - zoneTop, 900);
    const { text } = await ocrFull(canvas);
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    return parseStatLines(lines);
  }

  /* ── PARSER 1: Battle Report (dual-column Stat Bonuses) ─────────── */
  async function parseBattleReport(file) {
    const img = await fileToImage(file);
    const W = img.naturalWidth, H = img.naturalHeight;

    // Split image into left (attacker) and right (defender) halves
    const mid = Math.round(W * 0.47);

    // Extract troops from TOP zone and stats from BOTTOM zone — parallel
    const [attTroops, defTroops, attStats, defStats] = await Promise.all([
      extractTroopsFromZone(img, 0,   mid),
      extractTroopsFromZone(img, mid, W),
      extractStatsFromZone(img, 0,   mid),
      extractStatsFromZone(img, mid, W),
    ]);

    return {
      attacker: { troops: attTroops, stats: attStats },
      defender: { troops: defTroops, stats: defStats },
    };
  }

  /* ── PARSER 2: Defender Stat Bonuses (single-column) ───────────── */
  async function parseDefStatBonuses(file) {
    const img = await fileToImage(file);
    const canvas = toCanvas(img, 1200);
    const { text } = await ocrFull(canvas);
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    const stats = parseStatLines(lines);

    let letPenalty = 0, hpPenalty = 0;
    for (const line of lines) {
      if (/enemy.*leth/i.test(line)) {
        const p = parsePct(line); if (p != null) letPenalty = p;
      }
      if (/enemy.*health/i.test(line)) {
        const p = parsePct(line); if (p != null) hpPenalty = p;
      }
    }
    return { stats, enemyLetPenalty: letPenalty, enemyHpPenalty: hpPenalty, rawText: text };
  }

  /* ── PARSER 3: Defender Troop Ratio (popup) ─────────────────────── */
  async function parseDefTroopRatio(file) {
    const img = await fileToImage(file);
    const canvas = toCanvas(img, 1200);
    const { text } = await ocrFull(canvas);
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

    // Find "Troops Total" — handles "1.1M", "1,100,000" etc.
    let total = null;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/troops?\s*total/i.test(line)) {
        // Value might be on same line after colon, or on the next line
        const afterColon = line.replace(/.*troops?\s*total\s*[:\s]*/i, '').trim();
        total = parseAmount(afterColon.replace(/[^0-9,.KkMmBb]/g, ''));
        if (!total && i + 1 < lines.length) {
          total = parseAmount(lines[i + 1].replace(/[^0-9,.KkMmBb]/g, ''));
        }
        if (total) break;
      }
    }

    // Find the three troop-type percentages that sum to ~100%
    const allPcts = [];
    const fullText = lines.join(' ');
    const pctRe = /(\d{1,3}(?:[.,]\d{1,2})?)\s*%/g;
    let m;
    while ((m = pctRe.exec(fullText)) !== null) {
      const v = parseFloat(m[1].replace(',', '.'));
      if (v >= 0 && v <= 100) allPcts.push(v);
    }

    let ratio = null;
    // Find first consecutive triplet summing to ~100
    for (let i = 0; i <= allPcts.length - 3; i++) {
      const a = allPcts[i], b = allPcts[i+1], c = allPcts[i+2];
      if (a + b + c >= 95 && a + b + c <= 105) {
        ratio = { inf: a, cav: b, arc: c }; break;
      }
    }
    // Fallback: try all combinations
    if (!ratio) {
      outer: for (let i = 0; i < allPcts.length; i++) {
        for (let j = i + 1; j < allPcts.length; j++) {
          for (let k = j + 1; k < allPcts.length; k++) {
            const sum = allPcts[i] + allPcts[j] + allPcts[k];
            if (sum >= 95 && sum <= 105) {
              ratio = { inf: allPcts[i], cav: allPcts[j], arc: allPcts[k] }; break outer;
            }
          }
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
    const xEnd = Math.round(W * 0.52);

    const [troops, stats] = await Promise.all([
      extractTroopsFromZone(img, 0, xEnd),
      extractStatsFromZone(img, 0, xEnd),
    ]);
    return { troops, stats };
  }

  /* ── Public API ─────────────────────────────────────────────────── */
  window.KingSim = window.KingSim || {};
  window.KingSim.pvpOcr = {
    parseBattleReport,
    parseAttackReport: parseBattleReport,
    parseDefStatBonuses,
    parseDefTroopRatio,
    parseAttackerStatsTroops,
  };
})();
