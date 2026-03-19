// sim/ui/mystic_onebox.js
(function(){
  'use strict';

  // Guard: avoid double wiring if script is injected twice
  if (window.__MysticRunnerBound) return;
  window.__MysticRunnerBound = true;

  const $  = (id)=> document.getElementById(id);
  const num = (v,d=0)=>{ const x=parseFloat(String(v).replace(',','.')); return Number.isFinite(x)?x:d; };
  const show = (el)=>{ if (el && el.style.display==='none') el.style.display='block'; };

  // Trial presets used when defender fractions are unknown
  const PRESETS = {
    'Crystal Cave':       { fi:0.60, fc:0.20, fa:0.20 },
    'Knowledge Nexus':    { fi:0.50, fc:0.20, fa:0.30 },
    'Radiant Spire':      { fi:0.50, fc:0.15, fa:0.35 },
    'Forest of Life':     { fi:0.50, fc:0.15, fa:0.35 },
    'Molten Fort':        { fi:0.60, fc:0.15, fa:0.25 },
    'Coliseum-March1-Calv2nd': { fi:0.50, fc:0.10, fa:0.40 },
    'Coliseum-March2-Calv1st': { fi:0.40, fc:0.40, fa:0.20 }
  };

  // Engine defaults (adaptive optimizer will refine around presets anyway)
  const DEFAULTS = { battlesPerPoint:120, sparsity:0.01, fiMin:0.40, fiMax:0.80, fcMin:0.15, fcMax:0.30, seed:1337 };

  // Set by OCR when inputs change
  let dirty = false;
  window.MysticUI = window.MysticUI || {};
  window.MysticUI.markDirty = function(){ dirty = true; const s=$('mt_status'); if (s){ s.textContent='Ready'; s.style.color=''; } };

  // ------------- helpers to read from att_*/def_* first, fallback to mt_* -------------
  function pickId(...ids){ for (const id of ids){ const el=$(id); if (el) return el; } return null; }

  function readSideStats(side /* 'att'|'def' */){
    // Data sources (prefer side-by-side, then legacy mt_*):
    const src = (t,k) => {
      const pve = pickId(`${side}_${t}_${k}`);
      if (pve) return num(pve.value, 100);
      const mt  = pickId(`mt_${side==='att'?'atk':'def'}_${t}_${k}`);
      return num(mt?.value, 100);
    };
    return {
      attack:   { inf:src('inf','atk'), cav:src('cav','atk'), arc:src('arc','atk') },
      defense:  { inf:src('inf','def'), cav:src('cav','def'), arc:src('arc','def') },
      lethality:{ inf:src('inf','let'), cav:src('cav','let'), arc:src('arc','let') },
      health:   { inf:src('inf','hp'),  cav:src('cav','hp'),  arc:src('arc','hp') }
    };
  }

  function readTotals(side /* 'att'|'def' */){
    const el = pickId(`${side}_total`, `mt_${side==='att'?'atk':'def'}_total`);
    return Math.max(0, num(el?.value, 0));
  }
  function readTier(side){
    const el = pickId(`${side}_tier`, `mt_${side==='att'?'atk':'def'}_tier`);
    return el?.value || 'T10';
  }
  function readPerTypeCounts(side){
    const inf = num($( `${side}_inf` )?.value, 0);
    const cav = num($( `${side}_cav` )?.value, 0);
    const arc = num($( `${side}_arc` )?.value, 0);
    const sum = inf+cav+arc;
    if (sum>0) return { inf, cav, arc };
    return null;
  }
  function fractionsFromCounts(counts){
    const s = Math.max(1, (counts.inf||0)+(counts.cav||0)+(counts.arc||0));
    return { fi:(counts.inf||0)/s, fc:(counts.cav||0)/s, fa:(counts.arc||0)/s };
  }

  // ----------------------------- RENDER -----------------------------
  // --- replace the existing render helpers with these ---

  function renderBestLineAndTable(bestFractions, totals, trial, bestScores){
    const fi=bestFractions.fi, fc=bestFractions.fc, fa=Math.max(0, 1 - fi - fc);
    const pI=(fi*100).toFixed(1), pC=(fc*100).toFixed(1), pA=(fa*100).toFixed(1);

    const tail = (bestScores && (bestScores.atkScore!=null || bestScores.defScore!=null))
      ? ` · AtkScore=${bestScores.atkScore ?? 'N/A'} · DefScore=${bestScores.defScore ?? 'N/A'}`
      : '';

    $('mt_bestline').textContent =
      `Best composition ≈ ${pI}/${pC}/${pA} (Inf/Cav/Arc) · Win ≈ ${bestFractions.winPct ?? '—'}%${tail} · ${trial}`;

    const alloc=(T)=>({ i:Math.round(fi*T), c:Math.round(fc*T), a:Math.max(0, T - Math.round(fi*T) - Math.round(fc*T)) });
    const A=alloc(totals.attacker);

    const t = document.createElement('table');
    t.innerHTML = `
      <thead><tr>
        <th>Formation (I/C/A %)</th><th>Inf troops</th><th>Cav troops</th><th>Arc troops</th>
      </tr></thead>
      <tbody>
        <tr>
          <td>${pI}/${pC}/${pA}</td>
          <td>${A.i.toLocaleString()}</td>
          <td>${A.c.toLocaleString()}</td>
          <td>${A.a.toLocaleString()}</td>
        </tr>
      </tbody>`;
    const wrap=$('mt_tablewrap'); if (wrap){ wrap.innerHTML=''; wrap.appendChild(t); }

    const panel = $('mt_results'); if (panel && panel.style.display==='none') panel.style.display='block';
  }

  function renderScoreboard(rows, attackerTotal, defFractions, scannedCount){
    // ensure host div exists (just under the “best” table)
    let host = document.getElementById('mt_whytbl');
    if (!host){
      host = document.createElement('div');
      host.id = 'mt_whytbl';
      $('mt_tablewrap').parentElement.appendChild(host);
    }

    const di = (defFractions.fi*100).toFixed(1);
    const dc = (defFractions.fc*100).toFixed(1);
    const da = (defFractions.fa*100).toFixed(1);

    const body = rows.map(p=>{
      const i = Math.round(p.fi * attackerTotal);
      const c = Math.round(p.fc * attackerTotal);
      const a = Math.max(0, attackerTotal - i - c);
      const atkScore = (p.atkScore!=null ? p.atkScore : 'N/A');
      const defScore = (p.defScore!=null ? p.defScore : 'N/A');
      return `
        <tr>
          <td>${p.label}</td>
          <td>${atkScore}</td>
          <td>${di}/${dc}/${da}</td>
          <td>${defScore}</td>
        </tr>`;
    }).join('');

    host.innerHTML = `
      <h3 style="margin-top:14px">Scoreboard</h3>
      <div class="muted" style="margin:6px 0 8px 0">Scanned ${scannedCount.toLocaleString()} formations; showing top 10.</div>
      <table>
        <thead>
          <tr>
            <th>Attacker</th>
            <th>Atk_Score</th>
            <th>Defender</th>
            <th>Def_Score</th>
          </tr>
        </thead>
        <tbody>${body}</tbody>
      </table>`;
  }

  // --- replace the run() function with this version ---
  async function run(){
    const status = $('mt_status'); const resPanel=$('mt_results');
    if (!status){ console.warn('[Mystic] #mt_status missing'); return; }
    status.textContent='Running…'; status.style.color='#9aa4b2';

    const trial = $('mt_trial')?.value || 'Crystal Cave';

    // Read bases
    const totals = {
      attacker: readTotals('att') || readTotals('mt_atk'),
      defender: readTotals('def') || readTotals('mt_def')
    };
    const attackerBase = {
      totalTroops: totals.attacker,
      tier: readTier('att'),
      stats: readSideStats('att')
    };
    const defenderCounts = readPerTypeCounts('def');
    const defenderBase = {
      totalTroops: totals.defender,
      tier: readTier('def'),
      stats: readSideStats('def'),
      troops: defenderCounts || undefined
    };

    // Defender fractions: counts → OCR → defender fallback
    const DEF_PRESETS = {
      'Crystal Cave':            { fi:0.40, fc:0.30, fa:0.30 },
      'Knowledge Nexus':         { fi:0.40, fc:0.30, fa:0.30 },
      'Forest of Life':          { fi:0.40, fc:0.30, fa:0.30 },
      'Molten Fort':             { fi:0.40, fc:0.30, fa:0.30 },
      'Radiant Spire':           { fi:0.40, fc:0.30, fa:0.30 },
      'Coliseum-March1-Calv2nd': { fi:0.40, fc:0.30, fa:0.30 },
      'Coliseum-March2-Calv1st': { fi:0.40, fc:0.30, fa:0.30 }
    };
    let defFractions =
      (defenderCounts && (()=>{
        const s = (defenderCounts.inf||0)+(defenderCounts.cav||0)+(defenderCounts.arc||0) || 1;
        return { fi:(defenderCounts.inf||0)/s, fc:(defenderCounts.cav||0)/s, fa:(defenderCounts.arc||0)/s };
      })()) ||
      (window.__lastOCR && window.__lastOCR.defFractions) ||
      DEF_PRESETS[trial] || { fi:0.40, fc:0.30, fa:0.30 };

    try{
      const opt = window.KingSim?._optimizer;
      let out;

      // ── NEW battleCore engine (validated, correct formation ordering) ──
      const _mo = window.KingSim && window.KingSim.mysticOptimizer;
      if (_mo && _mo.scanMysticTrials) {
        const attSt = attackerBase.stats || {};
        const defSt = defenderBase.stats || {};
        const defCO = defenderBase.troops && ((defenderBase.troops.inf||0)+(defenderBase.troops.cav||0)+(defenderBase.troops.arc||0))>0
          ? defenderBase.troops : null;
        await new Promise(r => setTimeout(r, 5));
        const moR = _mo.scanMysticTrials({
          attackerTotal: attackerBase.totalTroops || 150000,
          attackerStats: {
            attack:    attSt.attack    || { inf:0, cav:0, arc:0 },
            defense:   attSt.defense   || { inf:0, cav:0, arc:0 },
            lethality: attSt.lethality || { inf:0, cav:0, arc:0 },
            health:    attSt.health    || { inf:0, cav:0, arc:0 },
          },
          attackerTier: attackerBase.tier || 'T10',
          defenderTotal: defenderBase.totalTroops || 150000,
          defenderStats: {
            attack:    defSt.attack    || { inf:0, cav:0, arc:0 },
            defense:   defSt.defense   || { inf:0, cav:0, arc:0 },
            lethality: defSt.lethality || { inf:0, cav:0, arc:0 },
            health:    defSt.health    || { inf:0, cav:0, arc:0 },
          },
          defenderTier: defenderBase.tier || 'T10',
          defenderTroops: defCO,
          sparsity: 0.01,
          infMin: 0.40, infMax: 0.80,
          cavMin: 0.15, cavMax: 0.30,
          maxTop: 10,
        });
        const top = (moR.top10 || []).map(row => ({
          fi: row.fi, fc: row.fc, fa: row.fa, label: row.label,
          winPct: null, atkScore: row.defenderInjured, defScore: row.attackerInjured,
        }));
        out = {
          best: moR.best ? { fractions: { fi: moR.best.fi, fc: moR.best.fc, fa: moR.best.fa } } : null,
          top, points: top,
          defender: { fractions: defFractions, troops: defCO || {} },
          totalTested: moR.totalTested,
        };
      }
      // ── Legacy fallback ───────────────────────────────────────────
      else 
      if (opt?.scanFixedDefenderAdaptive){
        out = await opt.scanFixedDefenderAdaptive({
          attackerBase, defenderBase, defenderFractions: defFractions,
          trialName: trial, maxTop: 10,
          battlesPerPoint: 120, sparsity: 0.01,
          fiMin: 0.40, fiMax: 0.80, fcMin: 0.15, fcMax: 0.30, seed: 1337
        });
      } else if (out == null && window.KingSim?.scanMysticTrial){
        const legacy = await window.KingSim.scanMysticTrial({
          attackerBase, defenderBase, trialName: trial,
          battlesPerPoint: 120, sparsity: 0.01,
          fiMin: 0.40, fiMax: 0.80, fcMin: 0.15, fcMax: 0.30, seed: 1337
        });
        const pts = legacy.points || [];
        const top = pts.slice().sort((a,b)=> b.winPct - a.winPct).slice(0,10)
                        .map(p=>({ fi:p.fi, fc:p.fc, fa:p.fa, label:p.label, winPct:p.winPct, atkScore:null, defScore:null }));
        out = { best: legacy.best, top, defender:{ fractions:defFractions, troops:defenderBase.troops||{} }, points: pts };
      } else {
        throw new Error('Optimizer not loaded. Ensure sim/engine/optimizer.js & sim/kingSim.js are included before this runner.');
      }

      // --- unified sort for scoreboard: (attackerScore - defenderScore) desc, tie -> winPct ---
      let rows = (out.top || []).slice().sort((a,b)=>{
        const advB = ((b.atkScore ?? -Infinity) - (b.defScore ?? 0));
        const advA = ((a.atkScore ?? -Infinity) - (a.defScore ?? 0));
        if (advB !== advA) return advB - advA;
        return (b.winPct ?? 0) - (a.winPct ?? 0);
      }).slice(0,10);

      // if top rows have no scores (legacy path), they’re already sorted by winPct above.

      // --- derive headline “best” from top row so it matches the scoreboard ---
      let bestFractions;
      if (rows.length){
        bestFractions = { fi:rows[0].fi, fc:rows[0].fc, fa:Math.max(0, 1 - rows[0].fi - rows[0].fc), winPct: rows[0].winPct };
      } else {
        // fallback to engine best if no rows (shouldn’t happen)
        bestFractions = out.best?.fractions || { fi:0.5, fc:0.25, fa:0.25 };
      }
      const scanned = out.totalTested || (Array.isArray(out.points) ? out.points.length : rows.length);

      // render old headline + table, then the scoreboard
      renderBestLineAndTable(bestFractions, totals, trial, { atkScore: rows[0]?.atkScore, defScore: rows[0]?.defScore });
      renderScoreboard(rows, totals.attacker, out.defender?.fractions || defFractions, scanned);

      status.textContent='Done'; status.style.color='#10b981';
    }catch(e){
      console.error('[Mystic] run failed:', e);
      status.textContent = 'Error: ' + (e?.message || e); status.style.color='#ef4444';
    }
  }

  // ----------------------------- WIRE -----------------------------
  function wire(){
    $('mt_run')?.addEventListener('click', run);
    $('mt_trial')?.addEventListener('change', ()=>{ dirty = true; const s=$('mt_status'); if (s){ s.textContent='Ready'; s.style.color=''; } });
  }

  if (document.readyState==='loading') document.addEventListener('DOMContentLoaded', wire);
  else wire();

})();