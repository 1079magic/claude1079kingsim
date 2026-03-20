// assets/heroes-bear.js
// Bear Call/Join hero recommendation engine.
// Reads hero state from heroGrid, scores each owned hero for CALL and JOIN,
// returns top 3 CALL heroes and N JOIN heroes (based on numMarches).
// Writes hero names into callRallyTable and joinTableWrap after app1.js renders.
// Exposes: window.HeroesBear = { recommend, getCallNames, getJoinNames }

(function () {
  'use strict';

  // ── Scoring weights ─────────────────────────────────────────────────────────
  // Priority (per user spec):
  //   1. Squad ATK + LET (apply to whole march) → 4.0
  //   2. Rally ATK + LET (from widget exclusive) → 3.0
  //   3. Damage Dealt / proc chance              → 0.8 / 0.5
  //   4. Troop-type lethality (archer/cav/inf)   → 0.4 / 0.3 / 0.25
  //   5. Defensive (damageTakenDown)             → 1.2 (Amadeus unique)
  // ── Bear scoring weights ─────────────────────────────────────────────────
  // Priority order (user-specified):
  //  1. Squad Lethality   (applies to entire march)
  //  2. Squad Attack      (applies to entire march)
  //  3. Rally Lethality   (applies to all rally members)
  //  4. Rally Attack      (applies to all rally members)
  //  5. Archer Lethality  (archer-specific)
  //  6. Archer Attack     (archer-specific)
  //  7. Cavalry Lethality (cavalry-specific)
  //  8. Cavalry Attack    (cavalry-specific)
  const BEAR_W = {
    // Tier 1 — Squad-wide (highest value, applies to whole march)
    lethalityUp_percent:        8.0,
    attackUp_percent:           7.0,

    // Tier 2 — Rally-wide (very high, applies to all rally marches)
    rallyLethalityUp_percent:   6.0,
    rallyAttackUp_percent:      5.0,

    // Tier 3 — Archer-specific
    archerLethality_percent:    3.0,
    archerAttack_percent:       2.5,

    // Tier 4 — Cavalry-specific
    cavalryLethality_percent:   2.0,
    cavalryHealth_percent:      0.5,

    // Secondary combat stats
    damageDealtUp_percent:      1.0,
    damageTakenDown_percent:    1.2,
    procChance_percent:         3.5,  // expected-value: chance × 0.50 effect ÷ 100 × atkWeight
    damagePerTurn_percent:      0.5,
    targetDamageTakenUp_percent:0.8,
    enemyLethalityDown_percent: 0.6,
    enemyAttackDown_percent:    0.6,

    // Defensive / utility
    infantryLethality_percent:  1.5,  // infantry matters for bear formation
    infantryDamageUp_percent:   1.0,
    defenseUp_percent:          0.3,
    healthUp_percent:           1.0,  // Born Leader passive
    defenderAttackUp_percent:   0.2,
  };

  // Joiner names — they get priority for JOIN slots (1 skill only in join)
  const JOINER_NAMES = new Set(['Chenko','Yeonwoo','Amane','Hilde']);

  // ── Score one hero given their current card state ────────────────────────────
  function scoreHero(heroData, cardState, isCall) {
    let score = 0;
    const skills     = heroData.skills  || [];
    const skillLevs  = cardState.skills || [];
    // CALL: all 3 expedition skills; JOIN: only skill[0] (first expedition skill only)
    const maxSkill   = isCall ? skills.length : 1;

    // Use hero level to determine skill effectiveness if skill levels not set
    // If all skills are 0 (not configured), use hero level as proxy (level 1-5)
    const heroLevel  = parseInt(cardState.level || 0);
    const skillProxy = heroLevel > 0 ? heroLevel : 0; // use as fallback

    for (let idx = 0; idx < maxSkill; idx++) {
      const lv  = skillLevs[idx] || skillProxy; // fall back to hero level
      if (!lv) continue;
      const row = skills[idx]?.levels?.[`Level ${lv}`] || {};
      for (const [k, v] of Object.entries(row)) {
        score += (parseFloat(v) || 0) * (BEAR_W[k] ?? 0.05);
      }
    }

    // Born Leader passive (Amadeus only): always-on bonus — add to score at hero level
    const passive = heroData.passiveAlways;
    if (passive && heroLevel > 0) {
      // Use tier1 as base; add significant weight since it always applies
      const tier = passive.tier1 || {};
      for (const [stat, lvMap] of Object.entries(tier)) {
        const val = lvMap[`Level ${heroLevel}`] || 0;
        score += (parseFloat(val) || 0) * (BEAR_W[stat] ?? 1.0) * 1.5; // 1.5x because always active
      }
    }

    // Widget — EXPEDITION only (stats + expedition-tagged exclusive skills)
    const wlv = parseInt(cardState.widget || 0);
    const w   = heroData.widget;
    if (w && wlv) {
      const lkey = `Level ${wlv}`;
      // Widget stats (cavalryLethality etc.) are expedition stats — include all
      for (const [k, table] of Object.entries(w.stats || {})) {
        const val = typeof table === 'object' ? (table[lkey] ?? 0) : 0;
        score += (parseFloat(val) || 0) * (BEAR_W[k] ?? 0.10);
      }
      // Only expedition-tagged exclusive skills
      for (const ex of (w.exclusiveSkills || []).filter(e => e.type === 'expedition')) {
        const lvMap = ex.levels || {};
        const row2  = lvMap[`⚔️ Lv.${wlv}`] || lvMap[`Level ${wlv}`] || {};
        for (const [k, v] of Object.entries(row2)) {
          score += (parseFloat(v) || 0) * (BEAR_W[k] ?? 0.10);
        }
      }
    }

    return Math.round(score * 10) / 10;
  }

  // ── Self-bootstrap index when running on magic/optiona pages ────────────────
  // heroes.js only runs on heros.html. On magic.html and optiona.html,
  // we load tiers.json directly and build _HERO_INDEX_REF ourselves.
  async function ensureHeroIndex() {
    if (window._HERO_INDEX_REF && window._HERO_INDEX_REF.size > 0) return;
    try {
      const res  = await fetch('tiers.json', { cache: 'force-cache' });
      const data = await res.json();
      const pool = (data.heroes || []).concat(data.joiners || []);
      const idx  = new Map();
      pool.forEach(h => idx.set(h.name, h));
      window._HERO_INDEX_REF = idx;
    } catch(e) {
      console.warn('[HeroesBear] Could not load tiers.json:', e);
    }
  }

  // ── Main recommendation function ─────────────────────────────────────────────
  // Returns { call: [{name,score}×3], join: [{name,score}×N], numMarches }
  function recommend() {
    const GRID = document.getElementById('heroGrid');
    if (!GRID) return null;

    // Read numMarches from troops page via localStorage / state-sync
    // state-sync stores under 'kingsim_marches' or we read the #numFormations input
    let numMarches = 1;
    try {
      const syncState = JSON.parse(localStorage.getItem('kingSim_shared_inputs_v1') || '{}');
      if (syncState.numFormations) numMarches = Math.max(1, parseInt(syncState.numFormations) || 1);
    } catch (_) {}
    // Also try reading the live #numFormations or #marchSize element
    const marchEl = document.getElementById('numFormations') || document.getElementById('marchSize');
    if (marchEl && marchEl.value) numMarches = Math.max(1, parseInt(marchEl.value) || 1);
    // Fallback: if still 1 and no marches set, use 3 as sensible default
    if (numMarches <= 1) numMarches = 3;

    // Collect hero data from HERO_INDEX (exposed by heroes.js)
    const heroIndex = window._HERO_INDEX_REF; // set by heroes.js boot
    if (!heroIndex || !heroIndex.size) return null;

    const savedState = (() => {
      try { return JSON.parse(localStorage.getItem('kingsim_heroes_v2') || '{}'); }
      catch(_) { return {}; }
    })();

    const callCandidates = []; // non-joiners only
    const joinCandidates = []; // joiners first priority, then non-joiners

    GRID.querySelectorAll('.hero-card').forEach(card => {
      const id    = card.dataset.id || '';
      const st    = savedState[id];
      if (!st || !st.owned) return;

      const heroName = card.querySelector('.hero-name')?.textContent?.trim() || '';
      const heroData = heroIndex.get(heroName);
      if (!heroData) return;

      const isJoiner = JOINER_NAMES.has(heroName);
      const callScore = scoreHero(heroData, st, true);
      const joinScore = scoreHero(heroData, st, false);

      if (!isJoiner) {
        callCandidates.push({ name: heroName, score: callScore, isJoiner: false });
      }
      // ALL heroes go into join pool; joiners sorted first
      joinCandidates.push({ name: heroName, score: joinScore, isJoiner });
    });

    // Sort CALL by score desc
    callCandidates.sort((a, b) => b.score - a.score);

    // CALL must have exactly 1 INF, 1 CAV, 1 ARC — pick best of each type
    const callByType = { Infantry: null, Cavalry: null, Archer: null };
    for (const h of callCandidates) {
      const tt = heroIndex.get(h.name)?.troopType || 'Infantry';
      if (!callByType[tt]) callByType[tt] = h;
    }
    // Build the typed call team (only include types that have a hero available)
    const callTop3 = Object.values(callByType).filter(Boolean);

    // JOIN: only heroes whose first expedition skill directly boosts squad/rally damage
    // procChance, damageTakenDown, defenseUp etc. in first skill = not effective for joins
    const JOIN_VALID_KEYS = new Set([
      'lethalityUp_percent', 'attackUp_percent',
      'rallyLethalityUp_percent', 'rallyAttackUp_percent',
    ]);
    function firstSkillIsValid(heroData) {
      const sk0 = heroData.skills?.[0];
      if (!sk0) return false;
      // Check any level's keys — if ANY level has a valid key, the skill is valid
      const lvls = Object.values(sk0.levels || {});
      return lvls.some(lv => Object.keys(lv).some(k => JOIN_VALID_KEYS.has(k)));
    }

    // Filter join candidates: must have valid first expedition skill
    const joinFiltered_valid = joinCandidates.filter(h => {
      const hd = heroIndex.get(h.name);
      return hd && firstSkillIsValid(hd);
    });

    // Sort: joiners first, then by score desc
    joinFiltered_valid.sort((a, b) => {
      if (a.isJoiner !== b.isJoiner) return a.isJoiner ? -1 : 1;
      return b.score - a.score;
    });
    // JOIN: numMarches - 1 slots (one march is the CALL)
    const joinNeeded = Math.max(0, numMarches - 1);
    // Remove call heroes from join pool to avoid duplicates
    const callNameSet = new Set(callTop3.map(h => h.name));
    const joinFiltered = joinFiltered_valid.filter(h => !callNameSet.has(h.name));
    const joinTopN = joinFiltered.slice(0, joinNeeded);

    return {
      call: callTop3,
      join: joinTopN,
      numMarches,
      allCall: callCandidates,
      allJoin: joinCandidates,
    };
  }

  // ── Table injection helpers ───────────────────────────────────────────────────
  // ── Shared hero table injection helpers ──────────────────────────────────────
  // Both magic.html and optiona.html use callRallyTable / joinTableWrap.
  // Hero names go between the Type/# column and the Infantry column.

  function injectCallHeroNames(callHeroes) {
    const callTable = document.getElementById('callRallyTable');
    if (!callTable) return;

    // ── thead: add "Heroes" th after Type ──
    const thead = callTable.querySelector('thead tr');
    if (thead && !thead.querySelector('.bear-hero-th')) {
      const th = document.createElement('th');
      th.className = 'bear-hero-th';
      th.style.cssText = 'font-size:.68rem;color:#22d3ee;white-space:nowrap;padding:4px 6px';
      th.textContent = 'Heroes';
      // Insert after first th (Type)
      thead.insertBefore(th, thead.cells[1]);
    }

    // ── tbody CALL row: add hero names cell after first td ──
    const callRow = callTable.querySelector('tbody tr');
    if (!callRow) return;
    let heroTd = callRow.querySelector('.bear-hero-cell');
    if (!heroTd) {
      heroTd = document.createElement('td');
      heroTd.className = 'bear-hero-cell';
      heroTd.style.cssText = 'padding:3px 6px;vertical-align:middle';
      callRow.insertBefore(heroTd, callRow.cells[1]);
    }

    if (!callHeroes?.length) { heroTd.innerHTML = ''; return; }

    // Each hero on its own line — wrapped, small font
    const pills = callHeroes.map(h => {
      const TYPE_EMOJI = { Infantry:'⚔️', Cavalry:'🐎', Archer:'🏹' };
      const heroData = window._HERO_INDEX_REF?.get(h.name);
      const em = TYPE_EMOJI[heroData?.troopType] || '';
      return `<div style="white-space:nowrap;margin-bottom:1px">
        <span class="bear-hero-pill bear-hero-pill--call" style="font-size:.65rem;padding:1px 5px">${em}${h.name}</span>
      </div>`;
    }).join('');
    heroTd.innerHTML = pills;
  }

  function injectJoinHeroNames(joinHeroes) {
    const joinWrap = document.getElementById('joinTableWrap');
    if (!joinWrap) return;

    // ── thead: add "Hero" th after # ──
    const thead = joinWrap.querySelector('thead tr');
    if (thead && !thead.querySelector('.bear-hero-th')) {
      const th = document.createElement('th');
      th.className = 'bear-hero-th';
      th.style.cssText = 'font-size:.68rem;color:#10b981;white-space:nowrap;padding:4px 6px';
      th.textContent = 'Hero';
      thead.insertBefore(th, thead.cells[1]);
    }

    const rows = joinWrap.querySelectorAll('tbody tr');
    rows.forEach((row, i) => {
      let heroTd = row.querySelector('.bear-hero-cell');
      if (!heroTd) {
        heroTd = document.createElement('td');
        heroTd.className = 'bear-hero-cell';
        heroTd.style.cssText = 'padding:3px 6px;vertical-align:middle';
        row.insertBefore(heroTd, row.cells[1]);
      }
      const hero = joinHeroes?.[i];
      if (!hero) { heroTd.innerHTML = ''; return; }
      heroTd.innerHTML = `<span class="bear-hero-pill bear-hero-pill--join" style="font-size:.65rem;padding:1px 5px;display:inline-block">${hero.name}</span>`;
    });
  }

  // ── Render bear recommendation panel on heros.html ───────────────────────────
  function renderBearPanel(rec) {
    const panel   = document.getElementById('bear-rec-panel');
    const content = document.getElementById('bear-rec-content');
    if (!panel || !content) return;
    if (!rec || (!rec.call?.length && !rec.join?.length)) {
      panel.style.display = 'none';
      return;
    }
    panel.style.display = 'block';

    const numM = rec.numMarches || 3;

    // ── Compact 2-col layout: CALL left | JOIN right ──────────────
    // Troop type emojis for call slots
    const TYPE_EMOJI = { Infantry:'⚔️', Cavalry:'🐎', Archer:'🏹' };

    // Build CALL column
    let callHtml = '';
    (rec.call || []).forEach((h, i) => {
      const heroData = window._HERO_INDEX_REF?.get(h.name);
      const tt = heroData?.troopType || '';
      const em = TYPE_EMOJI[tt] || '';
      callHtml += `<div style="display:flex;align-items:center;gap:5px;padding:4px 0;border-bottom:1px solid rgba(34,211,238,.08)">
        <span style="font-size:.75rem;width:16px;text-align:center">${em}</span>
        <span class="bear-hero-pill bear-hero-pill--call" style="font-size:.72rem;padding:2px 7px">${h.name}</span>
      </div>`;
    });

    // Build JOIN column
    let joinHtml = '';
    (rec.join || []).forEach((h, i) => {
      const isJ = JOINER_NAMES.has(h.name);
      const heroData = window._HERO_INDEX_REF?.get(h.name);
      const tt = heroData?.troopType || '';
      const em = TYPE_EMOJI[tt] || '';
      joinHtml += `<div style="display:flex;align-items:center;gap:5px;padding:4px 0;border-bottom:1px solid rgba(16,185,129,.08)">
        <span style="font-size:.75rem;width:16px;text-align:center">${em}</span>
        <span class="bear-hero-pill bear-hero-pill--join" style="font-size:.72rem;padding:2px 7px;display:inline-block">${h.name}</span>
        ${isJ?'<span style="font-size:.58rem;color:#7dd3fc;opacity:.65;white-space:nowrap">★</span>':''}
      </div>`;
    });

    const html = `
      <div style="font-size:.65rem;color:var(--muted);margin-bottom:6px">
        ${numM} march${numM!==1?'es':''} · CALL 3 heroes · ${numM-1} join slot${numM>2?'s':''}
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div>
          <div style="font-size:.65rem;font-weight:700;letter-spacing:.06em;color:#22d3ee;text-transform:uppercase;margin-bottom:4px">⚔ Call Rally</div>
          ${callHtml || '<p style="font-size:.7rem;color:var(--muted);padding:4px 0">No heroes set</p>'}
        </div>
        <div>
          <div style="font-size:.65rem;font-weight:700;letter-spacing:.06em;color:#10b981;text-transform:uppercase;margin-bottom:4px">🤝 Join Rallies</div>
          ${joinHtml || '<p style="font-size:.7rem;color:var(--muted);padding:4px 0">No join slots</p>'}
        </div>
      </div>
      <div style="font-size:.6rem;color:var(--muted);margin-top:6px;opacity:.6">★ = joiner hero · 1 hero per troop type in Call</div>`;

    content.innerHTML = html;
  }

  // ── Inject heroes into optTableWrap (optiona.html — same structure, different ID) ──
  function injectOptTableHeroes(callHeroes, joinHeroes) {
    const wrap = document.getElementById('optTableWrap');
    if (!wrap) return;
    const table = wrap.querySelector('table');
    if (!table) return;

    // thead: insert Heroes th after Type
    const thead = table.querySelector('thead tr');
    if (thead && !thead.querySelector('.bear-hero-th')) {
      const th = document.createElement('th');
      th.className = 'bear-hero-th';
      th.style.cssText = 'font-size:.68rem;color:#22d3ee;white-space:nowrap;padding:4px 6px';
      th.textContent = 'Heroes';
      thead.insertBefore(th, thead.cells[1]);
    }

    // tbody rows
    const rows = table.querySelectorAll('tbody tr');
    let joinIdx = 0;
    rows.forEach(row => {
      const typeCell = row.cells[0];
      const typeText = typeCell?.textContent?.trim() || '';
      const isCall = typeText.toUpperCase().includes('CALL');

      let heroTd = row.querySelector('.bear-hero-cell');
      if (!heroTd) {
        heroTd = document.createElement('td');
        heroTd.className = 'bear-hero-cell';
        heroTd.style.cssText = 'padding:3px 6px;vertical-align:middle';
        row.insertBefore(heroTd, row.cells[1]);
      }

      if (isCall && callHeroes?.length) {
        const pills = callHeroes.map(h => {
          const TYPE_EMOJI = { Infantry:'⚔️', Cavalry:'🐎', Archer:'🏹' };
          const hd = window._HERO_INDEX_REF?.get(h.name);
          const em = TYPE_EMOJI[hd?.troopType] || '';
          return `<div style="white-space:nowrap;margin-bottom:1px"><span class="bear-hero-pill bear-hero-pill--call" style="font-size:.65rem;padding:1px 5px">${em}${h.name}</span></div>`;
        }).join('');
        heroTd.innerHTML = pills;
      } else if (!isCall && joinHeroes?.[joinIdx]) {
        const h = joinHeroes[joinIdx++];
        heroTd.innerHTML = `<span class="bear-hero-pill bear-hero-pill--join" style="font-size:.65rem;padding:1px 5px;display:inline-block">${h.name}</span>`;
      } else {
        heroTd.innerHTML = '';
      }
    });
  }

  // ── Auto-inject after tables render (observe DOM changes) ────────────────────
  let _injectionScheduled = false;
  function scheduleInjection() {
    if (_injectionScheduled) return;
    _injectionScheduled = true;
    ensureHeroIndex().then(() => {
      _injectionScheduled = false;
      // Try fresh compute (heroes page); fall back to cache (magic/optiona)
      const rec = recommend() || loadRec();
      if (!rec || (!rec.call?.length && !rec.join?.length)) return;
      injectCallHeroNames(rec.call);
      injectJoinHeroNames(rec.join);
      injectOptTableHeroes(rec.call, rec.join);
      if (recommend()) { saveRec(rec); } // only save when fresh (has heroGrid)
      renderBearPanel(rec);
      window.__bearHeroRec = rec;
    });
  }

  // Observe callRallyTable, joinTableWrap, and optTableWrap for content changes
  function startObserving() {
    const ids = ['callRallyTable', 'joinTableWrap', 'optTableWrap'];
    ids.forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      new MutationObserver(() => scheduleInjection())
        .observe(el, { childList: true, subtree: true, characterData: true });
    });
    window.addEventListener('heroStateChanged', scheduleInjection);
  }

  // Expose public API
  window.HeroesBear = {
    recommend,
    renderBearPanel,
    scoreHero,
    BEAR_W,
    JOINER_NAMES,
    injectCallHeroNames,
    injectJoinHeroNames,
    scheduleInjection,
    startObserving,
  };

  // Auto-start + initial render on load
  // ── Persist recommendation to localStorage so it survives page navigation ──
  const REC_KEY = 'kingsim_bear_rec_v1';
  function saveRec(rec) {
    try { localStorage.setItem(REC_KEY, JSON.stringify(rec)); } catch(_) {}
  }
  function loadRec() {
    try { const r = localStorage.getItem(REC_KEY); return r ? JSON.parse(r) : null; }
    catch(_) { return null; }
  }

  function init() {
    startObserving();
    // Render from cache immediately (works on ALL pages, even without heroGrid)
    const cached = loadRec();
    if (cached && (cached.call?.length || cached.join?.length)) {
      renderBearPanel(cached);
      // Inject into tables right away from cache (magic/optiona pages)
      // Tables may not be rendered yet — the MutationObserver will also fire later
      injectCallHeroNames(cached.call);
      injectJoinHeroNames(cached.join);
      injectOptTableHeroes(cached.call, cached.join);
    }
    // Recompute fresh (only possible when heroGrid exists = heros.html)
    ensureHeroIndex().then(() => {
      const rec = recommend();
      if (rec && (rec.call.length || rec.join.length)) {
        saveRec(rec);
        renderBearPanel(rec);
        injectCallHeroNames(rec.call);
        injectJoinHeroNames(rec.join);
        injectOptTableHeroes(rec.call, rec.join);
      } else if (cached && (cached.call?.length || cached.join?.length)) {
        // No fresh rec (not on heroes page) — already rendered from cache above
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    // Already loaded — run after current call stack clears
    setTimeout(init, 0);
  }
})();
