// sim/ocr/mystic_ocr.js — Mystic one‑box OCR (improved top‑band % + fixed totals + Lv 10.0 → T10)
// Row‑accurate Bonus Details + robust troop % + Lv/TG extraction (tolerant parsing)
(function () {
  'use strict';

  /* -----------------------------
   * Tesseract loader + 1 worker
   * ----------------------------- */
  const CDN = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
  let tPromise = null;
  let worker = null;
  function loadTesseract() {
    if (tPromise) return tPromise;
    tPromise = new Promise((resolve, reject) => {
      if (window.Tesseract) { resolve(window.Tesseract); return; }
      const s = document.createElement('script');
      s.src = CDN;
      s.onload = () => resolve(window.Tesseract);
      s.onerror = () => reject(new Error('Tesseract load failed'));
      document.head.appendChild(s);
    });
    return tPromise;
  }
  async function getWorker() {
    if (worker) return worker;
    const T = await loadTesseract();
    worker = await T.createWorker('eng', 1, {});
    await worker.setParameters({ tessedit_pageseg_mode: '6' });
    return worker;
  }

  /* -----------------------------
   * Image helpers
   * ----------------------------- */
  function fileToImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image load failed')); };
      img.src = url;
    });
  }
  function drawResized(img, targetW = 1200) {
    const W = img.naturalWidth, H = img.naturalHeight;
    const scale = targetW / W;
    const c = document.createElement('canvas');
    c.width = targetW;
    c.height = Math.round(H * scale);
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, c.width, c.height);
    return c;
  }

  /* -----------------------------
   * OCR helpers
   * ----------------------------- */
  async function recognizeCanvas(canvas) {
    const w = await getWorker();
    await w.setParameters({ tessedit_pageseg_mode: '6' });
    const { data } = await w.recognize(canvas.toDataURL('image/png'));
    // normalize
    const words = (data.words || []).map(w => ({
      text: String(w.text).trim(),
      bbox: { x0:w.bbox.x0, y0:w.bbox.y0, x1:w.bbox.x1, y1:w.bbox.y1 }
    })).filter(w => w.text.length);
    return { words };
  }

  // tolerant label & percent parsing (kept from your version)  ────────────────────────────  [1](https://tipicoltd-my.sharepoint.com/personal/hadzisejdice_tipico_com/Documents/Datoteke%20aplikacije%20Microsoft%20Copilot%20Chat/rng.js)
  const ORDER_KEYS = [
    'inf_atk','inf_def','inf_let','inf_hp',
    'cav_atk','cav_def','cav_let','cav_hp',
    'arc_atk','arc_def','arc_let','arc_hp'
  ];
  const TOKENS = {
    infantry: /\bin?f[a-z]{0,3}try\b/i,
    cavalry:  /\bcav[a-z]{0,4}ry\b/i,
    archer:   /\barche?r\.?\b/i,
    attack:   /\batta?ck\b/i,
    defense:  /\bdefe?nse\b/i,
    leth:     /\bletha?lit[yv]\b/i,
    health:   /\bhea[lI]th\b/i
  };
  function matchLabel(labelTxt) {
    const l = String(labelTxt);
    const troop = TOKENS.infantry.test(l) ? 'inf'
               : TOKENS.cavalry.test(l)  ? 'cav'
               : TOKENS.archer.test(l)   ? 'arc' : null;
    const arm = TOKENS.attack.test(l) ? 'atk'
              : TOKENS.defense.test(l) ? 'def'
              : TOKENS.leth.test(l)    ? 'let'
              : TOKENS.health.test(l)  ? 'hp' : null;
    return (troop && arm) ? `${troop}_${arm}` : null;
  }
  function tokensToText(tokens) {
    return tokens
      .slice()
      .sort((a,b)=>a.bbox.x0-b.bbox.x0)
      .map(w=>String(w.text))
      .join(' ')
      .replace(/\s+/g,' ')
      .trim();
  }
  function percentFromText(s) {
    if (!s) return null;
    const fixed = s.replace(/O/g,'0');
    const m = fixed.match(/([+\-]?\d{1,3}(?:[.,]\d{1,2})?)\s*%/);
    return m ? parseFloat(m[1].replace(',', '.')) : null;
  }
  function isPercentToken(s) { return /%/.test(String(s)); }

  // [kept] find the Bonus Details band and cluster its 12 rows  ───────────────────────────  [1](https://tipicoltd-my.sharepoint.com/personal/hadzisejdice_tipico_com/Documents/Datoteke%20aplikacije%20Microsoft%20Copilot%20Chat/rng.js)
  function findBonusRegion(words, H) {
    const bonus = words.filter(w => /bonus/i.test(w.text));
    const details = words.filter(w => /details/i.test(w.text));
    if (!bonus.length || !details.length) {
      const y0 = Math.round(H * 0.40), y1 = Math.round(H * 0.94);
      return { yTop: y0, yBottom: y1 };
    }
    bonus.sort((a,b)=>a.bbox.y0-b.bbox.y0);
    const b = bonus[0];
    let best = null, bestDy=1e9;
    for (const d of details) {
      const dy = Math.abs(d.bbox.y0 - b.bbox.y0);
      if (dy < bestDy) { best = d; bestDy = dy; }
    }
    const yTop = Math.max(0, Math.min(b.bbox.y0, best.bbox.y0) - Math.round(H*0.01));
    const btn = words.filter(w => /\bbattle\b|\bpower\b/i.test(w.text))
                     .sort((a,b)=>a.bbox.y0-b.bbox.y0);
    const yBottom = btn.length ? Math.min(H-1, btn[0].bbox.y0 - Math.round(H*0.01))
                               : Math.round(H*0.94);
    return { yTop, yBottom };
  }
  function clusterRows(words, yTop, yBottom, expected=12) {
    const target = words.filter(w => w.bbox.y0 >= yTop && w.bbox.y1 <= yBottom);
    target.sort((a,b)=> (a.bbox.y0+a.bbox.y1)/2 - (b.bbox.y0+b.bbox.y1)/2);
    const rows = [];
    const rowGap = Math.max(8, Math.round((yBottom-yTop)/(expected*3)));
    for (const w of target) {
      const yc =(w.bbox.y0 + w.bbox.y1)/2;
      let found = false;
      for (const r of rows) {
        if (Math.abs(r.yc - yc) <= rowGap) {
          r.words.push(w); r.yc = (r.yc*(r.count)+yc)/(r.count+1); r.count++; found=true; break;
        }
      }
      if (!found) rows.push({ yc, words:[w], count:1 });
    }
    rows.sort((a,b)=>a.yc-b.yc);
    return rows.slice(0, expected);
  }
  function buildRow(row, xMid, W) {
    const left  = row.words.filter(w=> w.bbox.x1 <= xMid).sort((a,b)=>a.bbox.x0-b.bbox.x0);
    const right = row.words.filter(w=> w.bbox.x0 >= xMid).sort((a,b)=>a.bbox.x0-b.bbox.x0);
    const midL = xMid - W*0.10, midR = xMid + W*0.10;
    const mid = row.words.filter(w => w.bbox.x0>=midL && w.bbox.x1<=midR)
                         .sort((a,b)=>a.bbox.x0-b.bbox.x0);
    const midTxt = tokensToText(mid.length ? mid : row.words);
    let lTxt = left.find(w=>isPercentToken(w.text))?.text; if (!lTxt) lTxt = tokensToText(left);
    let rTxt = right.find(w=>isPercentToken(w.text))?.text; if (!rTxt) rTxt = tokensToText(right);
    return { labelTxt: midTxt, leftPct: percentFromText(lTxt), rightPct: percentFromText(rTxt) };
  }
  function mapLabelToKey(label, fallbackKey) {
    const key = matchLabel(label);
    return key || fallbackKey;
  }

  // -----------------------------
  // [NEW] Top‑band troop % extraction
  // -----------------------------
  function inRange(n, lo, hi){ return Number.isFinite(n) && n >= lo && n <= hi; }
  function chooseTriple(items){
    // items: [{val(0..100), x, y}]
    // Return the triple with sum nearest to 100 (and minimal x‑spread penalty)
    if (items.length < 3) return null;
    let best = null, bestErr = 1e9, bestSpread = 1e9;
    const N = items.length;
    for (let a=0;a<N;a++){
      for (let b=a+1;b<N;b++){
        for (let c=b+1;c<N;c++){
          const trip = [items[a],items[b],items[c]].sort((p,q)=>p.x-q.x);
          const sum = trip[0].val + trip[1].val + trip[2].val;
          const err = Math.abs(100 - sum);
          const spread = (trip[2].x - trip[0].x);
          if (err < bestErr || (err === bestErr && spread < bestSpread)){
            bestErr = err; bestSpread = spread; best = trip;
          }
        }
      }
    }
    return best; // left→right sorted
  }

  function extractTopPercents(words, xMid, yTop, H){
    // Take a band above Bonus Details: last 30% of the upper area
    const bandTop = 0;
    const bandBottom = Math.max(0, yTop - Math.round(H*0.05)); // just above “Bonus Details”
    const band = words.filter(w => w.bbox.y1 < bandBottom);

    const pctTokens = band
      .filter(w => /%/.test(w.text))
      .map(w => {
        const m = String(w.text).match(/([+\-]?\d{1,3}(?:[.,]\d{1,2})?)\s*%/);
        const v = m ? parseFloat(m[1].replace(',', '.')) : NaN;
        return { val: v, x:(w.bbox.x0+w.bbox.x1)/2, y:(w.bbox.y0+w.bbox.y1)/2, box:w.bbox, raw:w.text };
      })
      .filter(o => inRange(o.val, 0, 100));

    const left  = pctTokens.filter(t => t.x <= xMid);
    const right = pctTokens.filter(t => t.x >= xMid);

    // Cluster by row (simple y‑banding) then pick best triple in the densest row
    function bestForSide(arr){
      if (arr.length < 3) return null;
      // bucket by y with a tolerance
      const byRow = [];
      const tolY = 16;
      arr.sort((a,b)=>a.y-b.y);
      for (const t of arr){
        let put = false;
        for (const r of byRow){
          if (Math.abs(r.y - t.y) <= tolY){ r.y=(r.y*r.n + t.y)/(r.n+1); r.items.push(t); r.n++; put=true; break; }
        }
        if (!put) byRow.push({ y:t.y, n:1, items:[t] });
      }
      // sort rows by how many % tokens they contain (desc)
      byRow.sort((a,b)=> b.items.length - a.items.length);
      for (const r of byRow){
        const best = chooseTriple(r.items);
        if (best) return best; // left→right order
      }
      return null;
    }

    const L = bestForSide(left);
    const R = bestForSide(right);

    // Map left→right order to troop types: [ARC, CAV, INF] as per user's layout note
    function toFractions(triple){
      if (!triple) return null;
      const inf = triple[0].val/100, cav = triple[1].val/100, arc = triple[2].val/100;
      const s = inf + cav + arc || 1;
      return { inf:fix(inf/s), cav:fix(cav/s), arc:fix(arc/s) };
    }

    return { left: toFractions(L), right: toFractions(R) };
  }

  // [kept] Level detector (we force T10 when “Lv 10.0” appears in top band)  ───────────────  [1](https://tipicoltd-my.sharepoint.com/personal/hadzisejdice_tipico_com/Documents/Datoteke%20aplikacije%20Microsoft%20Copilot%20Chat/rng.js)
  function readLevelsAvgFromWords(words) {
    const lvTokens = words.filter(w=> /^lv\.?$/i.test(w.text));
    if (!lvTokens.length) return null;
    const vals = [];
    for (const lv of lvTokens) {
      const yc = (lv.bbox.y0+lv.bbox.y1)/2;
      const sameRow = words
        .filter(w=> Math.abs(((w.bbox.y0+w.bbox.y1)/2)-yc) < 16 && w.bbox.x0 > lv.bbox.x1)
        .sort((a,b)=> a.bbox.x0-b.bbox.x0);
      let buf = '';
      for (const t of sameRow) {
        const s = String(t.text).trim();
        if (/^[0-9.]+$/.test(s)) { buf += s.replace(/[^\d.]/g,''); if (buf.length >= 3) break; }
      }
      const val = parseFloat(buf);
      if (Number.isFinite(val)) vals.push(val);
    }
    if (!vals.length) return null;
    const mean = vals.reduce((a,b)=>a+b,0)/vals.length;
    const level = Math.max(1, Math.min(15, Math.floor(mean)));
    return level;
  }
  function tierFrom(lv, tg) {
    const L = Number.isFinite(lv)? lv : 10;
    return (Number.isFinite(tg) && tg>=1 && tg<=5) ? `T${L}.TG${tg}` : `T${L}`;
  }

  /* -----------------------------
   * Main parse function (extended)
   * ----------------------------- */
    async function parseBonusDetailsBoth(file, setStatus) {
      setStatus('Preparing…');
      const img = await fileToImage(file);

      // 1) upscale a bit more (helps on tall phone screenshots)
      const scaled = drawResized(img, 1600);
      const H = scaled.height, W = scaled.width, xMid = Math.round(W*0.5);

      setStatus('OCR pass…');
      const wkr = await getWorker();
      await wkr.setParameters({ tessedit_pageseg_mode: '6' });
      const { data } = await wkr.recognize(scaled.toDataURL('image/png'));

      // normalize words
      const words = (data.words || []).map(w => ({
        text: String(w.text).trim(),
        bbox: { x0:w.bbox.x0, y0:w.bbox.y0, x1:w.bbox.x1, y1:w.bbox.y1 }
      })).filter(w => w.text.length);

      // ========== DEBUG (optional) ==========
      // Toggle to visualize bands/points quickly during dev.
      const DEBUG = false;
      function drawBox(ctx, box, color, label){
        if (!DEBUG) return;
        ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.strokeRect(box.x0, box.y0, (box.x1-box.x0), (box.y1-box.y0));
        if (label){ ctx.fillStyle = color; ctx.font = '14px monospace'; ctx.fillText(label, box.x0+4, box.y0+16); }
      }
      if (DEBUG){
        const ctx = scaled.getContext('2d');
        words.slice(0,100).forEach((w,i)=> drawBox(ctx, w.bbox, 'rgba(0,255,255,.35)', `${i}:${w.text}`));
        document.body.appendChild(scaled); scaled.style.cssText='position:fixed;inset:auto 8px 8px auto;max-height:50vh;border:1px solid #0ff;z-index:99999';
      }
      // ========== /DEBUG ==========

      // ---------- A) Anchor the "Bonus Details" card precisely ----------
      setStatus('Locating Bonus Details…');
      const bonusTokens = words.filter(w => /bonus/i.test(w.text));
      const detailsTokens = words.filter(w => /details/i.test(w.text));

      // Find the closest pair on the same row (min |y0 - y0|)
      let bonusY = null;
      if (bonusTokens.length && detailsTokens.length){
        let best = null, dyBest = 1e9;
        for (const b of bonusTokens){
          for (const d of detailsTokens){
            const dy = Math.abs(((b.bbox.y0+b.bbox.y1)/2) - ((d.bbox.y0+d.bbox.y1)/2));
            if (dy < dyBest){ dyBest = dy; best = {b,d}; }
          }
        }
        // The heading row y (slightly below, to avoid the title line)
        bonusY = Math.max(best.b.bbox.y0, best.d.bbox.y0);
      }

      // Define a tight band for the table: start a little below the heading,
      // stop well above the bottom buttons
      const yTop = (bonusY != null) ? Math.min(H-1, Math.round(bonusY + H*0.02)) : Math.round(H*0.42);
      const yBottomHard = Math.round(H * 0.90);
      if (DEBUG){ drawBox(scaled.getContext('2d'), {x0:0,y0:yTop,x1:W,y1:yBottomHard}, 'rgba(255,255,0,.75)', 'Bonus band'); }

      // ---------- Extract the 12 rows (word-based, with adaptive row gap) ----------
      setStatus('Reading Bonus Details…');
      const inside = words.filter(w => w.bbox.y0 >= yTop && w.bbox.y1 <= yBottomHard);
      // cluster by y (adaptive gap)
      inside.sort((a,b)=> ((a.bbox.y0+a.bbox.y1)/2) - ((b.bbox.y0+b.bbox.y1)/2));
      const rows = [];
      const rowGap = Math.max(8, Math.round((yBottomHard-yTop)/(12*2.2))); // tighter than before
      for (const w of inside){
        const yc =(w.bbox.y0+w.bbox.y1)/2;
        let match = null;
        for (const r of rows){
          if (Math.abs(r.yc - yc) <= rowGap){ match = r; break; }
        }
        if (match){ match.words.push(w); match.yc = (match.yc*match.n + yc)/(match.n+1); match.n++; }
        else rows.push({ yc, words:[w], n:1 });
      }
      // Keep only the 12 most "wordy" rows to reduce noise
      rows.sort((a,b)=> b.words.length - a.words.length);
      const rowObjs = rows.slice(0,12).sort((a,b)=> a.yc-b.yc);

      // Row interpreter
      function parseRow(row){
        const left  = row.words.filter(w=> w.bbox.x1 <= xMid).sort((a,b)=>a.bbox.x0-b.bbox.x0);
        const right = row.words.filter(w=> w.bbox.x0 >= xMid).sort((a,b)=>a.bbox.x0-b.bbox.x0);
        const label = tokensToText(row.words.filter(w=> w.bbox.x0>=xMid*0.8 && w.bbox.x1<=xMid*1.2).length
                                  ? row.words.filter(w=> w.bbox.x0>=xMid*0.8 && w.bbox.x1<=xMid*1.2)
                                  : row.words);
        const lPct = percentFromText( left.find(w=>/%/.test(w.text))?.text || tokensToText(left) );
        const rPct = percentFromText( right.find(w=>/%/.test(w.text))?.text || tokensToText(right) );
        return { labelTxt: label, leftPct:lPct, rightPct:rPct };
      }

      let atkStats = {}, defStats = {};
      const parsedRows = rowObjs.map(parseRow);
      parsedRows.forEach((rowObj, idx)=>{
        const key = matchLabel(rowObj.labelTxt) || ORDER_KEYS[idx];
        if (Number.isFinite(rowObj.leftPct))  atkStats[key] = rowObj.leftPct;
        if (Number.isFinite(rowObj.rightPct)) defStats[key] = rowObj.rightPct;
      });

      // ---------- B) Text fallback if stats look empty ----------
      if (Object.keys(atkStats).length < 8 || Object.keys(defStats).length < 8){
        setStatus('Fallback: reading text lines…');

        const text = (data.text || '').replace(/\r/g,'');
        // tolerant label patterns
        const LBL = {
          inf_atk:/inf[a-z]*\s+attack/i,
          inf_def:/inf[a-z]*\s+def[a-z]*/i,
          inf_let:/inf[a-z]*\s+leth[a-z]*/i,
          inf_hp:/inf[a-z]*\s+hea[lI]th/i,
          cav_atk:/cav[a-z]*\s+attack/i,
          cav_def:/cav[a-z]*\s+def[a-z]*/i,
          cav_let:/cav[a-z]*\s+leth[a-z]*/i,
          cav_hp:/cav[a-z]*\s+hea[lI]th/i,
          arc_atk:/arch[a-z]*\s+attack/i,
          arc_def:/arch[a-z]*\s+def[a-z]*/i,
          arc_let:/arch[a-z]*\s+leth[a-z]*/i,
          arc_hp:/arch[a-z]*\s+hea[lI]th/i
        };
        const PCT=/([+\-]?\d{1,3}(?:[.,]\d{1,2})?)\s*%/g;

        function tryLine(lbl, line, targetSide){
          if (!lbl.test(line)) return false;
          const matches = [...line.matchAll(PCT)].map(m=>parseFloat(m[1].replace(',','.')));
          if (matches.length>=2){
            // assume left first, right second
            const [L,R] = matches;
            if (targetSide==='atk') atkStats[thisKey] = L;
            else defStats[thisKey] = R;
            return true;
          }
          return false;
        }

        // go line by line and fill both sides
        const lines = text.split('\n').map(s=>s.trim()).filter(Boolean);
        for (const key of ORDER_KEYS){
          const thisKey = key;
          const lbl = LBL[key];
          if (!lbl) continue;
          // find the earliest line that matches this label and has two %
          const line = lines.find(s=>lbl.test(s) && (s.match(PCT)||[]).length>=2);
          if (line){
            const [L,R] = [...line.matchAll(PCT)].map(m=>parseFloat(m[1].replace(',','.')));
            if (Number.isFinite(L)) atkStats[thisKey]=L;
            if (Number.isFinite(R)) defStats[thisKey]=R;
          }
        }
      }

      // ---------- C) Top-band troop % (row-binned) ----------
      setStatus('Reading troop %…');
      // select region above bonus title by a larger margin to include the three progress bars
      const bandBottom = (bonusY != null) ? Math.max(0, bonusY - Math.round(H*0.02)) : Math.round(H*0.38);
      const band = words.filter(w => w.bbox.y1 <= bandBottom);
      const pctTokens = band
        .filter(w => /%/.test(w.text))
        .map(w => {
          const m = w.text.match(/([+\-]?\d{1,3}(?:[.,]\d{1,2})?)\s*%/);
          const v = m ? parseFloat(m[1].replace(',','.')) : NaN;
          return { val:v, x:(w.bbox.x0+w.bbox.x1)/2, y:(w.bbox.y0+w.bbox.y1)/2, bbox:w.bbox };
        })
        .filter(o => Number.isFinite(o.val) && o.val >= 0 && o.val <= 100);

      // Bin % tokens into rows (three rows expected), then select densest row per side
      function triplesForSide(filterFn){
        const side = pctTokens.filter(filterFn).sort((a,b)=>a.y-b.y);
        const rows = [];
        const tolY = 14;
        for (const t of side){
          let r = rows.find(R=> Math.abs(R.y - t.y) <= tolY);
          if (!r){ r={y:t.y, n:0, items:[]}; rows.push(r); }
          r.items.push(t); r.n++;
          r.y = (r.y*(r.n-1)+t.y)/r.n;
        }
        rows.sort((a,b)=> b.items.length - a.items.length);
        const items = rows[0]?.items || [];
        // choose best triple summing ~100 with least x spread
        if (items.length < 3) return null;
        let best=null, err=1e9, spread=1e9;
        for (let i=0;i<items.length;i++){
          for (let j=i+1;j<items.length;j++){
            for (let k=j+1;k<items.length;k++){
              const trip=[items[i],items[j],items[k]].sort((p,q)=>p.x-q.x);
              const s=trip[0].val+trip[1].val+trip[2].val;
              const e=Math.abs(100-s); const sp=trip[2].x-trip[0].x;
              if (e<err || (e===err && sp<spread)){ err=e; spread=sp; best=trip; }
            }
          }
        }
        return best;
      }
      const L = triplesForSide(t => t.x <= xMid);
      const R = triplesForSide(t => t.x >= xMid);

      function toFractions(triple){
        if (!triple) return null;
        // User rule: icons are right→left = INF / CAV / ARC, so left→right shows ARC, CAV, INF
        const inf = triple[0].val/100, cav = triple[1].val/100, arc = triple[2].val/100;
        const s = inf + cav + arc || 1;
        return { inf:inf/s, cav:cav/s, arc:arc/s };
      }
      let atkFractions = toFractions(L);
      let defFractions = toFractions(R);

      // ---------- D) Troop amounts — try to read absolute numbers from top band ----------
      // Some trials (e.g. Knowledge Nexus) show actual troop amounts, not just %, under each icon.
      // We detect large comma-separated numbers (>1000) in the band above "Bonus Details".
      // If we find 3 numbers per side, we use them directly; otherwise fall back to 150k+fractions.

      setStatus('Reading troop amounts…');

      // Parse a word that could be a troop count: digits with optional comma separator
      function parseTroopCount(txt) {
        if (/%/.test(String(txt))) return NaN; // reject percentage tokens
        const s = String(txt).replace(/[,. ]/g, '').replace(/[Oo]/g,'0').replace(/[lI]/g,'1');
        const n = parseInt(s, 10);
        return (Number.isFinite(n) && n >= 1000 && n <= 999999) ? n : NaN;
      }

      // Collect numeric words in the top band (above Bonus Details heading)
      const topBandBottom = (bonusY != null) ? Math.max(0, bonusY - Math.round(H*0.01)) : Math.round(H*0.38);
      const topBandWords = words.filter(w => w.bbox.y1 <= topBandBottom);

      const countTokens = topBandWords
        .map(w => {
          const n = parseTroopCount(w.text);
          return Number.isFinite(n) ? { n, x:(w.bbox.x0+w.bbox.x1)/2, y:(w.bbox.y0+w.bbox.y1)/2, bbox:w.bbox } : null;
        })
        .filter(Boolean);

      // Split by midline into left (attacker) and right (defender)
      const cntLeft  = countTokens.filter(t => t.x <= xMid).sort((a,b) => a.x - b.x);
      const cntRight = countTokens.filter(t => t.x >  xMid).sort((a,b) => a.x - b.x);

      // Only accept if we find exactly 3 per side (or exactly 3 on attacker side)
      // Pick the 3 numbers that are horizontally closest together (the troop row)
      function pickTroopTriple(arr) {
        if (arr.length < 3) return null;
        // Cluster into rows by Y proximity; pick row with 3 numbers summing reasonably
        const rows = [];
        const tolY = 20;
        for (const t of arr) {
          let r = rows.find(R => Math.abs(R.y - t.y) <= tolY);
          if (!r) { r = {y:t.y, n:0, items:[]}; rows.push(r); }
          r.items.push(t); r.n++;
          r.y = (r.y*(r.n-1) + t.y) / r.n;
        }
        rows.sort((a,b) => b.items.length - a.items.length);
        for (const row of rows) {
          const items = row.items.sort((a,b) => a.x - b.x);
          if (items.length >= 3) return items.slice(0, 3);
        }
        return null;
      }

      const atkTriple = pickTroopTriple(cntLeft);
      const defTriple = pickTroopTriple(cntRight);

      // Build troop objects from triples
      // Icon order left→right in the image: INF (shield), CAV (horse), ARC (crossbow)
      let atkTroopCounts = null;
      let defTroopCounts = null;
      let atkTotal, defTotal;

      if (atkTriple && atkTriple.length === 3) {
        // Icons are left-to-right: INF, CAV, ARC (consistent with game layout)
        atkTroopCounts = {
          inf: atkTriple[0].n,
          cav: atkTriple[1].n,
          arc: atkTriple[2].n
        };
        atkTotal = atkTroopCounts.inf + atkTroopCounts.cav + atkTroopCounts.arc;
        // Derive fractions from actual counts (override percentage-based fractions)
        const s = atkTotal || 1;
        atkFractions = { inf: atkTroopCounts.inf/s, cav: atkTroopCounts.cav/s, arc: atkTroopCounts.arc/s };
        console.log('[OCR] attacker troop counts from image:', atkTroopCounts, 'total:', atkTotal);
      } else {
        atkTotal = 150000; // fixed fallback
      }

      if (defTriple && defTriple.length === 3) {
        defTroopCounts = {
          inf: defTriple[0].n,
          cav: defTriple[1].n,
          arc: defTriple[2].n
        };
        defTotal = defTroopCounts.inf + defTroopCounts.cav + defTroopCounts.arc;
        const s = defTotal || 1;
        defFractions = { inf: defTroopCounts.inf/s, cav: defTroopCounts.cav/s, arc: defTroopCounts.arc/s };
        console.log('[OCR] defender troop counts from image:', defTroopCounts, 'total:', defTotal);
      } else {
        defTotal = 150000; // fixed fallback
      }

      // Screenshot shows "Lv 10.0" in troop icons → T10
      const atkTier = 'T10';
      const defTier = 'T10';

      return { atkStats, defStats, atkTotal, defTotal, atkTier, defTier,
               atkFractions, defFractions, atkTroopCounts, defTroopCounts };
    }

  /* -----------------------------
   * UI glue (extended for PvE)
   * ----------------------------- */
  function setVal(id, v) {
    const el = document.getElementById(id);
    if (!el) return;
    el.value = (v == null ? '' : v);
    el.dispatchEvent(new Event('input', { bubbles:true }));
    el.dispatchEvent(new Event('change', { bubbles:true })); 
  }
  // sim/ocr/mystic_ocr.js  — add near other helpers
  function applyStats(sidePrefix /* 'att' | 'def' */, statsObj){
    if (!statsObj) return;
    const map = [
      ['inf','atk','inf_atk'], ['inf','def','inf_def'], ['inf','let','inf_let'], ['inf','hp','inf_hp'],
      ['cav','atk','cav_atk'], ['cav','def','cav_def'], ['cav','let','cav_let'], ['cav','hp','cav_hp'],
      ['arc','atk','arc_atk'], ['arc','def','arc_def'], ['arc','let','arc_let'], ['arc','hp','arc_hp'],
    ];
    map.forEach(([t,k,ocrKey])=>{
      const val = statsObj[ocrKey];
      const id = `${sidePrefix}_${t}_${k}`; // e.g., att_inf_atk
      if (Number.isFinite(val) && document.getElementById(id)) setVal(id, val);
    });
  }

  // sim/ocr/mystic_ocr.js  — add near other helpers
  function applyStatsToPVE(sidePrefix /* 'att' | 'def' */, statsObj){
    if (!statsObj) return;
    const map = [
      ['inf','atk','inf_atk'], ['inf','def','inf_def'], ['inf','let','inf_let'], ['inf','hp','inf_hp'],
      ['cav','atk','cav_atk'], ['cav','def','cav_def'], ['cav','let','cav_let'], ['cav','hp','cav_hp'],
      ['arc','atk','arc_atk'], ['arc','def','arc_def'], ['arc','let','arc_let'], ['arc','hp','arc_hp'],
    ];
    map.forEach(([t,k,ocrKey])=>{
      const val = statsObj[ocrKey];
      const id = `${sidePrefix}_${t}_${k}`; // e.g., att_inf_atk
      if (Number.isFinite(val) && document.getElementById(id)) setVal(id, val);
    });
  }

  // [NEW] write per‑type troops into PvE inputs (if present)
  function setTroopsToPVE(sidePrefix, total, fractions){
    if (!fractions) return; // fallback will be handled by UI
    const i = Math.round((fractions.inf||0) * total);
    const c = Math.round((fractions.cav||0) * total);
    const a = Math.max(0, total - i - c);
    const m = (id)=>document.getElementById(id);
    const p = (k)=>`${sidePrefix}_${k}`;
    if (m(p('inf'))) setVal(p('inf'), i);
    if (m(p('cav'))) setVal(p('cav'), c);
    if (m(p('arc'))) setVal(p('arc'), a);
  }


  function mount() {
    // ---- 0) Prevent double binding if script is injected twice
    if (window.__mysticOCRBound) return;
    window.__mysticOCRBound = true;

    // We may have both old (mt_*) and new (pve_*) controls on the same page.
    // Gather all present browse buttons & file inputs:
    const browseEls = [ 'mt_browse', 'pve_browse' ]
      .map(id => document.getElementById(id))
      .filter(Boolean);
    const fileEls = [ 'mt_file', 'pve_file' ]
      .map(id => document.getElementById(id))
      .filter(Boolean);

    // If nothing to wire, bail
    if (!browseEls.length || !fileEls.length) return;

    // Use the first file input as the primary; also listen on the rest
    const primaryFile = fileEls[0];

    // Status label can be either one
    const status = document.getElementById('mt_ocr_status') || document.getElementById('pve_ocr_status');
    const setStatus = (m)=> { if (status) status.textContent = (m || ''); };

    // Single-flight guard to avoid opening two dialogs at once
    let isOpening = false;

    async function handleFile(f) {
      if (!f) return;
      try {
        setStatus('⏳ OCR…');

        // First pass
        let out = await parseBonusDetailsBoth(f, setStatus);

        // Retry warm-up if first result is sparse
        const statsEmpty = !out || (Object.keys(out.atkStats||{}).length < 4 && Object.keys(out.defStats||{}).length < 4);
        const fracEmpty  = !out || (!out.atkFractions && !out.defFractions);
        if (statsEmpty && fracEmpty) {
          setStatus('Warming up OCR… retrying');
          await new Promise(res => setTimeout(res, 120));
          out = await parseBonusDetailsBoth(f, setStatus, /*_retry=*/true);
        }

        // Debug snapshot
        window.__lastOCR = out;
        console.log('[OCR] result:', out);

        // === Write to UI ===
        // Stats to mystic.html
        applyStats('mt_atk', out.atkStats);  // NOTE: applyStats expects full id: 'mt_atk_*'
        applyStats('mt_def', out.defStats);

        // Mirror to side-by-side panel
        applyStatsToPVE('att', out.atkStats);
        applyStatsToPVE('def', out.defStats);

        // Totals/tiers to both
        setVal('mt_atk_total', out.atkTotal);
        setVal('mt_def_total', out.defTotal);
        setVal('mt_atk_tier',  out.atkTier);
        setVal('mt_def_tier',  out.defTier);

        setVal('att_total', out.atkTotal);
        setVal('def_total', out.defTotal);
        setVal('att_tier',  out.atkTier);
        setVal('def_tier',  out.defTier);

        // Per-type troops to side-by-side
        // If we got exact counts from OCR, write them directly; else derive from fractions
        if (out.atkTroopCounts) {
          setVal('att_total', out.atkTotal);
          setVal('att_inf',   out.atkTroopCounts.inf);
          setVal('att_cav',   out.atkTroopCounts.cav);
          setVal('att_arc',   out.atkTroopCounts.arc);
        } else {
          setTroopsToPVE('att', out.atkTotal, out.atkFractions);
        }
        if (out.defTroopCounts) {
          setVal('def_total', out.defTotal);
          setVal('def_inf',   out.defTroopCounts.inf);
          setVal('def_cav',   out.defTroopCounts.cav);
          setVal('def_arc',   out.defTroopCounts.arc);
        } else {
          setTroopsToPVE('def', out.defTotal, out.defFractions);
        }

        
        setStatus('✅ Imported');
        // notify the runner that inputs changed, so user can re-run
        window.MysticUI?.markDirty?.();

      } catch (err) {
        console.error('[Mystic OCR] handleFile failed', err);
        setStatus('❌ ' + (err?.message || 'OCR failed'));
      } finally {
        // IMPORTANT: allow re-selecting the same file and re-enable dialog open
        try { this && (this.value = ''); } catch {}
        isOpening = false;
      }
    }

    // 1) Bind change on ALL file inputs (so either can work)
    fileEls.forEach(inp => {
      inp.addEventListener('change', async function onChange(e){
        const f = e.target.files?.[0];
        // 'this' here is the input; pass so we can reset its value in finally
        await handleFile.call(this, f);
      });
    });

    // 2) Bind click on ALL browse buttons, but ensure only one dialog opens
    browseEls.forEach(btn => {
      btn.addEventListener('click', (e) => {
        // Neutralize default/button bubbling that could trigger other handlers
        e.preventDefault();
        e.stopPropagation();

        if (isOpening) return; // already showing a dialog
        isOpening = true;

        // Prefer whichever file input sits next to this button; else use primary
        const container = btn.closest('.import-card') || btn.parentElement || document;
        const localFile = container.querySelector('input[type="file"]') || primaryFile;

        // Open the dialog exactly once
        localFile?.click();
      }, { capture: true }); // capture to beat any legacy listeners
    });

    // 3) (Optional) Also wire DnD if you still use a dropzone
    const dz = document.getElementById('mt_dz') || document.getElementById('pve_dz');
    if (dz) {
      ['dragenter','dragover'].forEach(ev =>
        dz.addEventListener(ev, e => { e.preventDefault(); e.stopPropagation(); dz.style.borderColor='#3b82f6'; }));
      ['dragleave','drop'].forEach(ev =>
        dz.addEventListener(ev, e => { e.preventDefault(); e.stopPropagation(); dz.style.borderColor='#30507a'; }));
      dz.addEventListener('drop', e => {
        if (isOpening) return;
        const f = e.dataTransfer?.files?.[0];
        if (!f) return;
        isOpening = true;
        handleFile.call(primaryFile, f);
      });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})();
