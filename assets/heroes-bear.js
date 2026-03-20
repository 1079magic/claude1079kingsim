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
  const BEAR_W = {
    attackUp_percent:         4.0,
    lethalityUp_percent:      4.0,
    rallyAttackUp_percent:    3.0,
    rallyLethalityUp_percent: 3.0,
    damageDealtUp_percent:    1.0,
    damageTakenDown_percent:  1.2,
    procChance_percent:       0.5,
    damagePerTurn_percent:    0.5,
    archerLethality_percent:  0.4,
    archerHealth_percent:     0.15,
    cavalryLethality_percent: 0.3,
    cavalryHealth_percent:    0.15,
    infantryLethality_percent:0.25,
    infantryHealth_percent:   0.10,
    defenderAttackUp_percent: 0.2,
    healthUp_percent:          1.0,  // Born Leader passive and others
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

    // Widget (stats + exclusive skills)
    const wlv = parseInt(cardState.widget || 0);
    const w   = heroData.widget;
    if (w && wlv) {
      const lkey = `Level ${wlv}`;
      for (const [k, table] of Object.entries(w.stats || {})) {
        const val = typeof table === 'object' ? (table[lkey] ?? 0) : 0;
        score += (parseFloat(val) || 0) * (BEAR_W[k] ?? 0.10);
      }
      for (const ex of (w.exclusiveSkills || [])) {
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

    // Sort CALL: by score desc (non-joiners only, all 3 skills)
    callCandidates.sort((a, b) => b.score - a.score);

    // Sort JOIN: joiners first (sorted by score), then non-joiners (sorted by score)
    joinCandidates.sort((a, b) => {
      if (a.isJoiner !== b.isJoiner) return a.isJoiner ? -1 : 1;
      return b.score - a.score;
    });

    const callTop3 = callCandidates.slice(0, 3);
    // JOIN: numMarches - 1 slots (one march is the CALL)
    const joinNeeded = Math.max(0, numMarches - 1);
    // Remove call heroes from join pool to avoid duplicates
    const callNameSet = new Set(callTop3.map(h => h.name));
    const joinFiltered = joinCandidates.filter(h => !callNameSet.has(h.name));
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
  // Inject hero names into callRallyTable (after app1.js renders it)
  function injectCallHeroNames(callHeroes) {
    const callTable = document.getElementById('callRallyTable');
    if (!callTable || !callHeroes?.length) return;
    const tbody = callTable.querySelector('tbody');
    if (!tbody) return;

    // Find or create the hero name row (2nd row, after the CALL formation row)
    let heroRow = tbody.querySelector('.bear-hero-row-call');
    if (!heroRow) {
      heroRow = document.createElement('tr');
      heroRow.className = 'bear-hero-row-call';
      tbody.insertBefore(heroRow, tbody.firstChild.nextSibling || null);
    }

    const nameHtml = callHeroes.map(h =>
      `<span class="bear-hero-pill bear-hero-pill--call">${h.name}</span>`
    ).join('');

    heroRow.innerHTML = `
      <td style="font-size:.7rem;color:#7dd3fc;font-weight:600;white-space:nowrap">Heroes</td>
      <td colspan="4" style="padding:3px 8px">
        <div class="bear-hero-names">${nameHtml}</div>
      </td>`;
  }

  // Inject hero names into joinTableWrap (per row)
  function injectJoinHeroNames(joinHeroes) {
    const joinWrap = document.getElementById('joinTableWrap');
    if (!joinWrap || !joinHeroes?.length) return;
    const rows = joinWrap.querySelectorAll('tbody tr');
    rows.forEach((row, i) => {
      const hero = joinHeroes[i];
      if (!hero) return;

      // Find or create the hero cell (before infantry cell)
      let heroCell = row.querySelector('.bear-hero-cell');
      if (!heroCell) {
        heroCell = document.createElement('td');
        heroCell.className = 'bear-hero-cell';
        heroCell.style.cssText = 'padding:3px 6px;font-size:.7rem;vertical-align:middle';
        // Insert after the first # cell
        const firstCell = row.cells[0];
        if (firstCell) row.insertBefore(heroCell, firstCell.nextSibling);
        // Adjust header too (add "Hero" th after #)
        const thead = joinWrap.querySelector('thead tr');
        if (thead && !thead.querySelector('.bear-hero-th')) {
          const heroTh = document.createElement('th');
          heroTh.className = 'bear-hero-th';
          heroTh.textContent = 'Hero';
          heroTh.style.cssText = 'font-size:.7rem;white-space:nowrap';
          thead.insertBefore(heroTh, thead.cells[1]);
        }
      }
      heroCell.innerHTML = `<span class="bear-hero-pill bear-hero-pill--join">${hero.name}</span>`;
    });
  }

  // ── Render bear recommendation panel on heros.html ───────────────────────────
  function renderBearPanel(rec) {
    const panel   = document.getElementById('bear-rec-panel');
    const content = document.getElementById('bear-rec-content');
    if (!panel || !content) return;
    if (!rec || (!rec.call.length && !rec.join.length)) {
      panel.style.display = 'none';
      return;
    }
    panel.style.display = 'block';

    const numM = rec.numMarches;
    let html = `<p style="font-size:.72rem;color:var(--muted);margin:0 0 8px">
      Based on ${numM} march${numM!==1?'es':''} · own ${numM===1?'0':'('+numM+'-1)'} join slot${numM>2?'s':''}</p>`;

    // CALL section
    if (rec.call.length) {
      html += `<div style="margin-bottom:10px">
        <div style="font-size:.7rem;font-weight:700;letter-spacing:.05em;color:#22d3ee;text-transform:uppercase;margin-bottom:5px">
          ⚔ Call Rally — Top ${rec.call.length} Heroes
        </div>`;
      rec.call.forEach((h, i) => {
        html += `<div style="display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid #1a2c40">
          <span style="font-size:.7rem;color:var(--muted);width:16px;text-align:right">${i+1}</span>
          <span class="bear-hero-pill bear-hero-pill--call" style="font-size:.75rem">${h.name}</span>
          <span style="font-size:.68rem;color:var(--muted);margin-left:auto">score ${h.score}</span>
        </div>`;
      });
      html += `</div>`;
    }

    // JOIN section
    if (rec.join.length) {
      html += `<div>
        <div style="font-size:.7rem;font-weight:700;letter-spacing:.05em;color:#10b981;text-transform:uppercase;margin-bottom:5px">
          🤝 Join Rallies — Top ${rec.join.length} Hero${rec.join.length!==1?'es':''}
        </div>`;
      rec.join.forEach((h, i) => {
        const isJ = JOINER_NAMES.has(h.name);
        html += `<div style="display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid #1a2c40">
          <span style="font-size:.7rem;color:var(--muted);width:16px;text-align:right">${i+1}</span>
          <span class="bear-hero-pill bear-hero-pill--join" style="font-size:.75rem;display:inline-block">${h.name}</span>
          ${isJ ? '<span style="font-size:.62rem;color:#7dd3fc;opacity:.7">joiner</span>' : ''}
          <span style="font-size:.68rem;color:var(--muted);margin-left:auto">score ${h.score}</span>
        </div>`;
      });
      html += `</div>`;
    }

    if (!rec.call.length && !rec.join.length) {
      html = '<p class="muted" style="font-size:.78rem">Mark heroes as Owned to see recommendations.</p>';
    }

    content.innerHTML = html;
  }

  // ── Auto-inject after tables render (observe DOM changes) ────────────────────
  let _injectionScheduled = false;
  function scheduleInjection() {
    if (_injectionScheduled) return;
    _injectionScheduled = true;
    ensureHeroIndex().then(() => {
      _injectionScheduled = false;
      const rec = recommend();
      if (!rec) return;
      injectCallHeroNames(rec.call);
      injectJoinHeroNames(rec.join);
      renderBearPanel(rec);
      window.__bearHeroRec = rec;
    });
  }

  // Observe callRallyTable and joinTableWrap for content changes
  function startObserving() {
    const ids = ['callRallyTable', 'joinTableWrap'];
    ids.forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      new MutationObserver(() => scheduleInjection())
        .observe(el, { childList: true, subtree: true, characterData: true });
    });
    // Also re-inject when hero state changes
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
  function init() {
    startObserving();
    // Render bear panel on initial load (even before tables exist)
    ensureHeroIndex().then(() => {
      const rec = recommend();
      if (rec) renderBearPanel(rec);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    // Already loaded — run after current call stack clears
    setTimeout(init, 0);
  }
})();
