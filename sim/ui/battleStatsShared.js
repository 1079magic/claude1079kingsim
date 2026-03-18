// sim/ui/battleStatsShared.js
(function(){
  'use strict';

  const $ = (id) => document.getElementById(id);
  const toNum = (v,d=0) => { const n=parseFloat(String(v).replace(',','.')); return Number.isFinite(n)?n:d; };

  function el(tag, attrs={}, kids=[]){
    const e = document.createElement(tag);
    for (const [k,v] of Object.entries(attrs)){
      if (k === 'class') e.className = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
      else e.setAttribute(k, v);
    }
    (Array.isArray(kids)?kids:[kids]).forEach(k=>{
      if (k==null) return; if (typeof k === 'string') e.appendChild(document.createTextNode(k)); else e.appendChild(k);
    });
    return e;
  }

  function statGroup(prefix, title){
    const wrap = el('div', {}, [ el('h3', {}, title) ]);
    const grid = el('div', { class:'grid-3' });
    function col(type, label){
      const c = el('div', {}, [ el('h4', {}, label) ]);
      c.appendChild(line(prefix,type,'atk','Attack (%)'));
      c.appendChild(line(prefix,type,'def','Defense (%)'));
      c.appendChild(line(prefix,type,'let','Lethality (%)'));
      c.appendChild(line(prefix,type,'hp','Health (%)'));
      return c;
    }
    function line(p,t,k,lab){
      return el('div', {}, [ el('label',{},lab), el('input',{id:`${p}_${t}_${k}`, type:'number', step:'0.1', value:'100'}) ]);
    }
    grid.appendChild(col('inf','Infantry'));
    grid.appendChild(col('cav','Cavalry'));
    grid.appendChild(col('arc','Archers'));
    wrap.appendChild(grid);
    return wrap;
  }

  function build(){
    if (document.getElementById('bst_panel')) return;

    const panel = el('section', { class:'panel', id:'bst_panel' }, [
      el('h2', { class:'h2' }, 'Battle Stats — Attacker / Defender (Shared by PvE / PvP / CB)'),

      // Importers row — four placeholders (stats+troops for both sides)
      el('div', { class:'panel' }, [
        el('div', { class:'grid-2' }, [
          el('div', {}, [
            el('h3', {}, '📷 Import stats Attacker'),
            el('div', { id:'bst_import_zone_att' }),
            el('h3', { style:'margin-top:14px' }, '📷 Import troops Attacker'),
            el('div', { id:'bst_import_troops_att' })
          ]),
          el('div', {}, [
            el('h3', {}, '📷 Import stats Defender'),
            el('div', { id:'bst_import_zone_def' }),
            el('h3', { style:'margin-top:14px' }, '📷 Import troops Defender'),
            el('div', { id:'bst_import_troops_def' })
          ])
        ])
      ]),

      // Tier & totals
      el('div', { class:'grid-2' }, [
        el('div', {}, [
          el('label', {}, 'Tier (both sides)'),
          el('select', { id:'bst_tier' }, [
            el('option', { value:'T6' }, 'T6'), el('option', { value:'T9' }, 'T9'),
            el('option', { value:'T10' }, 'T10'), el('option', { value:'T10.TG1', selected:true }, 'T10.TG1'),
            el('option', { value:'T10.TG2' }, 'T10.TG2'), el('option', { value:'T10.TG3' }, 'T10.TG3'),
            el('option', { value:'T10.TG4' }, 'T10.TG4'), el('option', { value:'T10.TG5' }, 'T10.TG5')
          ])
        ]),
        el('div', { class:'grid-2' }, [
          el('div', {}, [ el('label', {}, 'Attacker troops (total)'), el('input',{id:'bst_atk_total',type:'number',step:'1000',min:'1000',value:'100000'}) ]),
          el('div', {}, [ el('label', {}, 'Defender troops (total)'), el('input',{id:'bst_def_total',type:'number',step:'1000',min:'1000',value:'100000'}) ])
        ])
      ]),

      // Attacker vs Defender side-by-side
      el('div', { class:'grid-2', style:'margin-top:14px' }, [
        el('div', {}, statGroup('bst_atk','Attacker Stats')),
        el('div', {}, statGroup('bst_def','Defender Stats'))
      ])
    ]);

    const mount = document.getElementById('bst_panel_mount') || document.querySelector('.container');
    if (mount){
      if (mount.classList.contains('container')) mount.insertBefore(panel, mount.firstChild);
      else mount.appendChild(panel);
    }
  }

  // === Shared read/write for Mystic panel ===
  const API = {
    readShared(){
      const g=(p,t,k)=> toNum(document.getElementById(`${p}_${t}_${k}`)?.value, 100);
      return {
        tier: document.getElementById('bst_tier')?.value || 'T10',
        totals: {
          attacker: toNum(document.getElementById('bst_atk_total')?.value, 100000),
          defender: toNum(document.getElementById('bst_def_total')?.value, 100000),
        },
        attacker: {
          stats: {
            attack:    { inf:g('bst_atk','inf','atk'), cav:g('bst_atk','cav','atk'), arc:g('bst_atk','arc','atk') },
            defense:   { inf:g('bst_atk','inf','def'), cav:g('bst_atk','cav','def'), arc:g('bst_atk','arc','def') },
            lethality: { inf:g('bst_atk','inf','let'), cav:g('bst_atk','cav','let'), arc:g('bst_atk','arc','let') },
            health:    { inf:g('bst_atk','inf','hp'),  cav:g('bst_atk','cav','hp'),  arc:g('bst_atk','arc','hp') }
          }
        },
        defender: {
          stats: {
            attack:    { inf:g('bst_def','inf','atk'), cav:g('bst_def','cav','atk'), arc:g('bst_def','arc','atk') },
            defense:   { inf:g('bst_def','inf','def'), cav:g('bst_def','cav','def'), arc:g('bst_def','arc','def') },
            lethality: { inf:g('bst_def','inf','let'), cav:g('bst_def','cav','let'), arc:g('bst_def','arc','let') },
            health:    { inf:g('bst_def','inf','hp'),  cav:g('bst_def','cav','hp'),  arc:g('bst_def','arc','hp') }
          }
        }
      };
    }
  };

  window.BattleShared = API;

  if (document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded', build);
  } else { build(); }

})();