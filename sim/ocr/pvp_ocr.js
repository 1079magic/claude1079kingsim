// sim/ocr/pvp_ocr.js — PvP OCR module
// Reads troop AMOUNTS (not %) from attack reports and stat bonus blocks
(function () {
  'use strict';

  /* ── Tesseract loader (shared singleton) ─────────────────────────── */
  const CDN = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
  let _tPromise = null, _worker = null;
  function loadTesseract() {
    if (_tPromise) return _tPromise;
    _tPromise = new Promise((res, rej) => {
      if (window.Tesseract) { res(window.Tesseract); return; }
      const s = document.createElement('script');
      s.src = CDN; s.onload = () => res(window.Tesseract); s.onerror = () => rej(new Error('Tesseract load failed'));
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

  /* ── Image helpers ───────────────────────────────────────────────── */
  function fileToImage(file) {
    return new Promise((res, rej) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); res(img); };
      img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('Image load failed')); };
      img.src = url;
    });
  }

  function cropCanvas(img, x, y, w, h, targetW = 800) {
    const scaleX = img.naturalWidth / img.naturalWidth; // 1:1 if not resized
    const c = document.createElement('canvas');
    c.width  = Math.round(w * (targetW / img.naturalWidth));
    c.height = Math.round(h * (targetW / img.naturalWidth));
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, x, y, w, h, 0, 0, c.width, c.height);
    return c;
  }

  function fullCanvas(img, targetW = 1200) {
    const scale = targetW / img.naturalWidth;
    const c = document.createElement('canvas');
    c.width  = targetW;
    c.height = Math.round(img.naturalHeight * scale);
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, c.width, c.height);
    return c;
  }

  async function ocrCanvas(canvas) {
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

  /* ── Parsers ─────────────────────────────────────────────────────── */

  // Parse a number like "12,450" or "1.1M" → integer
  function parseAmount(s) {
    if (!s) return null;
    s = String(s).replace(/[^\d.,KkMm]/g, '');
    const m = s.match(/([\d,\.]+)\s*([KkMm]?)/);
    if (!m) return null;
    let n = parseFloat(m[1].replace(/,/g, ''));
    if (!isFinite(n)) return null;
    const suffix = m[2].toLowerCase();
    if (suffix === 'k') n *= 1000;
    if (suffix === 'm') n *= 1000000;
    return Math.round(n);
  }

  // Parse a percentage "+123.4%" → 123.4
  function parsePct(s) {
    if (!s) return null;
    const m = String(s).replace(/O/g, '0').match(/([+\-]?\d{1,4}(?:[.,]\d{1,2})?)\s*%/);
    return m ? parseFloat(m[1].replace(',', '.')) : null;
  }

  // Match stat label → key like 'inf_atk'
  const STAT_RE = {
    infantry: /\bin[a-z]{0,5}try\b/i,
    cavalry:  /\bcav[a-z]{0,4}ry\b/i,
    archer:   /\barc?h[a-z]*\b/i,
    attack:   /\battack\b/i,
    defense:  /\bdefense\b/i,
    leth:     /\bletha?lit[yv]\b/i,
    health:   /\bhealth\b/i,
  };

  function matchStatLabel(text) {
    const t = String(text);
    const type = STAT_RE.infantry.test(t) ? 'inf'
               : STAT_RE.cavalry.test(t)  ? 'cav'
               : STAT_RE.archer.test(t)   ? 'arc' : null;
    const stat = STAT_RE.attack.test(t)  ? 'atk'
               : STAT_RE.defense.test(t) ? 'def'
               : STAT_RE.leth.test(t)    ? 'let'
               : STAT_RE.health.test(t)  ? 'hp'  : null;
    return (type && stat) ? `${type}_${stat}` : null;
  }

  /* ── Parse stat bonuses block from raw text ──────────────────────── */
  function parseStatBlock(text) {
    const stats = {
      inf: { atk: 0, def: 0, let: 0, hp: 0 },
      cav: { atk: 0, def: 0, let: 0, hp: 0 },
      arc: { atk: 0, def: 0, let: 0, hp: 0 },
    };
    const lines = text.split('\n');
    for (let i = 0; i < lines.length - 1; i++) {
      const label = lines[i].trim();
      const key = matchStatLabel(label);
      if (!key) continue;
      // look for pct value on same or next line
      const [type, stat] = key.split('_');
      let pct = parsePct(label);
      if (pct == null) pct = parsePct(lines[i + 1]);
      if (pct != null) stats[type][stat] = pct;
    }
    return stats;
  }

  /* ── Parse troop amounts (numbers under icons) ───────────────────── */
  // Returns {inf, cav, arc} by scanning for 3 large numbers in sequence
  function parseTroopAmounts(text) {
    const nums = [];
    for (const line of text.split('\n')) {
      const cleaned = line.trim().replace(/[^\d,]/g, '');
      const n = parseAmount(cleaned);
      if (n != null && n > 100) nums.push(n);
      if (nums.length === 3) break;
    }
    if (nums.length < 3) return null;
    return { inf: nums[0], cav: nums[1], arc: nums[2] };
  }

  /* ── Parse Troop Type Ratio (%s under shield/horse/crossbow) ────── */
  function parseTroopRatio(text) {
    const pcts = [];
    const re = /(\d{1,3}(?:[.,]\d{1,2})?)\s*%/g;
    let m;
    while ((m = re.exec(text)) !== null) {
      pcts.push(parseFloat(m[1].replace(',', '.')));
      if (pcts.length === 3) break;
    }
    if (pcts.length < 2) return null;
    const inf = pcts[0] || 0;
    const cav = pcts[1] || 0;
    const arc = pcts[2] || Math.max(0, 100 - inf - cav);
    return { inf, cav, arc };
  }

  /* ── Parse Troops Total ──────────────────────────────────────────── */
  function parseTroopsTotal(text) {
    // Look for "Troops Total: 1.1M" or "139,010"
    const m = text.match(/(?:troops?\s*total[:\s]*)?([\d,\.]+\s*[KkMm]?)/i);
    if (!m) return null;
    return parseAmount(m[1]);
  }

  /* ── Public API ─────────────────────────────────────────────────── */

  /**
   * Parse an Attack Report image (left=attacker, right=defender).
   * Reads troop AMOUNTS (not %) from left side.
   */
  async function parseAttackReport(file) {
    const img = await fileToImage(file);
    const canvas = fullCanvas(img, 1200);
    const { text, words } = await ocrCanvas(canvas);

    const W = canvas.width, H = canvas.height;
    const midX = W * 0.5;

    // Left half = attacker
    const leftWords = words.filter(w => w.bbox.x0 < midX);
    const leftText = leftWords.sort((a, b) => a.bbox.y0 - b.bbox.y0).map(w => w.text).join('\n');

    const attTroops = parseTroopAmounts(leftText);
    const attStats  = parseStatBlock(leftText);

    return {
      attacker: {
        troops: attTroops,
        stats: attStats,
      },
      rawText: text,
    };
  }

  /**
   * Parse Def Troop Ratio image.
   * Reads Troops Total + Troop Type Ratio (%) 
   */
  async function parseDefTroopRatio(file) {
    const img = await fileToImage(file);
    const canvas = fullCanvas(img, 1200);
    const { text } = await ocrCanvas(canvas);

    const total = parseTroopsTotal(text);
    const ratio = parseTroopRatio(text);

    let troops = null;
    if (total && ratio) {
      troops = {
        inf: Math.round(total * ratio.inf / 100),
        cav: Math.round(total * ratio.cav / 100),
        arc: Math.round(total * ratio.arc / 100),
      };
    }

    return {
      total,
      ratio,
      troops,
      rawText: text,
    };
  }

  /**
   * Parse Def Stat Bonuses image.
   * Reads all stat lines for defender.
   */
  async function parseDefStatBonuses(file) {
    const img = await fileToImage(file);
    const canvas = fullCanvas(img, 1200);
    const { text } = await ocrCanvas(canvas);

    // Stats are on the RIGHT side of the screen (defender column)
    const W = canvas.width;
    const { words } = await ocrCanvas(canvas);
    const rightWords = words.filter(w => w.bbox.x0 > W * 0.45);
    const rightText = rightWords.sort((a, b) => a.bbox.y0 - b.bbox.y0).map(w => w.text).join('\n');

    const defStats = parseStatBlock(rightText.length > 100 ? rightText : text);

    // Also look for enemy penalties
    const letPenM = text.match(/enemy\s+leth[a-z]*\s+penalty[^-\d]*(-?\d+(?:[.,]\d+)?)\s*%/i);
    const hpPenM  = text.match(/enemy\s+health\s+penalty[^-\d]*(-?\d+(?:[.,]\d+)?)\s*%/i);

    return {
      stats: defStats,
      enemyLetPenalty: letPenM ? parseFloat(letPenM[1].replace(',', '.')) : 0,
      enemyHpPenalty:  hpPenM  ? parseFloat(hpPenM[1].replace(',', '.'))  : 0,
      rawText: text,
    };
  }

  /**
   * Parse Attacker Stats/Troops image (left side only).
   */
  async function parseAttackerStatsTroops(file) {
    const img = await fileToImage(file);
    const canvas = fullCanvas(img, 1200);
    const { text, words } = await ocrCanvas(canvas);

    const W = canvas.width;
    const leftWords = words.filter(w => w.bbox.x0 < W * 0.52);
    const leftText = leftWords.sort((a, b) => a.bbox.y0 - b.bbox.y0).map(w => w.text).join('\n');

    const troops = parseTroopAmounts(leftText);
    const stats  = parseStatBlock(leftText.length > 50 ? leftText : text);

    return {
      troops,
      stats,
      rawText: text,
    };
  }

  window.KingSim = window.KingSim || {};
  window.KingSim.pvpOcr = {
    parseAttackReport,
    parseDefTroopRatio,
    parseDefStatBonuses,
    parseAttackerStatsTroops,
  };
})();
