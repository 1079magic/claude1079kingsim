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
          <td style="padding:5px 8px;white-space:nowrap">${p.label}</td>
          <td style="padding:5px 8px;text-align:right">${atkScore}</td>
          <td style="padding:5px 8px;white-space:nowrap">${di}/${dc}/${da}</td>
          <td style="padding:5px 8px;text-align:right">${defScore}</td>
        </tr>`;
    }).join('');

    host.innerHTML = `
      <h3 style="margin-top:14px">Scoreboard</h3>
      <div class="muted" style="margin:6px 0 8px 0">Scanned ${scannedCount.toLocaleString()} formations; showing top 10.</div>
      <div style="overflow-x:auto;-webkit-overflow-scrolling:touch;width:100%">
      <table style="min-width:320px;width:100%;font-size:clamp(10px,2.5vw,13px)">
        <thead>
          <tr>
            <th style="white-space:nowrap;padding:6px 8px">Attacker</th>
            <th style="white-space:nowrap;padding:6px 8px">Atk Score</th>
            <th style="white-space:nowrap;padding:6px 8px">Defender</th>
            <th style="white-space:nowrap;padding:6px 8px">Def Score</th>
          </tr>
        </thead>
        <tbody>${body}</tbody>
      </table>
      </div>`;
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
          trialName: trial,                              // drives per-trial preset + search window
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

  // ═══════════════════════════════════════════════════════════════════
  // BATTLE RECALIBRATION SYSTEM
  // ─────────────────────────────────────────────────────────────────
  // After each failed Mystic Trial the user enters injured defenders.
  // The engine shifts its search centre by one validated move and
  // re-scans around the new centre.  Up to 5 attempts (daily limit).
  // State persists in localStorage so a page reload never loses data.
  // ═══════════════════════════════════════════════════════════════════

  const RC_MAX    = 5;
  const RC_KEY    = (t) => 'mystic_recal_' + t.replace(/\s+/g,'_');
  const DEF_POOL  = 150000; // fixed Mystic defender pool

  // ── localStorage ─────────────────────────────────────────────────
  function rcLoad(trial){
    try{ const r=localStorage.getItem(RC_KEY(trial)); return r?JSON.parse(r):null; }catch(_){return null;}
  }
  function rcSave(trial,state){
    try{ localStorage.setItem(RC_KEY(trial),JSON.stringify(state)); }catch(_){}
  }
  function rcDrop(trial){
    try{ localStorage.removeItem(RC_KEY(trial)); }catch(_){}
  }

  let _rcState = null; // in-memory mirror

  function rcGet(trial){
    if(_rcState && _rcState.trial===trial) return _rcState;
    _rcState = rcLoad(trial); return _rcState;
  }
  function rcInit(trial, centre, defTotal){
    _rcState = { trial,
      baseCentre:    {fi:centre.fi, fc:centre.fc, fa:centre.fa},
      currentCentre: {fi:centre.fi, fc:centre.fc, fa:centre.fa},
      defTotal:      defTotal||DEF_POOL,
      attempts:[],
      won:false };
    rcSave(trial,_rcState); return _rcState;
  }

  // ── Fireworks ─────────────────────────────────────────────────────
  function launchFireworks(){
    const cv=document.getElementById('fw-canvas'); if(!cv) return;
    cv.width=window.innerWidth; cv.height=window.innerHeight; cv.style.display='block';
    const ctx=cv.getContext('2d');
    const COLS=['#22d3ee','#10b981','#fbbf24','#f87171','#a78bfa','#ffffff','#60a5fa','#34d399'];
    let parts=[];
    // Spawn initial burst
    function spawnBurst(count){
      for(let i=0;i<count;i++){
        const a=Math.random()*Math.PI*2, s=1.5+Math.random()*8;
        parts.push({x:cv.width*(0.15+Math.random()*0.7), y:cv.height*(0.15+Math.random()*0.55),
          vx:Math.cos(a)*s, vy:Math.sin(a)*s-2.5, alpha:1,
          // Fade rate: slower = lasts longer (0.014 → 4s at 60fps needs ~0.007)
          fade:0.006+Math.random()*0.004,
          color:COLS[Math.floor(Math.random()*COLS.length)], r:2+Math.random()*4});
      }
    }
    spawnBurst(250);
    let f=0;
    // Second burst at 1s, third at 2s
    const TOTAL_FRAMES=240; // 4 seconds at 60fps
    (function draw(){
      ctx.clearRect(0,0,cv.width,cv.height);
      // Spawn additional bursts at 1s and 2s for sustained celebration
      if(f===60)  spawnBurst(200);
      if(f===120) spawnBurst(200);
      if(f===180) spawnBurst(150);
      parts.forEach(p=>{
        p.x+=p.vx; p.y+=p.vy; p.vy+=0.09; p.alpha-=p.fade;
        if(p.alpha<=0)return;
        ctx.globalAlpha=p.alpha; ctx.fillStyle=p.color;
        ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2); ctx.fill();
      });
      ctx.globalAlpha=1;
      // Remove dead particles to keep performance clean
      if(f%30===0) parts=parts.filter(p=>p.alpha>0);
      if(++f<TOTAL_FRAMES) requestAnimationFrame(draw);
      else{ cv.style.display='none'; ctx.clearRect(0,0,cv.width,cv.height); }
    })();
  }

  // ── Formatting helpers ────────────────────────────────────────────
  function fmtF(fi,fc){ const fa=Math.max(0,1-fi-fc); return (fi*100).toFixed(1)+'/'+(fc*100).toFixed(1)+'/'+(fa*100).toFixed(1); }
  function fmtT(fi,fc,tot){
    if(!tot) return '';
    const i=Math.round(fi*tot), c=Math.round(fc*tot), a=Math.max(0,tot-i-c);
    return 'Inf\u202f'+i.toLocaleString()+'\u2002|\u2002Cav\u202f'+c.toLocaleString()+'\u2002|\u2002Arc\u202f'+a.toLocaleString();
  }

  // ── Unified formation history renderer ────────────────────────────
  // Builds a dynamic list of formation cards:
  //   - The LATEST entry is shown full-size (prominent)
  //   - All previous entries are compact one-line pills (history)
  // This means: before any attempt, only ONE card shows (the green base).
  // After each recalibration, the previous card shrinks and the new one is full-size.
  function renderFormationHistory(history, attTotal){
    const panel=$('mt_recal_panel'); if(!panel) return;
    panel.style.display='block';

    let wrap=document.getElementById('rc_history_wrap');
    if(!wrap){
      wrap=document.createElement('div');
      wrap.id='rc_history_wrap';
      wrap.style.cssText='margin-bottom:12px';
      const or=$('rc_outcome_row');
      if(or) panel.insertBefore(wrap,or);
      else { const first=panel.querySelector('div[style]'); panel.insertBefore(wrap,first?.nextSibling||null); }
    }

    if(!history||!history.length){ wrap.innerHTML=''; return; }

    let html='';
    history.forEach((entry,i)=>{
      const isCurrent=(i===history.length-1);
      const formation=fmtF(entry.fi,entry.fc);
      const troops=fmtT(entry.fi,entry.fc,attTotal)||'';

      if(isCurrent){
        const borderCol=entry.isBase?'#10b981':'#22d3ee';
        const bgCol    =entry.isBase?'rgba(16,185,129,.08)':'rgba(34,211,238,.07)';
        const lblCol   =entry.isBase?'#10b981':'#22d3ee';
        const lblTxt   =entry.isBase?'\u2694\ufe0f Recommended Formation':'\u21bb Recalibrated Formation';
        const sub      =entry.isBase?troops:('Attempt\u202f'+entry.attemptNum+'\u2002\u00b7\u2002'+(entry.moveName||'')+'\n'+troops);
        html+='<div style="background:'+bgCol+';border:1px solid '+borderCol+';border-radius:10px;padding:14px;margin-bottom:10px">'+
          '<div style="font-size:.72rem;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:'+lblCol+';margin-bottom:4px">'+lblTxt+'</div>'+
          '<div style="font-size:1.5rem;font-weight:800;color:#e9eef7;margin:2px 0 4px">'+formation+'</div>'+
          '<div style="font-size:.78rem;color:var(--muted);white-space:pre-line">'+sub+'</div>'+
          '</div>';
      } else {
        const dotCol=entry.isBase?'#10b981':'#22d3ee';
        const tag=entry.isBase?'Initial':'Attempt\u202f'+entry.attemptNum;
        const move=entry.moveName?'\u2002\u00b7\u2002'+entry.moveName:'';
        html+='<div style="display:flex;align-items:center;gap:8px;padding:5px 10px;background:rgba(255,255,255,.02);border:1px solid #1c2d40;border-radius:8px;margin-bottom:5px">'+
          '<div style="width:7px;height:7px;border-radius:50%;background:'+dotCol+';flex-shrink:0"></div>'+
          '<span style="font-size:.7rem;color:var(--muted);white-space:nowrap">'+tag+move+'</span>'+
          '<span style="font-size:.85rem;font-weight:700;color:#c9d5e8;margin-left:auto">'+formation+'</span>'+
          '</div>';
      }
    });
    wrap.innerHTML=html;
  }

  // ── Convenience: show only the base card ─────────────────────────
  function renderBase(centre, attTotal){
    renderFormationHistory([{fi:centre.fi,fc:centre.fc,attemptNum:0,isBase:true,moveName:''}], attTotal);
  }

  // ── Convenience: rebuild full history after a new recal result ────
  function renderRecal(centre, attTotal, moveName, attemptNum){
    const trial=$('mt_trial')?.value||'Crystal Cave';
    const state=rcGet(trial);
    const history=[];
    if(state?.baseCentre) history.push({fi:state.baseCentre.fi,fc:state.baseCentre.fc,attemptNum:0,isBase:true,moveName:''});
    // Include all sealed attempts from state
    (state?.attempts||[]).forEach((a,i)=>{
      if(a.newCentre) history.push({fi:a.newCentre.fi,fc:a.newCentre.fc,attemptNum:i+1,isBase:false,moveName:a.moveName});
    });
    renderFormationHistory(history, attTotal);
  }

  // ── Attempt row management ────────────────────────────────────────
  function addAttemptRow(n){
    const track=$('rc_attempt_track'); if(!track) return;
    if(document.getElementById('rc_attempt_'+n)) return; // already there
    const isFinal=(n>=RC_MAX);
    const row=document.createElement('div');
    row.className='attempt-row lost'; row.id='rc_attempt_'+n;
    row.innerHTML=
      '<div class="attempt-label">Attempt #'+n+(isFinal?'  \u00b7  Last attempt today':'')+' \u2014 enter injured defenders</div>'+
      '<div class="attempt-injured-row">'+
        '<input class="attempt-injured-input" id="rc_inj_'+n+'" type="number" placeholder="e.g.\u202f136\u202f571" min="0" step="1000" />'+
        '<button class="attempt-apply-btn" id="rc_apply_'+n+'">Recalibrate \u21bb</button>'+
      '</div>'+
      '<div class="attempt-status" id="rc_status_'+n+'"></div>';
    track.appendChild(row);
    document.getElementById('rc_apply_'+n)?.addEventListener('click',()=>applyAttempt(n));
    document.getElementById('rc_inj_'+n)?.addEventListener('keydown',e=>{ if(e.key==='Enter') applyAttempt(n); });
    setTimeout(()=>document.getElementById('rc_inj_'+n)?.focus(),60);
  }

  function sealAttemptRow(n, injured, moveName){
    const st=document.getElementById('rc_status_'+n);
    const pct=((injured/DEF_POOL)*100).toFixed(1);
    if(st) st.textContent=injured.toLocaleString()+' injured ('+pct+'%)  \u00b7  '+moveName;
    const inp=document.getElementById('rc_inj_'+n);
    const btn=document.getElementById('rc_apply_'+n);
    if(inp){ inp.disabled=true; inp.value=injured; }
    if(btn) btn.style.display='none';
  }

  // ── Core: apply one failed attempt ────────────────────────────────
  async function applyAttempt(n){
    const trial=$('mt_trial')?.value||'Crystal Cave';
    const state=rcGet(trial);
    if(!state){ alert('Run simulation first.'); return; }
    if(state.won) return;

    const injured=parseFloat(document.getElementById('rc_inj_'+n)?.value||'0');
    if(!injured||injured<=0){ document.getElementById('rc_inj_'+n)?.focus(); return; }

    const mo=window.KingSim?.mysticOptimizer;
    if(!mo?.recalibrateCentre){ alert('Optimizer not loaded'); return; }

    const idx=state.attempts.length;
    const nc=mo.recalibrateCentre(state.currentCentre, injured, state.defTotal, idx);

    state.attempts.push({injured, moveName:nc.moveName, newCentre:nc});
    state.currentCentre={fi:nc.fi, fc:nc.fc, fa:nc.fa};
    rcSave(trial,state);

    sealAttemptRow(n, injured, nc.moveName);

    // Re-run engine around new centre
    const status=$('mt_status');
    if(status){status.textContent='Recalibrating\u2026';status.style.color='#9aa4b2';}

    const attTotal=readTotals('att')||readTotals('mt_atk')||150000;
    const attSt=readSideStats('att'); const defSt=readSideStats('def');

    try{
      await new Promise(r=>setTimeout(r,5));
      const moR=mo.scanMysticTrials({
        trialName:trial, overrideCentre:nc,
        attackerTotal:attTotal,
        attackerStats:{
          attack:   attSt.attack   ||{inf:0,cav:0,arc:0},
          defense:  attSt.defense  ||{inf:0,cav:0,arc:0},
          lethality:attSt.lethality||{inf:0,cav:0,arc:0},
          health:   attSt.health   ||{inf:0,cav:0,arc:0},
        },
        attackerTier:readTier('att')||'T10',
        defenderTotal:readTotals('def')||DEF_POOL,
        defenderStats:{
          attack:   defSt.attack   ||{inf:0,cav:0,arc:0},
          defense:  defSt.defense  ||{inf:0,cav:0,arc:0},
          lethality:defSt.lethality||{inf:0,cav:0,arc:0},
          health:   defSt.health   ||{inf:0,cav:0,arc:0},
        },
        defenderTier:readTier('def')||'T10',
        maxTop:10,
      });

      if(moR.best){
        renderRecal(moR.best, attTotal, nc.moveName, n);
        // Show Win/Lost buttons so user chooses the outcome — do NOT auto-open next row
        const or=$('rc_outcome_row');
        if(n<RC_MAX){
          if(or) or.style.display='flex';
          // Next injured row opens ONLY when user clicks Lost (in wireRecalButtons)
        } else {
          if(or) or.style.display='none';
          const track=$('rc_attempt_track');
          const msg=document.createElement('div');
          msg.style.cssText='color:var(--muted);font-size:.78rem;padding:8px 0;font-style:italic';
          msg.textContent='Daily limit reached (5 attempts). Use Clear to start a new session.';
          if(track) track.appendChild(msg);
        }
        $('mt_recal_panel')?.scrollIntoView({behavior:'smooth',block:'nearest'});
      }

      if(status){status.textContent='Done';status.style.color='#10b981';}
    }catch(e){
      console.error('[Recal]',e);
      if(status){status.textContent='Recal error: '+(e?.message||e);status.style.color='#ef4444';}
    }
  }

  // ── Restore a saved session on page load ──────────────────────────
  function restoreSession(trial){
    const state=rcLoad(trial); if(!state) return;
    _rcState=state;

    // Pre-fill the prior injured field with last known value
    if(state.attempts?.length>0){
      const last=state.attempts[state.attempts.length-1];
      const el=$('mt_prior_injured'); if(el&&last?.injured) el.value=last.injured;
    }

    if(!state.baseCentre) return;
    const attTotal=readTotals('att')||150000;

    const results=$('mt_results'); if(results) results.style.display='block';

    // Rebuild full history from saved state
    const hist=[{fi:state.baseCentre.fi,fc:state.baseCentre.fc,attemptNum:0,isBase:true,moveName:''}];
    (state.attempts||[]).forEach((a,i)=>{
      if(a.newCentre) hist.push({fi:a.newCentre.fi,fc:a.newCentre.fc,attemptNum:i+1,isBase:false,moveName:a.moveName});
    });
    renderFormationHistory(hist, attTotal);

    if(state.won){
      const track=$('rc_attempt_track');
      if(track&&!track.children.length)
        track.innerHTML='<div style="color:#10b981;font-weight:800;font-size:1rem;padding:10px 0">\uD83C\uDFC6 Victory confirmed! Session complete.</div>';
      const or=$('rc_outcome_row'); if(or) or.style.display='none';
      return;
    }

    // Rebuild read-only attempt history inputs
    state.attempts.forEach((a,i)=>{
      addAttemptRow(i+1);
      sealAttemptRow(i+1, a.injured, a.moveName);
    });

    const nextN=state.attempts.length+1;
    if(nextN<=RC_MAX){
      const or=$('rc_outcome_row'); if(or) or.style.display='flex';
      if(state.attempts.length>0) addAttemptRow(nextN);
    }
  }

  // ── Called after run() to hook into result ────────────────────────
  function initRecalAfterRun(bestFi, bestFc, attTotal, defTotal, trial){
    const existing=rcGet(trial);
    if(existing&&!existing.won&&existing.baseCentre){
      // Session in progress — rebuild full history (base + all attempts so far)
      const hist=[{fi:existing.baseCentre.fi,fc:existing.baseCentre.fc,attemptNum:0,isBase:true,moveName:''}];
      (existing.attempts||[]).forEach((a,i)=>{
        if(a.newCentre) hist.push({fi:a.newCentre.fi,fc:a.newCentre.fc,attemptNum:i+1,isBase:false,moveName:a.moveName});
      });
      renderFormationHistory(hist, attTotal);
      return;
    }
    const centre={fi:bestFi, fc:bestFc, fa:Math.max(0,1-bestFi-bestFc)};
    rcInit(trial, centre, defTotal);
    renderBase(centre, attTotal);
  }

  // ── Win / Lost / Clear ────────────────────────────────────────────
  function wireRecalButtons(){
    $('rc_btn_win')?.addEventListener('click',()=>{
      const trial=$('mt_trial')?.value||'Crystal Cave';
      const state=rcGet(trial); if(state){state.won=true;rcSave(trial,state);}
      const or=$('rc_outcome_row'); if(or) or.style.display='none';
      const track=$('rc_attempt_track');
      if(track) track.innerHTML='<div style="color:#10b981;font-weight:800;font-size:1.05rem;padding:10px 0">\uD83C\uDFC6 Victory confirmed! Formation is solid. Well played!</div>';
      launchFireworks();
    });

    $('rc_btn_lost')?.addEventListener('click',()=>{
      const trial=$('mt_trial')?.value||'Crystal Cave';
      let state=rcGet(trial);
      if(!state){
        const bl=$('mt_bestline')?.textContent||'';
        const m=bl.match(/([\d.]+)\/([\d.]+)\/([\d.]+)/);
        const fi=m?parseFloat(m[1])/100:0.54, fc=m?parseFloat(m[2])/100:0.16;
        state=rcInit(trial,{fi,fc,fa:Math.max(0,1-fi-fc)},DEF_POOL);
      }
      const or=$('rc_outcome_row'); if(or) or.style.display='none';
      // Open the NEXT attempt row (one after current attempt count)
      const nextN = state.attempts.length + 1;
      if(nextN <= RC_MAX) addAttemptRow(nextN);
    });

    $('rc_btn_clear')?.addEventListener('click',()=>{
      const trial=$('mt_trial')?.value||'Crystal Cave';
      rcDrop(trial); _rcState=null;
      const panel=$('mt_recal_panel'); if(panel) panel.style.display='none';
      const hw=document.getElementById('rc_history_wrap'); if(hw) hw.innerHTML='';
      const track=$('rc_attempt_track'); if(track) track.innerHTML='';
      const or=$('rc_outcome_row'); if(or) or.style.display='none';
      const el=$('mt_prior_injured'); if(el) el.value='';
      const res=$('mt_results'); if(res) res.style.display='none';
      const st=$('mt_status'); if(st){st.textContent='Cleared \u2014 ready for new session';st.style.color='';}
    });
  }

  // ── Wrapped run() that triggers recal init ────────────────────────
  const _originalRun = run;
  async function runWithRecal(){
    await _originalRun();

    // Extract best formation from the rendered bestline text
    const bestLine=$('mt_bestline')?.textContent||'';
    const m=bestLine.match(/([\d.]+)\/([\d.]+)\/([\d.]+)/);
    if(!m) return;

    const fi=parseFloat(m[1])/100, fc=parseFloat(m[2])/100;
    const trial    =$('mt_trial')?.value||'Crystal Cave';
    const attTotal =readTotals('att')||readTotals('mt_atk')||150000;
    const defTotal =readTotals('def')||readTotals('mt_def')||DEF_POOL;

    initRecalAfterRun(fi, fc, attTotal, defTotal, trial);

    const panel=$('mt_recal_panel'); if(panel) panel.style.display='block';

    // If user pre-filled injured troops → auto-fire attempt #1 and DON'T show Win/Lost yet
    const prior=parseFloat($('mt_prior_injured')?.value||'0');
    if(prior>0){
      const state=rcGet(trial);
      if(state&&state.attempts.length===0){
        // Keep outcome row hidden — it will reappear after applyAttempt completes
        const or=$('rc_outcome_row'); if(or) or.style.display='none';
        addAttemptRow(1);
        const injEl=document.getElementById('rc_inj_1');
        if(injEl){ injEl.value=prior; await applyAttempt(1); }
      } else {
        // Session already has attempts — just show outcome row
        const or=$('rc_outcome_row'); if(or) or.style.display='flex';
      }
    } else {
      // No prior injured — show Win/Lost immediately for fresh result
      const or=$('rc_outcome_row'); if(or) or.style.display='flex';
    }

    $('mt_recal_panel')?.scrollIntoView({behavior:'smooth',block:'nearest'});
  }

  // ----------------------------- WIRE -----------------------------
  function wire(){
    $('mt_run')?.addEventListener('click', runWithRecal);
    $('mt_trial')?.addEventListener('change', ()=>{
      dirty=true;
      const s=$('mt_status'); if(s){s.textContent='Ready';s.style.color='';}
      _rcState=null;
      restoreSession($('mt_trial').value);
    });
    wireRecalButtons();
    restoreSession($('mt_trial')?.value||'Crystal Cave');
  }

  if (document.readyState==='loading') document.addEventListener('DOMContentLoaded', wire);
  else wire();

})();