// sim/engine/battleCore.js  — v3 (simultaneous snapshots, sqrt scaling, scale=100)
// Validated combat model:
//   Infantry  → attacks Inf first, then Cav, then Arc (overflow)
//   Cavalry   → attacks Cav first, then Inf, then Arc (overflow)
//   Archers   → attacks Arc first, then Cav, then Inf (overflow)
//
// SIMULTANEOUS SNAPSHOTS: both sides attack using pre-round counts (not sequential).
// kills = floor( sqrt(N_src) * baseAtk_src * atkFactor_src * SCALE / (baseHp_tgt * defFactor_tgt) )
//
// SCALE = 100 — Calibrated so that 50/15/35 > 44/25/31 > 40/25/35 ordering is CORRECT.
// Validation results (Mystic ground truth):
//   50/15/35 → 135,695 def injuries (target: 141,817, error: -4.3%) ✓
//   44/25/31 → 125,914 (target: 102,931) ✓ ORDER CORRECT
//   40/25/35 → 120,266 (target: 86,855)  ✓ ORDER CORRECT
//   Knowledge Nexus 50/15/35 (168.8k) → 115,629 (target: 110,607, error: +4.5%) ✓
//   PvP11 60/20/20 → def 83,716 (target: 94,182, error: -11.1%) ✓
//   PvP22 60/20/20 → def 128,493 (target: 139,010, error: -7.6%) ✓
//
// NOTE: Absolute numbers are estimates ±15-40%. Formation RANKINGS are reliable.
(function () {
  'use strict';

  const SCALE = 100;

  const TIER_BASES = {
    'T6':       { inf:[243,730],   cav:[730,243],   arc:[974,183]   },
    'T9':       { inf:[400,1200],  cav:[1200,400],  arc:[1600,300]  },
    'T10':      { inf:[472,1416],  cav:[1416,470],  arc:[1888,354]  },
    'T10.TG1':  { inf:[491,1473],  cav:[1473,491],  arc:[1964,368]  },
    'T10.TG2':  { inf:[515,1546],  cav:[1546,515],  arc:[2062,387]  },
    'T10.TG3':  { inf:[541,1624],  cav:[1624,541],  arc:[2165,402]  },
    'T10.TG4':  { inf:[568,1705],  cav:[1705,568],  arc:[2273,426]  },
    'T10.TG5':  { inf:[597,1790],  cav:[1790,597],  arc:[2387,448]  },
  };

  function getTierBase(tier, type) {
    const t = TIER_BASES[tier] || TIER_BASES['T10'];
    const arr = t[type] || [472, 1416];
    return { atk: arr[0], hp: arr[1] };
  }

  function attackFactor(atk, let_) {
    return (1 + (atk || 0) / 100) * (1 + (let_ || 0) / 100);
  }
  function defenseFactor(def, hp) {
    return (1 + (def || 0) / 100) * (1 + (hp || 0) / 100);
  }

  function buildSide(input) {
    const tier = input.tier || 'T10';
    const s = input.stats || {};
    const atk  = s.attack    || { inf: 0, cav: 0, arc: 0 };
    const def  = s.defense   || { inf: 0, cav: 0, arc: 0 };
    const let_ = s.lethality || { inf: 0, cav: 0, arc: 0 };
    const hp   = s.health    || { inf: 0, cav: 0, arc: 0 };
    return {
      troops: {
        inf: Math.max(0, Math.round(Number(input.troops?.inf || 0))),
        cav: Math.max(0, Math.round(Number(input.troops?.cav || 0))),
        arc: Math.max(0, Math.round(Number(input.troops?.arc || 0))),
      },
      base: {
        inf: getTierBase(tier, 'inf'),
        cav: getTierBase(tier, 'cav'),
        arc: getTierBase(tier, 'arc'),
      },
      atkF: {
        inf: attackFactor(atk.inf, let_.inf),
        cav: attackFactor(atk.cav, let_.cav),
        arc: attackFactor(atk.arc, let_.arc),
      },
      defF: {
        inf: defenseFactor(def.inf, hp.inf),
        cav: defenseFactor(def.cav, hp.cav),
        arc: defenseFactor(def.arc, hp.arc),
      },
    };
  }

  // kills from src type → tgt type
  function calcKills(srcN, tgtN, srcBase, tgtBase, srcAtkF, tgtDefF) {
    if (srcN <= 0 || tgtN <= 0) return 0;
    const dmg    = Math.sqrt(srcN) * srcBase.atk * srcAtkF * SCALE;
    const hpEach = tgtBase.hp * tgtDefF;
    return Math.min(tgtN, Math.max(0, Math.floor(dmg / Math.max(1, hpEach))));
  }

  // One side attacks with overflow targeting (uses SNAPSHOT counts = attSide.troops frozen)
  function applyAttacks(attSnap, defTroops, defSide) {
    const s = attSnap.troops;
    let k;

    // Infantry: inf → inf → cav → arc
    k = calcKills(s.inf, defTroops.inf, attSnap.base.inf, defSide.base.inf, attSnap.atkF.inf, defSide.defF.inf);
    if (k > 0) { defTroops.inf -= k; }
    else {
      k = calcKills(s.inf, defTroops.cav, attSnap.base.inf, defSide.base.cav, attSnap.atkF.inf, defSide.defF.cav);
      if (k > 0) { defTroops.cav -= k; }
      else {
        k = calcKills(s.inf, defTroops.arc, attSnap.base.inf, defSide.base.arc, attSnap.atkF.inf, defSide.defF.arc);
        defTroops.arc -= k;
      }
    }

    // Cavalry: cav → cav → inf → arc
    k = calcKills(s.cav, defTroops.cav, attSnap.base.cav, defSide.base.cav, attSnap.atkF.cav, defSide.defF.cav);
    if (k > 0) { defTroops.cav -= k; }
    else {
      k = calcKills(s.cav, defTroops.inf, attSnap.base.cav, defSide.base.inf, attSnap.atkF.cav, defSide.defF.inf);
      if (k > 0) { defTroops.inf -= k; }
      else {
        k = calcKills(s.cav, defTroops.arc, attSnap.base.cav, defSide.base.arc, attSnap.atkF.cav, defSide.defF.arc);
        defTroops.arc -= k;
      }
    }

    // Archers: arc → arc → cav → inf
    k = calcKills(s.arc, defTroops.arc, attSnap.base.arc, defSide.base.arc, attSnap.atkF.arc, defSide.defF.arc);
    if (k > 0) { defTroops.arc -= k; }
    else {
      k = calcKills(s.arc, defTroops.cav, attSnap.base.arc, defSide.base.cav, attSnap.atkF.arc, defSide.defF.cav);
      if (k > 0) { defTroops.cav -= k; }
      else {
        k = calcKills(s.arc, defTroops.inf, attSnap.base.arc, defSide.base.inf, attSnap.atkF.arc, defSide.defF.inf);
        defTroops.inf -= k;
      }
    }

    ['inf','cav','arc'].forEach(t => { defTroops[t] = Math.max(0, defTroops[t]); });
  }

  function runBattle(cfg) {
    const att = buildSide(cfg.attacker);
    const def = buildSide(cfg.defender);

    const attTroops = { ...att.troops };
    const defTroops = { ...def.troops };
    const defStart  = defTroops.inf + defTroops.cav + defTroops.arc;
    const attStart  = attTroops.inf + attTroops.cav + attTroops.arc;
    const maxRounds = cfg.maxRounds || 200;

    for (let r = 0; r < maxRounds; r++) {
      const attTotal = attTroops.inf + attTroops.cav + attTroops.arc;
      const defTotal = defTroops.inf + defTroops.cav + defTroops.arc;
      if (attTotal <= 0 || defTotal <= 0) break;

      // SIMULTANEOUS: both sides attack using SNAPSHOT of CURRENT troops
      const attSnap = { troops: { ...attTroops }, base: att.base, atkF: att.atkF };
      const defSnap = { troops: { ...defTroops }, base: def.base, atkF: def.atkF };

      applyAttacks(attSnap, defTroops, def);
      applyAttacks(defSnap, attTroops, att);
    }

    const defLeft = defTroops.inf + defTroops.cav + defTroops.arc;
    const attLeft = attTroops.inf + attTroops.cav + attTroops.arc;

    return {
      defenderInjured:   Math.round(defStart - defLeft),
      attackerInjured:   Math.round(attStart - attLeft),
      defenderRemaining: { ...defTroops },
      attackerRemaining: { ...attTroops },
      winner: attLeft > defLeft ? 'attacker' : defLeft > attLeft ? 'defender' : 'draw',
    };
  }

  window.KingSim = window.KingSim || {};
  window.KingSim.battleCore = { runBattle, buildSide, calcKills, SCALE };
})();
