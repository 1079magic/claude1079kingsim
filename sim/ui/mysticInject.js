
(function(){
  'use strict';

  function el(tag, attrs={}, children=[]){
    const e = document.createElement(tag);
    Object.entries(attrs).forEach(([k,v])=>{
      if (k==='style' && typeof v==='object'){ Object.assign(e.style, v); }
      else if (k==='class'){ e.className = v; }
      else e.setAttribute(k, v);
    });
    (Array.isArray(children)?children:[children]).forEach(c=>{
      if (c==null) return;
      if (typeof c==='string') e.appendChild(document.createTextNode(c));
      else e.appendChild(c);
    });
    return e;
  }

  function makePanel(){
    const panel = el('section', { class:'panel', id:'engine-mystic' }, [
      el('h2', {}, 'Mystic Trials (PvE) — Kingshot Battle Simulator'),
      el('div', { class:'panel-wrapper' }, [
        el('div', { class:'sub-panel' }, [
          el('div', { class:'grid grid-two' }, [
            el('div', {}, [
              el('label', {}, 'Trial'),
              (()=>{ 
                const s = el('select', { id:'mt_trial' }, [
                  el('option', { value:'Crystal Cave' }, 'Crystal Cave'),
                  el('option', { value:'Forest of Life' }, 'Forest of Life'),
                  el('option', { value:'Knowledge Nexus' }, 'Knowledge Nexus'),
                  el('option', { value:'Molten Fort' }, 'Molten Fort'),
                ]);
                return s;
              })(),
              el('label', { style:{marginTop:'10px'} }, 'Battles per point (Monte‑Carlo)'),
              el('input', { id:'mt_battles', type:'number', min:'1', max:'1000', value:'10' }),
              el('label', { style:{marginTop:'10px'} }, 'Sparsity (grid step, 0.025–0.10)'),
              el('input', { id:'mt_sparsity', type:'number', step:'0.005', min:'0.01', max:'0.2', value:'0.060' })
            ]),
            el('div', {}, [
              el('label', {}, 'Min / Max Infantry fraction'),
              (()=>{
                const w = el('div', { style:{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px'} }, [
                  el('input', { id:'mt_fi_min', type:'number', step:'0.01', min:'0', max:'1', value:'0.40' }),
                  el('input', { id:'mt_fi_max', type:'number', step:'0.01', min:'0', max:'1', value:'0.80' })
                ]);
                return w;
              })(),
              el('label', { style:{marginTop:'10px'} }, 'Min / Max Cavalry fraction'),
              (()=>{
                const w = el('div', { style:{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px'} }, [
                  el('input', { id:'mt_fc_min', type:'number', step:'0.01', min:'0', max:'1', value:'0.15' }),
                  el('input', { id:'mt_fc_max', type:'number', step:'0.01', min:'0', max:'1', value:'0.30' })
                ]);
                return w;
              })(),
              el('label', { style:{marginTop:'10px'} }, 'Troops per side (total)'),
              el('input', { id:'mt_total', type:'number', min:'1000', step:'1000', value:'100000' })
            ])
          ]),
          el('div', { class:'button-row', style:{marginTop:'12px'} }, [
            el('button', { id:'mt_run', class:'btn' }, 'Run Mystic Scan (PvE)'),
            el('div', { id:'mt_status', class:'muted', style:{marginLeft:'8px'} }, 'Idle')
          ])
        ]),

        el('section', { class:'sub-panel' }, [
          el('div', { id:'mt_plot', style:'width:100%;height:540px;' }),
          el('div', { id:'mt_best', class:'muted1', style:{marginTop:'10px'} }, '')
        ])
      ])
    ]);
    return panel;
  }

  function inject(){
    const container = document.querySelector('.container');
    if (!container) return;
    // insert after the two main engine panels, before support section if possible
    const lastPanel = document.getElementById('engine-optiona') || document.getElementById('engine-magic') || container.lastElementChild;
    container.insertBefore(makePanel(), lastPanel?.nextSibling || null);
    wire();
  }

  function readUI(){
    const g = id => document.getElementById(id);
    return {
      trial: g('mt_trial').value,
      battles: Math.max(1, Math.min(1000, Number(g('mt_battles').value)||10)),
      sparsity: Math.max(0.01, Math.min(0.2, Number(g('mt_sparsity').value)||0.06)),
      fiMin: Math.max(0, Math.min(1, Number(g('mt_fi_min').value)||0.4)),
      fiMax: Math.max(0, Math.min(1, Number(g('mt_fi_max').value)||0.8)),
      fcMin: Math.max(0, Math.min(1, Number(g('mt_fc_min').value)||0.15)),
      fcMax: Math.max(0, Math.min(1, Number(g('mt_fc_max').value)||0.3)),
      total: Math.max(1000, Number(g('mt_total').value)||100000),
    };
  }

  function toPercentTriplet(fr){
    const i = Math.round(fr.fi*100);
    const c = Math.round(fr.fc*100);
    const a = 100 - i - c;
    return `${i}/${c}/${a}`;
  }

  async function runScan(){
    const ui = readUI();
    const status = document.getElementById('mt_status');
    status.textContent = 'Running scan…';
    status.style.color = '#9aa4b2';

    // Read current shared inputs as both sides base
    const base = window.KingSim.readSharedInputsAsBase(ui.total, document.getElementById('troopTier')?.value || 'T10');

    const result = await window.KingSim.scanMysticTrial({
      attackerBase: base,
      defenderBase: base, // symmetric 100k / 100% per side, by design
      trialName: ui.trial,
      battlesPerPoint: ui.battles,
      sparsity: ui.sparsity,
      fiMin: ui.fiMin, fiMax: ui.fiMax,
      fcMin: ui.fcMin, fcMax: ui.fcMax,
      seed: 1337
    });

    // Plot
    const pts = result.points;
    const trace = {
      x: pts.map(p=>p.fi),
      y: pts.map(p=>p.fc),
      mode: 'markers',
      type: 'scatter',
      marker: {
        size: 9,
        color: pts.map(p=>p.winPct),
        colorscale: 'Viridis',
        cmin: 0, cmax: 100,
        colorbar: { title: 'win %' }
      },
      text: pts.map(p=>`${p.label} → ${p.winPct}%`),
      hovertemplate: 'Inf: %{x:.2f}<br>Cav: %{y:.2f}<br>%{text}<extra></extra>'
    };
    const layout = {
      template: 'plotly_dark',
      xaxis: { title:'infantry fraction', range:[0,1] },
      yaxis: { title:'cavalry fraction', range:[0,1] },
      margin: { l:50, r:30, t:30, b:50 },
      paper_bgcolor:'#1a1d24',
      plot_bgcolor:'#1a1d24'
    };
    if (window.Plotly) {
      Plotly.react('mt_plot', [trace], layout, { displayModeBar:false, responsive:true });
    }

    const best = result.best;
    const bestStr = toPercentTriplet(best.fractions);
    document.getElementById('mt_best').textContent =
      `Best composition ≈ ${bestStr} (Inf/Cav/Arc) · win ≈ ${best.winChance}% in ${ui.trial}`;

    status.textContent = 'Scan complete';
    status.style.color = '#4caf88';
  }

  function wire(){
    const btn = document.getElementById('mt_run');
    if (btn) btn.addEventListener('click', runScan);
  }

  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', inject);
  } else {
    inject();
  }
})();
