
(function(){
  'use strict';

  const TYPES = ['inf','cav','arc'];

  function attackFactor(attackPct, lethPct){
    // A = (1 + attack/100) * (1 + lethality/100)
    return (1 + (attackPct||0)/100) * (1 + (lethPct||0)/100);
  }

  function defenseFactor(defPct, hpPct){
    // D = (1 + defense/100) * (1 + health/100)
    return (1 + (defPct||0)/100) * (1 + (hpPct||0)/100);
  }

  // Triangle: Infantry>Archers, Archers>Cavalry, Cavalry>Infantry
  // Return multiplier for (attackerType -> defenderType).
  function triangle(att, def, base=1.0, adv=1.12, dis=1.0){
    if (att==='inf' && def==='arc') return adv;
    if (att==='arc' && def==='cav') return adv;
    if (att==='cav' && def==='inf') return adv;
    // Disadvantage hook (if ever needed later)
    return base;
  }

  // Killed units
  // K = sqrt(N) * (baseAtk_att / baseHp_def) * (A_att / D_def) * M
  function estimateKills(N, baseAtk, baseHp, A_over_D, modifier){
    if (N<=0) return 0;
    const root = Math.sqrt(N);
    return root * (baseAtk / Math.max(1, baseHp)) * A_over_D * (modifier||1);
  }

  function clamp(val, min, max){ return Math.max(min, Math.min(max, val)); }

  window.KingSim = window.KingSim || {};
  window.KingSim._math = { TYPES, attackFactor, defenseFactor, triangle, estimateKills, clamp };
})();