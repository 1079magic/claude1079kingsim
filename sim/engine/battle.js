// sim/engine/battle.js
(function(){
  'use strict';

  const M = window.KingSim._math;
  const TYPES = M.TYPES;

  // --- Embedded fallback so the sim works on file:// as well ---
  const TIERS_FALLBACK = {
    tiers: {
      "T6":      { inf:[243,730],  cav:[730,243],  arc:[974,183]  },
      "T9":      { inf:[400,1200], cav:[1200,400], arc:[1600,300] },
      "T10":     { inf:[472,1416], cav:[1416,470], arc:[1888,354] },
      "T10.TG1": { inf:[491,1473], cav:[1473,491], arc:[1964,368] },
      "T10.TG2": { inf:[515,1546], cav:[1546,515], arc:[2062,387] },
      "T10.TG3": { inf:[541,1624], cav:[1624,541], arc:[2165,402] },
      "T10.TG4": { inf:[568,1705], cav:[1705,568], arc:[2273,426] },
      "T10.TG5": { inf:[597,1790], cav:[1790,597], arc:[2387,448] }
    }
  };

  let TIERS = null;
  async function loadTiersOnce(){
    if (TIERS) return TIERS;
    try {
      const res = await fetch('tiers.json', { cache: 'no-store' });
      if (!res.ok) throw new Error('tiers.json not ok: ' + res.status);
      TIERS = await res.json();
    } catch (e) {
      console.warn('[KingSim] Using embedded tiers fallback (fetch failed):', e?.message || e);
      TIERS = TIERS_FALLBACK;
    }
    return TIERS;
  }

  // Small, local RNG in case rng.js didn’t attach (keeps sim running)
  function FallbackRNG(seed){
    let t = (typeof seed === 'number' ? seed : 123456789) >>> 0;
    this.float = () => {
      t += 0x6D2B79F5;
      let x = Math.imul(t ^ (t >>> 15), 1 | t);
      x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
      return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    };
    this.int  = (min,max)=>{ min=Math.ceil(min); max=Math.floor(max); return Math.floor(this.float()*(max-min+1))+min; };
    this.pick = (arr)=>arr[Math.floor(this.float()*arr.length)];
  }

  function makeSideInput(side){
    const get = (src, t) => typeof src === 'number' ? src : (src?.[t] ?? 0);
    const out = { troops:{}, A:{}, D:{}, tier: side.tier || 'T10' };
    TYPES.forEach(t=>{
      out.troops[t] = Math.max(0, Number(side.troops?.[t] || 0));
      out.A[t] = M.attackFactor( get(side.stats?.attack,t), get(side.stats?.lethality,t) );
      out.D[t] = M.defenseFactor( get(side.stats?.defense,t), get(side.stats?.health,t) );
    });
    return out;
  }

  function baseOf(tierKey, troopType){
    const tt = TIERS?.tiers?.[tierKey];
    const arr = tt?.[troopType] || [1,1];
    return { atk: arr[0], hp: arr[1] };
  }

  function sumTroops(map){ return TYPES.reduce((s,t)=>s+(map[t]||0),0); }

  // TG special abilities — expected value modifiers
  const TG_ABILITIES = {
    'T10.TG3': { inf: { defBonus: 0.25*0.36 }, cav: { atkBonus: 0.10*1.00 }, arc: { atkBonus: 0.20*0.50 } },
    'T10.TG4': { inf: { defBonus: 0.3125*0.36 }, cav: { atkBonus: 0.125*1.00 }, arc: { atkBonus: 0.25*0.50 } },
    'T10.TG5': { inf: { defBonus: 0.375*0.36 }, cav: { atkBonus: 0.15*1.00 }, arc: { atkBonus: 0.30*0.50 } },
  };
  function tgAtkMul(tier, type) { return 1 + ((TG_ABILITIES[tier]?.[type]?.atkBonus) || 0); }
  function tgDefMul(tier, type) { return 1 + ((TG_ABILITIES[tier]?.[type]?.defBonus) || 0); }

  async function runBattle(cfg, trialMod){
    if (!TIERS) await loadTiersOnce();

    // ✅ build RNG *inside* runBattle (cfg exists here)
    const RngCtor = (window.KingSim && typeof window.KingSim.RNG === 'function') ? window.KingSim.RNG : FallbackRNG;
    const rnd = new RngCtor(cfg?.options?.seed ?? (Date.now() & 0xffffffff));

    const maxRounds = Math.max(1, Math.floor(cfg?.options?.maxRounds ?? 8));
    const variance  = Math.max(0, Math.min(1, cfg?.options?.variance ?? (trialMod.variance ?? 0.06)));

    const A = makeSideInput(cfg.attacker);
    const D = makeSideInput(cfg.defender);

    const att = { ...A.troops };
    const def = { ...D.troops };

    const baseA = {}, baseD = {};
    TYPES.forEach(t=>{ baseA[t]=baseOf(A.tier,t); baseD[t]=baseOf(D.tier,t); });

    const rounds = [];

    for (let r=1; r<=maxRounds; r++){
      if (sumTroops(att)===0 || sumTroops(def)===0) break;

      const detail = { round:r, kills:{att:{},def:{}}, remain:{att:{},def:{}}, rng:[], activeBuffs: trialMod.note||'' };

      // --- Attacker -> Defender (equal weights; triangle advantage via multipliers)
      TYPES.forEach(aT=>{
        const Na = att[aT]||0; if (Na<=0){ detail.kills.att[aT]=0; return; }
        TYPES.forEach(dT=>{
          const Nd = def[dT]||0; if (Nd<=0) return;
          const tri  = M.triangle(aT, dT, trialMod.baseTriangle, trialMod.advTriangle);
          const vs   = (trialMod.vs?.[aT]?.[dT] ?? 1.0);
          const rand = (1 - variance) + 2*variance*rnd.float();
          const AoD  = A.A[aT]/D.D[dT];
          const mul  = (trialMod.globalMul ?? 1.0) * tri * vs * rand * tgAtkMul(A.tier, aT);
          const defTgMul = tgDefMul(D.tier, dT);
          const k    = Math.min(Nd, Math.max(0, Math.floor(M.estimateKills(Na/3, baseA[aT].atk, baseD[dT].hp * defTgMul, AoD, mul))));
          def[dT]   -= k;
          detail.kills.att[aT] = (detail.kills.att[aT]||0) + k;
          detail.rng.push(rand);
        });
      });

      // --- Defender -> Attacker (independent random stream: ok to reuse rnd for determinism)
      TYPES.forEach(aT=>{
        const Na = def[aT]||0; if (Na<=0){ detail.kills.def[aT]=0; return; }
        TYPES.forEach(dT=>{
          const Nd = att[dT]||0; if (Nd<=0) return;
          const tri  = M.triangle(aT, dT, trialMod.baseTriangle, trialMod.advTriangle);
          const vs   = (trialMod.vs?.[aT]?.[dT] ?? 1.0);
          const rand = (1 - variance) + 2*variance*rnd.float();
          const AoD  = D.A[aT]/A.D[dT];
          const mul  = (trialMod.globalMul ?? 1.0) * tri * vs * rand * tgAtkMul(D.tier, aT);
          const attTgMul = tgDefMul(A.tier, dT);
          const k    = Math.min(Nd, Math.max(0, Math.floor(M.estimateKills(Na/3, baseD[aT].atk, baseA[dT].hp * attTgMul, AoD, mul))));
          att[dT]   -= k;
          detail.kills.def[aT] = (detail.kills.def[aT]||0) + k;
          detail.rng.push(rand);
        });
      });

      TYPES.forEach(t=>{ detail.remain.att[t]=att[t]; detail.remain.def[t]=def[t]; });
      rounds.push(detail);
    }

    const attLeft = sumTroops(att);
    const defLeft = sumTroops(def);
    const winner  = (attLeft>defLeft ? 'attacker' : (defLeft>attLeft ? 'defender' : 'draw'));

    return {
      winner,
      rounds: rounds.length,
      detail: rounds,
      attacker_remaining: { ...att },
      defender_remaining: { ...def }
    };
  }

  window.KingSim = window.KingSim || {};
  window.KingSim._battle = { runBattle };
})();