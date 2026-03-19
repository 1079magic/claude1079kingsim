// sim/ocr/pvp_ocr.js — v4
// Ground-truth tested against Atk-def-import.jpg (923x2000px):
//   Troop numbers at Y~564px (28.2% of 2000px height)
//   Stat Bonuses table at Y~700px+ (35%+)
//   Stats format: "+579.2% Infantry Attack +559.9%" (attacker | label | defender)
//
// Strategy:
//   1. Crop top 33% of image (0 to 660px) — captures troop numbers safely
//      Use full-width TSV OCR to get x-positions, split left vs right by mid-x
//   2. Crop bottom 65% of image (700px+) — captures stats table
//      Use full-width OCR, parse dual-column: "+ATT% Label +DEF%"
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
    return _worker;
  }

  /* ── Image → canvas helpers ─────────────────────────────────────── */
  function fileToImage(file) {
    return new Promise((res, rej) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload  = () => { URL.revokeObjectURL(url); res(img); };
      img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('Image load failed')); };
      img.src = url;
    });
  }

  function toCanvas(img, targetW, y0pct = 0, y1pct = 1) {
    const W = img.naturalWidth, H = img.naturalHeight;
    const srcY = Math.round(H * y0pct);
    const srcH = Math.round(H * (y1pct - y0pct));
    const scale = targetW / W;
    const c = document.createElement('canvas');
    c.width  = targetW;
    c.height = Math.round(srcH * scale);
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, srcY, W, srcH, 0, 0, c.width, c.height);
    return { canvas: c, srcW: W };
  }

  /* ── Tesseract wrappers ─────────────────────────────────────────── */
  async function ocrText(canvas) {
    const w = await getWorker();
    await w.setParameters({ tessedit_pageseg_mode: '6' });
    const { data } = await w.recognize(canvas.toDataURL('image/png'));
    return data.text || '';
  }

  // Returns words with bounding boxes (x, y, w, h) in the canvas coordinate space
  async function ocrWords(canvas) {
    const w = await getWorker();
    await w.setParameters({ tessedit_pageseg_mode: '6' });
    const { data } = await w.recognize(canvas.toDataURL('image/png'));
    return (data.words || []).map(word => ({
      text: String(word.text).trim(),
      x0:  word.bbox.x0,
      x1:  word.bbox.x1,
      y0:  word.bbox.y0,
      conf: word.confidence,
    })).filter(w => w.text.length > 0 && w.conf > 10);
  }

  /* ── Number parser ───────────────────────────────────────────────── */
  function parseAmount(s) {
    if (!s) return null;
    s = String(s).trim();
    const mAbbr = s.match(/^([\d,\.]+)\s*([KkMmBb])/);
    if (mAbbr) {
      const n = parseFloat(mAbbr[1].replace(/,/g, ''));
      if (!isFinite(n)) return null;
      return Math.round(n * ({ k:1e3, m:1e6, b:1e9 }[mAbbr[2].toLowerCase()] || 1));
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
  // Matches stat labels even when OCR merges words (e.g. "InfantryLethality")
  const LABEL_PATTERNS = [
    [/infantry\s*att/i,    'inf', 'atk'],
    [/infantry\s*def/i,    'inf', 'def'],
    [/infantry\s*leth/i,   'inf', 'let'],
    [/infantry\s*hea/i,    'inf', 'hp' ],
    [/cavalry\s*att/i,     'cav', 'atk'],
    [/cavalry\s*def/i,     'cav', 'def'],
    [/cavalry\s*leth/i,    'cav', 'let'],
    [/cavalry\s*hea/i,     'cav', 'hp' ],
    [/arch\w*\s*att/i,     'arc', 'atk'],
    [/arch\w*\s*def/i,     'arc', 'def'],
    [/arch\w*\s*leth/i,    'arc', 'let'],
    [/arch\w*\s*hea/i,     'arc', 'hp' ],
  ];
  function matchLabel(txt) {
    for (const [re, type, stat] of LABEL_PATTERNS) {
      if (re.test(txt)) return { type, stat };
    }
    return null;
  }

  /* ── DUAL-COLUMN STAT PARSER ────────────────────────────────────── */
  // Each stat row is: "+ATT_VAL% Label Name +DEF_VAL%"
  // e.g.: "| +579.2% Infantry Attack +559.9%"
  // Left value = attacker, Right value = defender
  function parseDualStatLines(text) {
    const attStats = { inf:{atk:0,def:0,let:0,hp:0}, cav:{atk:0,def:0,let:0,hp:0}, arc:{atk:0,def:0,let:0,hp:0} };
    const defStats = { inf:{atk:0,def:0,let:0,hp:0}, cav:{atk:0,def:0,let:0,hp:0}, arc:{atk:0,def:0,let:0,hp:0} };

    const lines = text.split('\n');
    for (const rawLine of lines) {
      const line = rawLine.replace(/[|]/g, '').trim();
      if (!line) continue;

      // Find the stat label
      const key = matchLabel(line);
      if (!key) continue;

      // Find all percentage values on this line
      const pctMatches = [];
      const pctRe = /([+-]?\d{1,4}(?:\.\d{1,2})?)\s*%/g;
      let m;
      while ((m = pctRe.exec(line)) !== null) {
        pctMatches.push({ val: parseFloat(m[1]), idx: m.index });
      }
      if (pctMatches.length === 0) continue;

      // Find position of label in the line
      const labelMatch = line.match(/infantry|cavalry|arch/i);
      if (!labelMatch) {
        // Single value — could be either side, use as attacker
        if (pctMatches.length >= 1) attStats[key.type][key.stat] = pctMatches[0].val;
        continue;
      }
      const labelPos = labelMatch.index;

      // Values BEFORE label position = attacker (left column)
      // Values AFTER label position = defender (right column)
      const beforeLabel = pctMatches.filter(p => p.idx < labelPos);
      const afterLabel  = pctMatches.filter(p => p.idx > labelPos);

      if (beforeLabel.length > 0) attStats[key.type][key.stat] = beforeLabel[beforeLabel.length - 1].val;
      if (afterLabel.length > 0)  defStats[key.type][key.stat] = afterLabel[afterLabel.length - 1].val;
    }
    return { attStats, defStats };
  }

  /* ── TROOP EXTRACTION using word x-positions ─────────────────────── */
  // Scan top 33% of image, find numeric words, classify by x position vs midpoint
  async function extractTroopCounts(img) {
    const { canvas, srcW } = toCanvas(img, 1200, 0, 0.33);
    const canvasW = canvas.width;
    const midX = canvasW / 2; // midpoint in canvas coordinates

    const words = await ocrWords(canvas);

    // Filter to words that look like troop numbers: digits+commas, value 1000-9999999
    const leftNums  = [];
    const rightNums = [];

    for (const word of words) {
      const cleaned = word.text.replace(/[^0-9,]/g, '');
      if (!cleaned) continue;
      const n = parseAmount(cleaned);
      if (n == null || n < 1000 || n > 9999999) continue;

      // Classify by center x-position
      const centerX = (word.x0 + word.x1) / 2;
      if (centerX < midX) {
        leftNums.push({ n, x: centerX });
      } else {
        rightNums.push({ n, x: centerX });
      }
    }

    // Sort by x position (left to right = inf, cav, arc order)
    leftNums.sort((a, b) => a.x - b.x);
    rightNums.sort((a, b) => a.x - b.x);

    const toTroops = arr => arr.length >= 3
      ? { inf: arr[0].n, cav: arr[1].n, arc: arr[2].n }
      : arr.length === 2
        ? { inf: arr[0].n, cav: arr[1].n, arc: 0 }
        : arr.length === 1
          ? { inf: arr[0].n, cav: 0, arc: 0 }
          : null;

    return {
      left:  toTroops(leftNums),
      right: toTroops(rightNums),
    };
  }

  /* ── PARSER 1: Battle Report (full parseBattleReport) ────────────── */
  async function parseBattleReport(file) {
    const img = await fileToImage(file);

    // Step 1: Extract troop counts from top 33%
    const troops = await extractTroopCounts(img);

    // Step 2: Extract stats from full-width bottom 65%
    const { canvas: statCanvas } = toCanvas(img, 1200, 0.33, 1.0);
    const statText = await ocrText(statCanvas);
    const { attStats, defStats } = parseDualStatLines(statText);

    return {
      attacker: { troops: troops.left,  stats: attStats },
      defender: { troops: troops.right, stats: defStats },
    };
  }

  /* ── PARSER 2: Defender Stat Bonuses (single-column screen) ─────── */
  // Screen shows only defender stats, one column of values right-aligned
  async function parseDefStatBonuses(file) {
    const img = await fileToImage(file);
    const { canvas } = toCanvas(img, 1200);
    const text = await ocrText(canvas);
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

    // Single-column: each line is "Infantry Attack    +794.7%" (label then value)
    // OR just the value "+794.7%" on its own line
    const stats = { inf:{atk:0,def:0,let:0,hp:0}, cav:{atk:0,def:0,let:0,hp:0}, arc:{atk:0,def:0,let:0,hp:0} };
    let letPenalty = 0, hpPenalty = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/enemy.*leth/i.test(line)) { const p = parsePct(line); if (p != null) letPenalty = p; continue; }
      if (/enemy.*health/i.test(line)) { const p = parsePct(line); if (p != null) hpPenalty = p; continue; }

      const key = matchLabel(line);
      if (!key) continue;
      let pct = parsePct(line);
      if (pct == null && i + 1 < lines.length) pct = parsePct(lines[i + 1]);
      if (pct != null) stats[key.type][key.stat] = pct;
    }

    return { stats, enemyLetPenalty: letPenalty, enemyHpPenalty: hpPenalty };
  }

  /* ── PARSER 3: Defender Troop Ratio (popup) ─────────────────────── */
  async function parseDefTroopRatio(file) {
    const img = await fileToImage(file);
    const { canvas } = toCanvas(img, 1200);
    const text = await ocrText(canvas);
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

    // Find "Troops Total: 1.1M" line
    let total = null;
    for (let i = 0; i < lines.length; i++) {
      if (/troops?\s*total/i.test(lines[i])) {
        const after = lines[i].replace(/.*troops?\s*total\s*[:\s]*/i, '').trim();
        total = parseAmount(after.replace(/[^0-9,.KkMmBb]/g, ''));
        if (!total && i + 1 < lines.length) {
          total = parseAmount(lines[i + 1].replace(/[^0-9,.KkMmBb]/g, ''));
        }
        if (total) break;
      }
    }

    // Find three percentages summing to ~100%
    const allPcts = [];
    const fullText = lines.join(' ');
    let m;
    const pctRe = /(\d{1,3}(?:[.,]\d{1,2})?)\s*%/g;
    while ((m = pctRe.exec(fullText)) !== null) {
      const v = parseFloat(m[1].replace(',', '.'));
      if (v >= 0 && v <= 100) allPcts.push(v);
    }

    let ratio = null;
    for (let i = 0; i <= allPcts.length - 3 && !ratio; i++) {
      const [a, b, c] = allPcts.slice(i, i + 3);
      if (a + b + c >= 95 && a + b + c <= 105) ratio = { inf:a, cav:b, arc:c };
    }
    if (!ratio) {
      outer: for (let i = 0; i < allPcts.length; i++)
        for (let j = i+1; j < allPcts.length; j++)
          for (let k = j+1; k < allPcts.length; k++) {
            const sum = allPcts[i]+allPcts[j]+allPcts[k];
            if (sum >= 95 && sum <= 105) { ratio = { inf:allPcts[i], cav:allPcts[j], arc:allPcts[k] }; break outer; }
          }
    }

    const troops = total && ratio ? {
      inf: Math.round(total * ratio.inf / 100),
      cav: Math.round(total * ratio.cav / 100),
      arc: Math.round(total * ratio.arc / 100),
    } : null;

    return { total, ratio, troops };
  }

  /* ── PARSER 4: Attacker Stats/Troops (left half only) ───────────── */
  async function parseAttackerStatsTroops(file) {
    const img = await fileToImage(file);

    // Troops: left side of top 33%
    const troops = await extractTroopCounts(img);

    // Stats: left 52% of bottom 65%
    const { canvas: sc, srcW } = toCanvas(img, 1200, 0.33, 1.0);
    // Crop left half of stat canvas
    const halfW = Math.round(sc.width * 0.52);
    const halfCanvas = document.createElement('canvas');
    halfCanvas.width = halfW;
    halfCanvas.height = sc.height;
    halfCanvas.getContext('2d').drawImage(sc, 0, 0);
    const statText = await ocrText(halfCanvas);

    // Single-column stat parse for left side
    const { attStats } = parseDualStatLines(statText);
    // Also try plain single-column parse as fallback
    const { stats: singleStats } = await parseDefStatBonuses._internal(statText);
    // Merge: prefer dual-column att values, fill gaps with single-column
    for (const t of ['inf','cav','arc'])
      for (const s of ['atk','def','let','hp'])
        if (attStats[t][s] === 0 && singleStats[t][s] !== 0) attStats[t][s] = singleStats[t][s];

    return { troops: troops.left, stats: attStats };
  }

  // Internal helper for single-column stat parsing (reused above)
  parseDefStatBonuses._internal = function(text) {
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    const stats = { inf:{atk:0,def:0,let:0,hp:0}, cav:{atk:0,def:0,let:0,hp:0}, arc:{atk:0,def:0,let:0,hp:0} };
    for (let i = 0; i < lines.length; i++) {
      const key = matchLabel(lines[i]);
      if (!key) continue;
      let pct = parsePct(lines[i]);
      if (pct == null && i+1 < lines.length) pct = parsePct(lines[i+1]);
      if (pct != null) stats[key.type][key.stat] = pct;
    }
    return { stats };
  };

  /* ── Public API ─────────────────────────────────────────────────── */
  window.KingSim = window.KingSim || {};
  window.KingSim.pvpOcr = {
    parseBattleReport,
    parseAttackReport:         parseBattleReport,  // alias
    parseDefStatBonuses,
    parseDefTroopRatio,
    parseAttackerStatsTroops,
  };
})();
