// sim/engine/formulas.js
(function(){
  'use strict';

  const TYPES = ['inf','cav','arc'];

  function attackFactor(atkPct, lethPct){
    return (1 + (atkPct||0)/100) * (1 + (lethPct||0)/100);
  }

  function defenseFactor(defPct, hpPct){
    return (1 + (defPct||0)/100) * (1 + (hpPct||0)/100);
  }

  // Infantry > Archers, Archers > Cavalry, Cavalry > Infantry
  function triangle(att, def, base=1.0, adv=1.12){
    if (att==='inf' && def==='arc') return adv;
    if (att==='arc' && def==='cav') return adv;
    if (att==='cav' && def==='inf') return adv;
    return base;
  }

  function estimateKills(N, baseAtk, baseHp, AoverD, mul){
    if (N<=0) return 0;
    return Math.sqrt(N) * (baseAtk/Math.max(1,baseHp)) * AoverD * (mul||1);
  }

  function clamp(v, lo, hi){ return Math.max(lo, Math.min(hi, v)); }

  window.KingSim = window.KingSim || {};
  window.KingSim._math = { TYPES, attackFactor, defenseFactor, triangle, estimateKills, clamp };
})(); 