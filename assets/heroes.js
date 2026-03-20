/* assets/heroes.js — Heroes UI wired to tiers.json (Battle‑PLUS) */
(function(){
  'use strict';

  // ---------- DOM refs ----------
  const GRID       = document.getElementById('heroGrid');
  const SUM_PANEL  = document.getElementById('summary-panel');
  const SUM_TOTALS = document.getElementById('summaryTotals');
  const SUM_TABLE  = document.getElementById('summaryTableWrap');
  const SUM_DETAILS= document.getElementById('summaryDetails');
  const KEY        = 'kingsim_heroes_v2';

  // ---------- Load tiers.json (shim-friendly under file://) ----------
  async function loadTiers(){
    try{
      const res = await fetch('tiers.json', { cache: 'no-store' });
      if (!res.ok) throw new Error('tiers.json not found (status ' + res.status + ')');
      return await res.json();
    }catch(e){
      const wrap = document.getElementById('heroes-panel');
      if (wrap){
        const note = document.createElement('div');
        note.className = 'panel panel-glass';
        note.style.marginTop = '12px';
        note.innerHTML = `
          <div class="muted">
            Could not load <b>tiers.json</b> (${e.message}).<br>
            If you opened this page from disk (<code>file://</code>), ensure
            <code>assets/fetch-shim.js</code> is included <b>before</b> <code>assets/heroes.js</code> and that
            <code>tiers.json</code> is in the same folder as <code>heros.html</code>.<br>
            Or run a local server: <code>python -m http.server 8080</code> → <code>http://localhost:8080/heros.html</code>.
          </div>`;
        wrap.parentElement.insertBefore(note, wrap.nextSibling);
      }
      throw e;
    }
  }

  // ---------- State save/load ----------
  function saveState(){
    const payload = {};
    GRID.querySelectorAll('.hero-card').forEach(card => {
      const id   = card.dataset.id;
      const segs = Array.from(card.querySelectorAll('.seg[data-skill]'));
      payload[id] = {
        owned    : card.querySelector('.owned-input').checked,
        level    : +(card.dataset.level||0),
        widget   : +(card.dataset.widget||0),
        formation: card.dataset.formation||'',
        skills   : segs.map(s => +(s.dataset.value || 0)) // 0 if user never clicked yet
      };
    });
    localStorage.setItem(KEY, JSON.stringify(payload));
    window.dispatchEvent(new Event('heroStateChanged'));
  }
  function loadState(){
    try { return JSON.parse(localStorage.getItem(KEY)||'{}'); }
    catch{ return {}; }
  }

  // ---------- Small SVG helpers (stars/swords) ----------
  function starSVG(active){
    const svg = document.createElementNS('http://www.w3.org/2000/svg','svg');
    svg.setAttribute('viewBox','0 0 24 24');
    svg.classList.add('star'); if (active) svg.classList.add('active');
    const p = document.createElementNS('http://www.w3.org/2000/svg','path');
    p.setAttribute('fill','#FFD54F');
    p.setAttribute('d','M12 2l2.9 6.1 6.7.6-5 4.3 1.5 6.6L12 16l-6.1 3.6 1.5-6.6-5-4.3 6.7-.6z');
    svg.appendChild(p);
    return svg;
  }
  function swordSVG(active){
    // Use crossed swords emoji (⚔️⚔️) as requested
    const span = document.createElement('span');
    span.className = 'sword' + (active ? ' active' : '');
    span.textContent = '⚔️';
    span.style.cssText = 'font-size:16px;cursor:pointer;opacity:'+(active?'1':'0.45')+';transition:opacity .15s,transform .1s';
    return span;
  }

  // ---------- Emoji icons for troop type ----------
  // Infantry → ⚔️, Cavalry → 🐎, Archer → 🏹, Any → ◆
  function emojiForTroop(tt){
    const t = (tt || '').toLowerCase();
    if (t.startsWith('inf')) return '⚔️';
    if (t.startsWith('cav')) return '🐎';
    if (t.startsWith('arc')) return '🏹';
    return '◆';
  }

  // ---------- Header meta & four-stat aggregation ----------
  function headerMeta(hero){
    return (hero.troopType || 'Any');
  }

  // Sum ATK/LET/DEF/HP from current selections (skills + widget)
  function computeAllFourSums(hero, st){
    const skillLv = (st.skills || []);
    const sums = {
      attackUp_percent    : 0,
      lethalityUp_percent : 0,
      defenseUp_percent   : 0,
      healthUp_percent    : 0
    };

    function addFrom(o){
      if (!o) return;
      if (o.attackUp_percent    != null) sums.attackUp_percent    += +o.attackUp_percent;
      if (o.lethalityUp_percent != null) sums.lethalityUp_percent += +o.lethalityUp_percent;
      if (o.defenseUp_percent   != null) sums.defenseUp_percent   += +o.defenseUp_percent;
      if (o.healthUp_percent    != null) sums.healthUp_percent    += +o.healthUp_percent;
    }

    // Skills (exact level rows)
    (hero.skills || []).forEach((sk, idx)=>{
      const lvl = skillLv[idx] || 0;
      if (!lvl) return;
      const row = sk.levels && (sk.levels[`Level ${lvl}`] || sk.levels[lvl]);
      addFrom(row);
    });

    // Widget (generic + troop-type)
    const w = hero.widget;
    if (w && +st.widget){
      const LKEY = `Level ${st.widget}`;
      const S = (w.stats || {});
      addFrom({
        attackUp_percent    : S.attackUp_percent    && S.attackUp_percent[LKEY],
        lethalityUp_percent : S.lethalityUp_percent && S.lethalityUp_percent[LKEY],
        defenseUp_percent   : S.defenseUp_percent   && S.defenseUp_percent[LKEY],
        healthUp_percent    : S.healthUp_percent    && S.healthUp_percent[LKEY],
      });

      const tt = (hero.troopType || '').toLowerCase();
      const pref = tt.startsWith('inf') ? 'infantry'
                 : tt.startsWith('cav') ? 'cavalry'
                 : tt.startsWith('arc') ? 'archer'
                 : null;
      if (pref){
        const hp   = S[`${pref}Health_percent`]    && S[`${pref}Health_percent`][LKEY];
        const leth = S[`${pref}Lethality_percent`] && S[`${pref}Lethality_percent`][LKEY];
        if (hp   != null) sums.healthUp_percent    += +hp;
        if (leth != null) sums.lethalityUp_percent += +leth;
      }
    }

    return sums;
  }

  // Read current selections from a single card
  function collectLocalStateFromCard(card){
    const segs = Array.from(card.querySelectorAll('.seg[data-skill]'));
    return {
      owned    : card.querySelector('.owned-input')?.checked,
      level    : +(card.dataset.level||0),
      widget   : +(card.dataset.widget||0),
      formation: card.dataset.formation||'',
      skills   : segs.map(s => +(s.dataset.value || 0))
    };
  }

  // ---------- Generation mapping (since tiers.json has no 'generation' field) ----------
  // Extend this map as you add more named heroes so they bucket into the right Gen.
  const GEN_INDEX = {
    // Gen 6
    'Sophia':'Gen 6','Triton':'Gen 6','Yang':'Gen 6',
    // Gen 5
    'Thrud':'Gen 5','Long Fei':'Gen 5','Vivian':'Gen 5',
    // Gen 4
    'Margot':'Gen 4','Alcar':'Gen 4','Rosa':'Gen 4',
    // Gen 3
    'Petra':'Gen 3','Eric':'Gen 3','Jaeger':'Gen 3',
    // Gen 2
    'Hilde':'Gen 2','Zoe':'Gen 2','Marlin':'Gen 2',
    // Gen 1
    'Jabel':'Gen 1','Amadeus':'Gen 1','Helga':'Gen 1','Saul':'Gen 1'
    // Joiners (Chenko, Yeonwoo, Amane) fall back to Epic
  };
  function generationForHero(name){ return GEN_INDEX[name] || 'Epic'; }

  // ---------- Build one card ----------
  function buildCard(hero, group, saved){
    const id    = `${group}__${hero.name}`.replace(/\s+/g,'_').toLowerCase();
    const state = saved[id] || {};

    const card = document.createElement('article');
    card.className = 'hero-card';
    card.dataset.id        = id;
    card.dataset.level     = state.level||0;
    card.dataset.widget    = state.widget||0;
    card.dataset.formation = state.formation||'';

    // Header (icon + name + cyan sums) — troop type removed, name shown in gold above
    const head = document.createElement('div'); head.className = 'card-head';

    const iconWrap = document.createElement('div');
    iconWrap.className = 'icon-wrap';
    iconWrap.textContent = emojiForTroop(hero.troopType);

    const text  = document.createElement('div'); text.className  = 'header-text';
    const nm    = document.createElement('div'); nm.className    = 'hero-name'; nm.textContent = hero.name;
    const sumsAtkLet = document.createElement('div'); sumsAtkLet.className = 'focus-sums'; sumsAtkLet.textContent = 'ATK +0.0% • LET +0.0%';
    const sumsDefHp  = document.createElement('div'); sumsDefHp.className  = 'focus-sums'; sumsDefHp.textContent  = 'DEF +0.0% • HP +0.0%';

    text.appendChild(nm);
    text.appendChild(sumsAtkLet);
    text.appendChild(sumsDefHp);

    head.appendChild(iconWrap);
    head.appendChild(text);

    // Owned pill (label ensures click toggles input)
    const own = document.createElement('label');
    own.className = 'own-flag';
    own.style.zIndex = '2';
    const chk = document.createElement('input');
    chk.type = 'checkbox'; chk.className = 'owned-input'; chk.checked = !!state.owned;
    const sw  = document.createElement('span'); sw.className  = 'switch';
    const lbl = document.createElement('span'); lbl.className = 'owned-label'; lbl.textContent = 'Owned';
    own.appendChild(chk); own.appendChild(sw); own.appendChild(lbl);

    card.appendChild(head); card.appendChild(own);

    // Level row
    const lvlRow = document.createElement('div'); lvlRow.className = 'row';
    lvlRow.innerHTML = `<div class="label">Level</div><div class="controls"><div class="stars"></div></div>`;
    const stars = lvlRow.querySelector('.stars');
    for(let i=1;i<=5;i++){
      const s = starSVG(i <= (state.level||0));
      s.dataset.value = i;
      s.addEventListener('click', ()=>{
        card.dataset.level = i;
        [...stars.children].forEach((el,idx)=> el.classList.toggle('active', idx < i));
        saveState(); computeSummary(); updateHeaderSums();
      });
      stars.appendChild(s);
    }
    // Wrap controls for smooth expand animation
    const ctrlWrap = document.createElement('div');
    ctrlWrap.className = 'controls-wrap';
    ctrlWrap.appendChild(lvlRow);

    // Skills (segmented 1..5)
    const currentSkillVals = state.skills || [];
    (hero.skills || []).forEach((sk, idx)=>{
      const row = document.createElement('div'); row.className = 'row';
      row.innerHTML = `<div class="label">${sk.name}</div><div class="controls"><div class="seg" data-skill="${idx}"></div></div>`;
      const seg = row.querySelector('.seg');
      for (let v=1; v<=5; v++){
        const b = document.createElement('button');
        b.type = 'button'; b.textContent = v; b.dataset.val = v;
        if ((currentSkillVals[idx]||0) === v) b.classList.add('is-active');
        b.addEventListener('click', ()=>{
            seg.dataset.value = v;
          seg.querySelectorAll('button').forEach(k=>k.classList.toggle('is-active', k===b));
          saveState(); computeSummary(); updateHeaderSums();
        });
        seg.appendChild(b);
      }
      ctrlWrap.appendChild(row);
    });

    // Widget swords
    if (hero.widget && (hero.widget.stats || hero.widget.exclusiveSkills)){
      const wRow = document.createElement('div'); wRow.className = 'row';
      wRow.innerHTML = `<div class="label">Widget</div><div class="controls"><div class="swords"></div></div>`;
      const swords = wRow.querySelector('.swords');
      for (let i=1;i<=5;i++){
        const swd = swordSVG(i <= (state.widget||0)); swd.dataset.value = i;
        swd.addEventListener('click', ()=>{
            card.dataset.widget = i;
          [...swords.children].forEach((el,idx)=> el.classList.toggle('active', idx < i));
          saveState(); computeSummary(); updateHeaderSums();
        });
        swords.appendChild(swd);
      }
      ctrlWrap.appendChild(wRow);
    }

    // Formation
    const formRow = document.createElement('div'); formRow.className = 'row';
    formRow.innerHTML = `<div class="label">Formation</div>
      <div class="controls">
        <div class="pills" role="radiogroup">
          <button type="button" class="pill" data-val="Call" aria-pressed="${state.formation==='Call'}">Call</button>
          <button type="button" class="pill" data-val="Join" aria-pressed="${state.formation==='Join'}">Join</button>
        </div>
      </div>`;
    formRow.querySelectorAll('.pill').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        formRow.querySelectorAll('.pill').forEach(b=> b.setAttribute('aria-pressed','false'));
        btn.setAttribute('aria-pressed','true');
        card.dataset.formation = btn.dataset.val;
        saveState(); computeSummary(); updateHeaderSums();
      });
    });
    ctrlWrap.appendChild(formRow);
    card.appendChild(ctrlWrap);

    // Lock behavior — only affects visual style, not interactions
    // Owned is used by the engine for bear recommendations, not as a UI gate
    const setLock = (owned)=>{
      // Subtle opacity difference: not-owned = slightly dimmed, not blocked
      card.style.opacity = owned ? '' : '0.72';
      if(owned) {
        card.classList.add('just-owned');
        setTimeout(()=>card.classList.remove('just-owned'), 400);
      }
    };
    setLock(!!state.owned);
    chk.addEventListener('change', e=>{ setLock(e.target.checked); saveState(); computeSummary(); updateHeaderSums(); });

    // Header updater
    function updateHeaderSums(){
      const local = collectLocalStateFromCard(card);
      const s = computeAllFourSums(hero, local);
      sumsAtkLet.textContent = `ATK +${(s.attackUp_percent||0).toFixed(1)}% • LET +${(s.lethalityUp_percent||0).toFixed(1)}%`;
      sumsDefHp.textContent  = `DEF +${(s.defenseUp_percent||0).toFixed(1)}% • HP +${(s.healthUp_percent||0).toFixed(1)}%`;
    }
    // First paint
    updateHeaderSums();

    return card;
  }

  // ---------- Merge joiners into Epic ----------
  function mergeJoinersIntoEpic(data){
    if (!Array.isArray(data.heroes)) data.heroes = [];
    const epicNames = new Set(data.heroes.filter(h=>h.type==='Epic'||h.tier==='Epic').map(h=>h.name));
    (data.joiners||[]).forEach(j=>{ if (!epicNames.has(j.name)) data.heroes.push({ ...j, type:'Epic' }); });
  }

  // ---------- Build the grid: Gen N..1 then Epic; 3 cols per group ----------
  function buildGrid(data){
    GRID.innerHTML = '';
    const saved = loadState();
    const pool  = (data.heroes || []);

    // bucket by generation (using name→gen map)
    const buckets = {};
    pool.forEach(h=>{
      const g = generationForHero(h.name);
      (buckets[g] ||= []).push(h);
    });

    // order: Gen N..1 desc, then Epic
    const gens = Object.keys(buckets).filter(k => /^Gen\s*\d+$/i.test(k));
    const sortedGens = gens
      .map(k => ({ k, n: parseInt(k.replace(/[^0-9]/g,''),10) || 0 }))
      .sort((a,b) => b.n - a.n)
      .map(x => x.k);
    if (buckets['Epic']?.length) sortedGens.push('Epic');

    // render each section (CSS sets 3 columns)
    sortedGens.forEach(group => {
      const list = buckets[group]; if (!list?.length) return;
      const sec   = document.createElement('section'); sec.className = 'group';
      const title = document.createElement('div');    title.className = 'group-title'; title.textContent = group;
      const grid  = document.createElement('div');    grid.className  = 'group-grid';
      list.forEach(hero => grid.appendChild(buildCard(hero, group, saved)));
      sec.appendChild(title); sec.appendChild(grid);
      GRID.appendChild(sec);
    });
  }

  // ---------- Battle‑PLUS summary (your existing table, kept intact) ----------
  function computeSummary(){
    const state   = loadState();
    const details = [];
    const totals = {
      attackUp_percent: 0, defenseUp_percent: 0, healthUp_percent: 0, lethalityUp_percent: 0,
      damageDealtUp_percent: 0, damageTakenDown_percent: 0,
      rallyAttackUp_percent: 0, rallyLethalityUp_percent: 0,
      defenderAttackUp_percent: 0, defenderLethalityUp_percent: 0,
      infantryLethality_percent: 0, infantryHealth_percent: 0,
      cavalryLethality_percent: 0, cavalryHealth_percent: 0,
      archerLethality_percent: 0,  archerHealth_percent: 0
    };

    // Walk owned cards in the grid and add effects from tiers.json
    GRID.querySelectorAll('.hero-card').forEach(card=>{
      const id = card.dataset.id;
      const st = state[id];
      if (!st || !st.owned) return;
      const heroName = card.querySelector('.hero-name').textContent.trim();
      const heroObj  = HERO_INDEX.get(heroName);
      if (!heroObj) return;

      // Skills
      (heroObj.skills||[]).forEach((sk, idx)=>{
        const level = (st.skills||[])[idx]||0; if (!level) return;
        const key = `Level ${level}`;
        const L   = sk.levels && (sk.levels[key] || sk.levels[level] || null);
        if (L){
          Object.entries(L).forEach(([k,v])=>{
            if (k.endsWith('_percent')){
              if (totals[k] == null) totals[k] = 0;
              totals[k] += +v;
            }
          });
          const pretty = Object.entries(L).map(([k,v])=> `${k.replace(/_/g,' ')}: ${v}%`).join(', ');
          details.push(`• <b>${heroName}</b> — ${sk.name}: ${pretty}`);
        }
      });

      // Widget stats
      if (heroObj.widget){
        const wLevel = +st.widget || 0;
        if (wLevel && heroObj.widget.stats){
          const levelKey = `Level ${wLevel}`;
          Object.entries(heroObj.widget.stats).forEach(([stat, table])=>{
            const val = table[levelKey];
            if (val!=null){ if (totals[stat]==null) totals[stat]=0; totals[stat]+= +val; }
          });
        }
        // Exclusive skills
        if (wLevel && heroObj.widget.exclusiveSkills){
          heroObj.widget.exclusiveSkills.forEach(ex=>{
            const map = ex.levels || {};
            const key1 = `⚔️ Lv.${wLevel}`, key2 = `Lv.${wLevel}`;
            const L = map[key1] || map[key2] || map[`Level ${wLevel}`] || null;
            if (L){
              Object.entries(L).forEach(([k,v])=>{
                if (k.endsWith('_percent')){ if (totals[k]==null) totals[k]=0; totals[k]+= +v; }
              });
              const pretty = Object.entries(L).map(([k,v])=> `${k.replace(/_/g,' ')}: ${v}%`).join(', ');
              details.push(`• <b>${heroName}</b> — Widget: ${ex.name}: ${pretty}`);
            }
          });
        }
      }
    });

    // Show/hide panel
    const anyOwned = Object.values(loadState()||{}).some(s => s && s.owned);
    SUM_PANEL.style.display = anyOwned ? 'block' : 'none';
    if (!anyOwned){
      SUM_TOTALS.textContent=''; SUM_TABLE.innerHTML=''; SUM_DETAILS.innerHTML='';
      return;
    }

    // Compact line
    const line = [
      `Attack +${(totals.attackUp_percent||0).toFixed(1)}%`,
      `Defense +${(totals.defenseUp_percent||0).toFixed(1)}%`,
      `Health +${(totals.healthUp_percent||0).toFixed(1)}%`,
      `Lethality +${(totals.lethalityUp_percent||0).toFixed(1)}%`,
      `Dmg Dealt +${(totals.damageDealtUp_percent||0).toFixed(1)}%`,
      `Dmg Taken −${(totals.damageTakenDown_percent||0).toFixed(1)}%`
    ].join(' · ');
    SUM_TOTALS.innerHTML = line;

    // Small table
    const rows = [
      ['Attack %', totals.attackUp_percent],
      ['Defense %', totals.defenseUp_percent],
      ['Health %', totals.healthUp_percent],
      ['Lethality %', totals.lethalityUp_percent],
      ['Damage Dealt %', totals.damageDealtUp_percent],
      ['Damage Taken Down %', totals.damageTakenDown_percent],
      ['Rally Attack %', totals.rallyAttackUp_percent],
      ['Rally Lethality %', totals.rallyLethalityUp_percent],
      ['Defender Attack %', totals.defenderAttackUp_percent],
      ['Defender Lethality %', totals.defenderLethalityUp_percent],
      ['Inf Lethality %', totals.infantryLethality_percent],
      ['Inf Health %', totals.infantryHealth_percent],
      ['Cav Lethality %', totals.cavalryLethality_percent],
      ['Cav Health %', totals.cavalryHealth_percent],
      ['Arc Lethality %', totals.archerLethality_percent],
      ['Arc Health %', totals.archerHealth_percent]
    ];
    const t = document.createElement('table');
    t.innerHTML = `
      <thead><tr><th>Stat</th><th>Total</th></tr></thead>
      <tbody>${rows.map(r=>`<tr><td>${r[0]}</td><td>${(r[1]||0).toFixed(2)}%</td></tr>`).join('')}</tbody>`;
    SUM_TABLE.innerHTML='';
    const scroller = document.createElement('div'); scroller.className = 'table-scroll'; scroller.appendChild(t);
    SUM_TABLE.appendChild(scroller);

    SUM_DETAILS.innerHTML = details.join('<br/>');
  }

  // ---------- Boot ----------
  let HERO_INDEX = new Map();
  window._HERO_INDEX_REF = HERO_INDEX;
  // Expose for mobile sheet cross-call
  window._heroSaveState = () => saveState();
  window._heroComputeSummary = () => computeSummary(); // expose for heroes-bear.js

  async function boot(){
    try{
      const data = await loadTiers();
      // merge joiners into Epic pool
      mergeJoinersIntoEpic(data);

      // build quick index by name
      (data.heroes||[]).forEach(h => HERO_INDEX.set(h.name, h));
      window._HERO_INDEX_REF = HERO_INDEX; // re-assign after population

      // build groups/grids and wire controls
      buildGrid(data);

      // footer buttons
      document.getElementById('exportHeroes').addEventListener('click', ()=>{
        saveState();
        const blob = new Blob([localStorage.getItem(KEY)||'{}'], {type:'application/json'});
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'heroes-selections.json';
        a.click(); URL.revokeObjectURL(a.href);
      });
      document.getElementById('clearHeroes').addEventListener('click', ()=>{
        localStorage.removeItem(KEY); buildGrid({ heroes: Array.from(HERO_INDEX.values()) }); computeSummary();
      });

      // initial summary
      computeSummary();
    }catch(err){
      console.error('[Heroes] failed to init', err);
    }
  }

  if (document.readyState==='loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

})();