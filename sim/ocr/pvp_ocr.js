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
    // OCR normalization: fix common misreads in numeric strings
    s = s.replace(/(\.)[lI]/g, '.1');       // "1.lM" / "1.IM" → "1.1M" (l/I read as 1)
    s = s.replace(/(\d)[lI]/g, '$11');       // "1lM" → "11M"
    s = s.replace(/[Oo]/g, '0');              // O/o → 0
    // European decimal: "1,1M" → "1.1M" (single digit, comma, 1-2 digits, then suffix)
    s = s.replace(/^(\d+),(\d{1,2})([KkMmBb])$/i, '$1.$2$3');
    // Colon-as-decimal: "1:1M" → "1.1M"
    s = s.replace(/^(\d+):(\d{1,2})([KkMmBb])$/i, '$1.$2$3');
    const mAbbr = s.match(/^([\d,\.]+)\s*([KkMmBb])/i);
    if (mAbbr) {
      let numStr = mAbbr[1];
      // Thousand-separator commas vs decimal comma
      if (/,\d{3}(,\d{3})*$/.test(numStr)) {
        numStr = numStr.replace(/,/g, '');    // "1,100,000" → "1100000"
      } else {
        numStr = numStr.replace(',', '.');    // "1,1" → "1.1" (European decimal)
      }
      const n = parseFloat(numStr);
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

    // Step 1: Extract troop counts from top 33% (with x-position classification)
    const troops = await extractTroopCounts(img);

    // Step 2: Detect TG level per side from badge in troop icon zone
    let tgLevels = { att: 0, def: 0 };
    try { tgLevels = await detectTGBothSides(img, 0.20, 0.30); } catch(_) {}
    const attTier = buildTierString(tgLevels.att);
    const defTier = buildTierString(tgLevels.def);

    // Step 3: Extract stats from full-width bottom 65%
    const { canvas: statCanvas } = toCanvas(img, 1200, 0.33, 1.0);
    const statText = await ocrText(statCanvas);
    const { attStats, defStats } = parseDualStatLines(statText);

    return {
      attacker: { troops: troops.left,  stats: attStats, tier: attTier },
      defender: { troops: troops.right, stats: defStats, tier: defTier },
      tgLevels,
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
        total = parseAmount(after.replace(/[^0-9,.KkMmBblI]/g, '')); // include lI for OCR fix
        if (!total && i + 1 < lines.length) {
          total = parseAmount(lines[i + 1].replace(/[^0-9,.KkMmBblI]/g, ''));
        }
        if (total) break;
      }
    }
    // Fallback: scan ALL lines for any M/K suffixed number > 50,000 (likely troop total)
    if (!total) {
      for (const line of lines) {
        const m = line.match(/([\d][\d,\.lI]*[KkMmBb])/);
        if (m) {
          const candidate = parseAmount(m[1]);
          if (candidate && candidate > 50000) { total = candidate; break; }
        }
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

    // TG detection
    let tgLevel = 0;
    try { tgLevel = await detectTGLevel(img, 0, 0.33); } catch(_) {}
    const tier = buildTierString(tgLevel);

    // Stats: FULL WIDTH stat zone — parseDualStatLines extracts attacker (left column)
    // DO NOT crop to left half: cropping truncates the label ("Infantry Attack" → "Infantry")
    // making matchLabel fail. Full-width text has "+579.2% Infantry Attack +559.9%"
    // and parseDualStatLines correctly identifies +579.2% as the attacker (before label) value.
    const { canvas: sc } = toCanvas(img, 1200, 0.33, 1.0);
    const statText = await ocrText(sc);
    const { attStats } = parseDualStatLines(statText);

    return { troops: troops.left, stats: attStats, tier };
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


  /* ── TG BADGE DETECTION (ported from stat_ocr.js v10.1) ──────────
   * Gold-cluster flood-fill approach:
   *   1. Scan troop icon zone for gold pixel clusters (the badge ring)
   *   2. Filter clusters that contain WHITE pixels inside (the digit)
   *   3. OCR each candidate as a single digit with whitelist "12345"
   *   4. Majority vote → TG level 1-5, or 0 (= no badge = base T10/T9/T6)
   * Works on the battle report image troop icon area (top 33%).
   * ─────────────────────────────────────────────────────────────── */

  function isGoldPx(r, g, b) {
    return r > 160 && g > 100 && b < 110 && (r - b) > 70;
  }
  function isWhitePx(r, g, b) {
    return r > 220 && g > 220 && b > 210;
  }

  function findBadgeCandidates(imgData, W, H, scanY0, scanY1) {
    const px = imgData.data;
    const visited = new Uint8Array(W * H);
    const candidates = [];

    for (let y = scanY0; y < scanY1; y++) {
      for (let x = 0; x < W; x++) {
        const idx = y * W + x;
        if (visited[idx]) continue;
        const i = idx * 4;
        if (!isGoldPx(px[i], px[i+1], px[i+2])) continue;

        // Flood-fill gold cluster
        const queue = [idx];
        visited[idx] = 1;
        let cnt = 0, mnX = x, mxX = x, mnY = y, mxY = y;

        while (queue.length) {
          const cur = queue.pop();
          const cy = (cur / W) | 0, cx = cur % W;
          cnt++;
          if (cx < mnX) mnX = cx; if (cx > mxX) mxX = cx;
          if (cy < mnY) mnY = cy; if (cy > mxY) mxY = cy;
          for (const [dx, dy] of [[-1,0],[1,0],[0,-1],[0,1]]) {
            const nx = cx+dx, ny = cy+dy;
            if (nx<0||nx>=W||ny<0||ny>=H) continue;
            const ni = ny*W+nx;
            if (visited[ni]) continue;
            const np = ni*4;
            if (isGoldPx(px[np], px[np+1], px[np+2])) { visited[ni]=1; queue.push(ni); }
          }
        }

        const bw = mxX-mnX+1, bh = mxY-mnY+1;
        if (cnt < 80 || cnt > 2500 || bw < 12 || bw > 70 || bh < 12 || bh > 70) continue;

        // Count white pixels inside bounding box
        let whiteCount = 0;
        for (let wy=mnY; wy<=mxY; wy++)
          for (let wx=mnX; wx<=mxX; wx++) {
            const wi=(wy*W+wx)*4;
            if (isWhitePx(px[wi],px[wi+1],px[wi+2])) whiteCount++;
          }

        const whiteRatio = whiteCount / Math.max(cnt, 1);
        if (whiteRatio < 0.03 || whiteCount < 3) continue;  // battle-report badges have lower white ratio
        const aspect = bw / Math.max(bh, 1);
        if (aspect < 0.3 || aspect > 3.0) continue;

        candidates.push({ goldCount:cnt, whiteCount, whiteRatio, x0:mnX, y0:mnY, x1:mxX, y1:mxY, w:bw, h:bh });
      }
    }
    return candidates;
  }

  async function readBadgeDigit(tWorker, img, badge) {
    const W = img.naturalWidth, H = img.naturalHeight;
    const results = [];

    for (const [padXF, padYF] of [[0.3, 0.2],[0.5, 0.3]]) {
      const padX = Math.round(badge.w * padXF), padY = Math.round(badge.h * padYF);
      const x0 = Math.max(0, badge.x0-padX), y0 = Math.max(0, badge.y0-padY);
      const x1 = Math.min(W-1, badge.x1+padX), y1 = Math.min(H-1, badge.y1+padY);
      const cw = x1-x0+1, ch = y1-y0+1;
      if (cw < 8 || ch < 8) continue;

      // Build B&W canvas: white pixels → black (digit), else → white
      const sc = document.createElement('canvas'); sc.width=cw; sc.height=ch;
      const sctx = sc.getContext('2d');
      sctx.drawImage(img, x0, y0, cw, ch, 0, 0, cw, ch);
      const sd = sctx.getImageData(0, 0, cw, ch); const spx = sd.data;
      for (let pi=0; pi<spx.length; pi+=4) {
        const v = isWhitePx(spx[pi],spx[pi+1],spx[pi+2]) ? 0 : 255;
        spx[pi]=spx[pi+1]=spx[pi+2]=v; spx[pi+3]=255;
      }
      sctx.putImageData(sd, 0, 0);

      const SCALE=8;
      const oc = document.createElement('canvas'); oc.width=cw*SCALE; oc.height=ch*SCALE;
      const octx=oc.getContext('2d'); octx.imageSmoothingEnabled=false;
      octx.drawImage(sc, 0, 0, oc.width, oc.height);

      for (const psm of [10, 7]) {
        try {
          await tWorker.setParameters({ tessedit_pageseg_mode: String(psm), tessedit_char_whitelist: '12345' });
          const { data:{text} } = await tWorker.recognize(oc.toDataURL('image/png'));
          const d = text.trim().replace(/[^1-5]/g,'');
          if (d.length >= 1) results.push(parseInt(d[0], 10));
        } catch(_) {}
      }
    }

    if (!results.length) return 0;
    const counts = {};
    for (const d of results) counts[d] = (counts[d]||0)+1;
    const sorted = Object.entries(counts).sort((a,b)=>b[1]-a[1]);
    return (sorted[0][1]>=2||sorted.length===1) ? parseInt(sorted[0][0],10) : 0;
  }

  /**
   * Detect TG level per side from the troop icon zone.
   * Left half of image = attacker badges, right half = defender badges.
   * Each side votes independently; returns highest agreed TG per side.
   * Returns { att: 0-5, def: 0-5 } (0 = no badge = T10 base).
   */
  async function detectTGBothSides(img, y0pct = 0.20, y1pct = 0.30) {
    const W = img.naturalWidth, H = img.naturalHeight;
    const scanY0 = Math.round(H * y0pct);
    const scanY1 = Math.round(H * y1pct);
    const midX   = Math.round(W / 2);

    // Full image pixel data
    const fc = document.createElement('canvas'); fc.width = W; fc.height = H;
    fc.getContext('2d').drawImage(img, 0, 0);
    const imgData = fc.getContext('2d').getImageData(0, 0, W, H);

    const allCandidates = findBadgeCandidates(imgData, W, H, scanY0, scanY1);
    if (!allCandidates.length) return { att: 0, def: 0 };

    // Split candidates by x-position
    const attCands = allCandidates.filter(c => ((c.x0 + c.x1) / 2) < midX);
    const defCands = allCandidates.filter(c => ((c.x0 + c.x1) / 2) >= midX);

    // Sort each side by white ratio desc
    const sortFn = (a, b) => {
      const rc = b.whiteRatio - a.whiteRatio;
      return Math.abs(rc) > 0.05 ? rc : b.goldCount - a.goldCount;
    };
    attCands.sort(sortFn);
    defCands.sort(sortFn);

    const T = await loadTesseract();
    const worker = await T.createWorker('eng', 1, {});

    async function voteSide(cands) {
      // Collect one reading per icon (up to 3 icons per side = 3 badge candidates)
      // Then return floor(average), e.g. (3+3+4)/3 = 3.33 → TG3
      const top = cands.slice(0, 4);  // up to 4 candidates (some icons may have 2 clusters)
      const digits = [];
      for (const badge of top) {
        const digit = await readBadgeDigit(worker, img, badge);
        if (digit >= 1 && digit <= 5) digits.push(digit);
      }
      if (!digits.length) return 0;
      // Average of all valid readings, floor to nearest integer
      const avg = digits.reduce((s, d) => s + d, 0) / digits.length;
      return Math.round(avg);  // (2+3+3)/3 = 2.67 → TG3, (3+3+4)/3 = 3.33 → TG3
    }

    try {
      const att = await voteSide(attCands);
      const def = await voteSide(defCands);
      return { att, def };
    } finally {
      await worker.terminate();
    }
  }

  /** Legacy single-value detectTGLevel for backward compat */
  async function detectTGLevel(img, y0pct = 0, y1pct = 0.33) {
    const r = await detectTGBothSides(img, 0.20, 0.30);
    return r.att || r.def || 0;
  }

  /** Build tier string from base level + TG digit: e.g. "T10.TG3" */
  function buildTierString(tgLevel) {
    // Base tier is always T10 for battle-report images (shows "Lv 10.0")
    // tgLevel 0 = plain T10, 1-5 = T10.TG1..TG5
    return (tgLevel >= 1 && tgLevel <= 5) ? `T10.TG${tgLevel}` : 'T10';
  }

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
