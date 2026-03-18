// sim/ui/mysticPanel.js
(function(){
  'use strict';

  const $ = (id) => document.getElementById(id);
  const clamp01 = (x) => Math.max(0, Math.min(1, x));
  const toNum = (v,d=0) => { const n=parseFloat(String(v).replace(',','.')); return Number.isFinite(n)?n:d; };

  const DEFAULTS = {
    battlesPerPoint: 120,
    sparsity: 0.04,
    fiMin: 0.35, fiMax: 0.65,
    fcMin: 0.10, fcMax: 0.30,
    seed: 1337
  };

  let lastSignature = null;
  let lastResult = null;

  function el(tag, attrs={}, kids=[]){
    const e = document.createElement(tag);
    for (const [k,v] of Object.entries(attrs)){
      if (k === 'class') e.className = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
      else e.setAttribute(k, v);
    }
    (Array.isArray(kids)?kids:[kids]).forEach(k=>{
      if (k==null) return;
      if (typeof k === 'string') e.appendChild(document.createTextNode(k));
      else e.appendChild(k);
    });
    return e;
  }

  function addButtonRow(){
    if (document.getElementById('btn-mystic')) return;
    const row = document.querySelector('.button-row');
    if (!row) return;
    const btn = el('button', {
      id:'btn-mystic',
      class:'big-button',
      style:'background:linear-gradient(180deg,#0ea5e9 0%,#0284c7 100%);'
    }, '🧪 Mystic Trials (PvE)');
    btn.addEventListener('click', showMystic);
    row.appendChild(btn);
  }

  function loadingOverlay(){
    if (document.getElementById('mt_loading')) return null;
    const css = document.createElement('style'); css.id='mt_shimmer_css2';
    css.textContent = `@keyframes mt_shimmer2{0%{inset:0 95% 0 0}50%{inset:0 40% 0 0}100%{inset:0 0 0 0}}`;
    document.head.appendChild(css);
    return el('div', { id:'mt_loading', style:'display:none;position:absolute;inset:0;background:rgba(10,12,18,0.65);z-index:20;align-items:center;justify-content:center' }, [
      el('div', { style:'width:min(520px,86vw);padding:18px 20px;border:1px solid #234;border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,0.45);background:#0e1420' }, [
        el('div', { style:'font-weight:700;color:#7dd3fc;margin-bottom:10px;text-align:center' }, 'Running simulation…'),
        el('div', { style:'position:relative;height:10px;background:#0b1220;border-radius:999px;overflow:hidden' }, [
          el('div', { id:'mt_bar', style:'position:absolute;inset:0 50% 0 0;background:linear-gradient(90deg,#06b6d4,#22d3ee,#60a5fa);animation:mt_shimmer2 1.4s infinite linear;filter:drop-shadow(0 0 10px #22d3eeaa)' })
        ])
      ])
    ]);
  }

  function buildPanel(){
    if (document.getElementById('engine-mystic')) return;

    const container = document.querySelector('.container');
    const after = document.getElementById('bst_panel') || document.getElementById('engine-optiona') || document.getElementById('engine-magic');

    const panel = el('section', { id:'engine-mystic', class:'panel', style:'display:none; position:relative' }, [
      el('h2', { style:'text-align:center' }, '🧪 Mystic Trials (PvE) — Battle Simulator'),
      loadingOverlay(),
      el('div', { class:'sub-panel' }, [
        el('div', { class:'grid grid-two' }, [
          el('div', {}, [
            el('label', {}, 'Mystic Trial'),
            el('select', { id:'mt_trial' }, [
              el('option', { value:'Crystal Cave' }, 'Crystal Cave'),
              el('option', { value:'Forest of Life' }, 'Forest of Life'),
              el('option', { value:'Knowledge Nexus' }, 'Knowledge Nexus'),
              el('option', { value:'Molten Fort' }, 'Molten Fort')
            ]),
            el('div', { class:'button-row', style:'justify-content:flex-start;margin-top:12px;gap:12px' }, [
              el('button', { id:'mt_prefill', class:'btn' }, '⬇️ Prefill from Shared Inputs'),
              el('button', { id:'mt_run', class:'btn btn-ok' }, '▶ Run Simulation'),
              el('span', { id:'mt_status', class:'muted', style:'margin-left:6px' }, 'Idle')
            ])
          ])
        ])
      ]),
      el('section', { class:'sub-panel' }, [
        el('div', { id:'mt_bestline', class:'muted1', style:'margin:0 0 12px 0' }, ''),
        el('div', { id:'mt_tablewrap' }),
        el('div', { id:'mt_done', style:'margin-top:12px;color:#10b981;font-weight:700;display:none' }, '✔ Done')
      ])
    ]);

    const anchor = after ? after.nextSibling : null;
    container.insertBefore(panel, anchor);
  }

  function showMystic(){
    const mystic = $('engine-mystic');
    const magic  = $('engine-magic');
    const option = $('engine-optiona');
    if (mystic) mystic.style.display='block';
    if (magic)  magic.style.display='none';
    if (option) option.style.display='none';
    let st={}; try{ st=JSON.parse(localStorage.getItem('lol1079_state_v1')||'{}'); }catch{}
    st.activeEngine='mystic';
    localStorage.setItem('lol1079_state_v1', JSON.stringify(st));
  }

  function signature(){
    const S = window.BattleShared?.readShared?.();
    if (!S) return '';
    return JSON.stringify(S).slice(0, 50000);
  }

  function renderBestLineAndTable(best, totals, trialName){
    const fi = best.fractions.fi, fc = best.fractions.fc, fa = best.fractions.fa;
    const pI = (fi*100).toFixed(1), pC = (fc*100).toFixed(1), pA = (fa*100).toFixed(1);

    function alloc(total, fi, fc, fa){
      const i = Math.round(fi*total);
      const c = Math.round(fc*total);
      let  a = total - i - c;
      if (a < 0) a = 0;
      return { i, c, a };
    }
    const att = alloc(totals.attacker, fi, fc, fa);
    const def = alloc(totals.defender, fi, fc, fa);

    $('mt_bestline').textContent =
      `Best composition ≈ ${pI}/${pC}/${pA} (Inf/Cav/Arc) · Win ≈ ${best.winChance}% · ${trialName}`;

    const wrap = $('mt_tablewrap'); wrap.innerHTML = '';
    const table = document.createElement('table');
    table.innerHTML = `
      <thead><tr>
        <th>Troop Type</th><th>Share (%)</th><th>Attacker (troops)</th><th>Defender (troops)</th>
      </tr></thead>
      <tbody>
        <tr><td>Infantry</td><td>${pI}</td><td>${att.i.toLocaleString()}</td><td>${def.i.toLocaleString()}</td></tr>
        <tr><td>Cavalry</td><td>${pC}</td><td>${att.c.toLocaleString()}</td><td>${def.c.toLocaleString()}</td></tr>
        <tr><td>Archers</td><td>${pA}</td><td>${att.a.toLocaleString()}</td><td>${def.a.toLocaleString()}</td></tr>
      </tbody>`;
    wrap.appendChild(table);
  }

  function showLoading(show){
    const overlay = $('mt_loading');
    if (!overlay) return;
    overlay.style.display = show ? 'flex' : 'none';
  }

  function showDone(isNoChange=false){
    const done = $('mt_done');
    if (!done) return;
    if (isNoChange){
      done.style.color = '#93c5fd';
      done.textContent = `ℹ No changes detected — last result shown (${new Date().toLocaleTimeString()})`;
    } else {
      done.style.color = '#10b981';
      done.textContent = `✔ Done (${new Date().toLocaleTimeString()})`;
    }
    done.style.display = 'block';
  }

  async function runSimulation(){
    const status = $('mt_status');
    const sig = signature();

    if (sig === lastSignature && lastResult){
      renderBestLineAndTable(lastResult.best, lastResult.totals, lastResult.trial);
      status.textContent = 'No changes'; status.style.color = '#93c5fd';
      showDone(true);
      return;
    }

    const S = window.BattleShared?.readShared?.();
    if (!S){ status.textContent='Shared stats not ready'; status.style.color='#ef4444'; return; }

    status.textContent = 'Running…'; status.style.color = '#9aa4b2';
    $('mt_done').style.display = 'none';
    showLoading(true);

    try{
      const result = await window.KingSim.scanMysticTrial({
        attackerBase: { totalTroops:S.totals.attacker, tier:S.tier, stats:S.attacker.stats },
        defenderBase: { totalTroops:S.totals.defender, tier:S.tier, stats:S.defender.stats },
        trialName: S.trial || $('mt_trial').value,
        battlesPerPoint: DEFAULTS.battlesPerPoint,
        sparsity: DEFAULTS.sparsity,
        fiMin: DEFAULTS.fiMin, fiMax: DEFAULTS.fiMax,
        fcMin: DEFAULTS.fcMin, fcMax: DEFAULTS.fcMax,
        seed: DEFAULTS.seed
      });

      renderBestLineAndTable(result.best, S.totals, $('mt_trial').value);

      lastSignature = sig;
      lastResult = { best: result.best, totals: S.totals, trial: $('mt_trial').value };

      status.textContent = 'Done'; status.style.color = '#10b981';
      showDone(false);
    }catch(e){
      console.error('[Mystic] runSimulation failed', e);
      status.textContent = 'Error: '+(e?.message||e); status.style.color = '#ef4444';
    }finally{
      showLoading(false);
    }
  }

  function prefillFromShared(){
    // Take existing top “Troop Stats Input” (Magic) and copy to Attacker/Defender stats
    const g = id => parseFloat(document.getElementById(id)?.value || '100') || 100;
    const obj = {
      attack:    { inf:g('inf_atk'), cav:g('cav_atk'), arc:g('arc_atk') },
      defense:   { inf:100, cav:100, arc:100 },
      lethality: { inf:g('inf_let'), cav:g('cav_let'), arc:g('arc_let') },
      health:    { inf:100, cav:100, arc:100 }
    };
    window.BattleShared?.setStats?.('bst_atk', obj);
    window.BattleShared?.setStats?.('bst_def', obj);
    const tier = document.getElementById('troopTier')?.value || 'T10';
    const tierSel = document.getElementById('bst_tier'); if (tierSel) tierSel.value = tier;
  }

  function wire(){
    const pre = $('mt_prefill'); if (pre) pre.addEventListener('click', prefillFromShared);
    const run = $('mt_run');     if (run) run.addEventListener('click', runSimulation);
  }

  function boot(){
    addButtonRow();
    buildPanel();
    wire();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

})();