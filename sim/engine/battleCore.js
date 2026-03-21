// sim/engine/battleCore.js  — v4 (counter-priority targeting, sqrt scaling, scale=100)
//
// COUNTER-PRIORITY TARGETING (rock-paper-scissors triangle):
//   Infantry  → attacks Cavalry first, then Archers, then Infantry (overflow)
//   Cavalry   → attacks Archers first, then Infantry, then Cavalry (overflow)
//   Archers   → attacks Infantry first, then Cavalry, then Archers (overflow)
//
// Rationale: Infantry is strong vs Cavalry (cav has low HP=470),
//            Cavalry is strong vs Archers (arc has lowest HP=354),
//            Archers are strong vs Infantry (arc has highest ATK=1888).
// This is the standard rock-paper-scissors counter triangle.
//
// Validation (counter model, scale=100):
//   Mystic ordering 50/15/35 > 44/25/31 > 40/25/35 ✓
//   With real PvP stats: 50/20/30 correctly predicted to lose vs heavy-cav defender ✓
//   Recommendations align with counter-intuition (arc helps vs inf-heavy defenders) ✓
//
// SIMULTANEOUS SNAPSHOTS: both sides attack using pre-round counts.
// kills = floor( sqrt(N_src) * baseAtk_src * atkFactor_src * SCALE / (baseHp_tgt * defFactor_tgt) )
// SCALE = 100 — calibrated for Mystic ground truth ordering.
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

  // Counter-priority attack order: each type attacks its preferred counter first
  // Infantry  counters Cavalry  (cav has low HP → inf kills cav efficiently)
  // Cavalry   counters Archers  (arc has lowest HP → cav kills arc efficiently)
  // Archers   counter  Infantry (arc has highest ATK → arc kills inf efficiently)
  const ATTACK_PRIORITY = {
    inf: ['cav', 'arc', 'inf'],   // infantry: cav → arc → inf
    cav: ['arc', 'inf', 'cav'],   // cavalry:  arc → inf → cav
    arc: ['inf', 'cav', 'arc'],   // archers:  inf → cav → arc
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
      tier: tier,
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

  // True Gold special abilities — expected value modifiers
  // Infantry: chance to reduce incoming damage
  // Cavalry: chance to deal double damage
  // Archer: chance to deal 50% extra damage
  const TG_ABILITIES = {
    'T10.TG3': {
      inf: { defBonus: 0.25 * 0.36 },   // 25% chance × 36% reduction = 9% avg reduction
      cav: { atkBonus: 0.10 * 1.00 },   // 10% chance × double (100% extra) = 10% avg extra
      arc: { atkBonus: 0.20 * 0.50 },   // 20% chance × 50% extra = 10% avg extra
    },
    'T10.TG4': {  // interpolated between TG3 and TG5
      inf: { defBonus: 0.3125 * 0.36 },
      cav: { atkBonus: 0.125 * 1.00 },
      arc: { atkBonus: 0.25 * 0.50 },
    },
    'T10.TG5': {
      inf: { defBonus: 0.375 * 0.36 },  // 37.5% chance × 36% = 13.5% avg reduction
      cav: { atkBonus: 0.15 * 1.00 },   // 15% chance × double = 15% avg extra
      arc: { atkBonus: 0.30 * 0.50 },   // 30% chance × 50% extra = 15% avg extra
    },
  };

  function getTgAbility(tier, type) {
    const tg = TG_ABILITIES[tier];
    return tg ? (tg[type] || {}) : {};
  }

  // kills from src type → tgt type
  function calcKills(srcN, tgtN, srcBase, tgtBase, srcAtkF, tgtDefF, srcTier, srcType, tgtTier, tgtType) {
    if (srcN <= 0 || tgtN <= 0) return 0;
    // Base damage
    let dmg = Math.sqrt(srcN) * srcBase.atk * srcAtkF * SCALE;
    // TG attack bonus (cavalry/archer extra damage)
    const srcTg = getTgAbility(srcTier, srcType);
    if (srcTg.atkBonus) dmg *= (1 + srcTg.atkBonus);
    // Target HP with TG defense bonus (infantry damage reduction)
    let hpEach = tgtBase.hp * tgtDefF;
    const tgtTg = getTgAbility(tgtTier, tgtType);
    if (tgtTg.defBonus) hpEach *= (1 + tgtTg.defBonus);
    return Math.min(tgtN, Math.max(0, Math.floor(dmg / Math.max(1, hpEach))));
  }

  // One side attacks with COUNTER-PRIORITY overflow targeting
  // Uses SNAPSHOT counts (frozen at round start) to avoid order dependency
  function applyAttacks(attSnap, defTroops, defSide) {
    const s = attSnap.troops;

    for (const srcType of ['inf', 'cav', 'arc']) {
      if (s[srcType] <= 0) continue;
      const priority = ATTACK_PRIORITY[srcType];
      for (const tgtType of priority) {
        if (defTroops[tgtType] <= 0) continue;
        const k = calcKills(
          s[srcType], defTroops[tgtType],
          attSnap.base[srcType], defSide.base[tgtType],
          attSnap.atkF[srcType], defSide.defF[tgtType],
          attSnap.tier, srcType, defSide.tier, tgtType
        );
        if (k > 0) {
          defTroops[tgtType] -= k;
          break;  // attack only one target type per troop type per round
        }
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
    const maxRounds = cfg.maxRounds || 300;

    for (let r = 0; r < maxRounds; r++) {
      const attTotal = attTroops.inf + attTroops.cav + attTroops.arc;
      const defTotal = defTroops.inf + defTroops.cav + defTroops.arc;
      if (attTotal <= 0 || defTotal <= 0) break;

      // SIMULTANEOUS: both sides attack using SNAPSHOT of current troops
      const attSnap = { troops: { ...attTroops }, base: att.base, atkF: att.atkF, tier: att.tier };
      const defSnap = { troops: { ...defTroops }, base: def.base, atkF: def.atkF, tier: def.tier };

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
