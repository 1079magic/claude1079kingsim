// --- NEW asymmetric optimizer: attacker scan vs fixed defender ---
// Requires: KingSim._battle.runBattle (existing), KingSim._trials.getTrial (existing)
(function(){
  'use strict';

  const TYPES = ['inf','cav','arc'];

  function makeFractions(fi, fc){
    fi = Math.max(0, Math.min(1, fi));
    fc = Math.max(0, Math.min(1 - fi, fc));
    const fa = Math.max(0, 1 - fi - fc);
    return { fi, fc, fa };
  }
  function toCounts(total, fr){
    const i = Math.round(fr.fi * total);
    const c = Math.round(fr.fc * total);
    const a = Math.max(0, total - i - c);
    return { inf: i, cav: c, arc: a };
  }
  function pctTrip(fr){
    const i = +(fr.fi*100).toFixed(1);
    const c = +(fr.fc*100).toFixed(1);
    const a = +(100 - i - c).toFixed(1);
    return {i,c,a};
  }
  function sumTroops(map){ return TYPES.reduce((s,t)=>s+(map[t]||0),0); }

  async function simulate(coreRun, cfg, trialMod, battles, seedBase){
    let wins = 0, atkSum = 0, defSum = 0;
    const attStart = sumTroops(cfg.attacker.troops);
    const defStart = sumTroops(cfg.defender.troops);
    for (let b=0; b<battles; b++){
      const res = await coreRun({
        attacker: cfg.attacker,
        defender: cfg.defender,
        trial: cfg.trial,
        options: { maxRounds: cfg.options?.maxRounds ?? 8, variance: cfg.options?.variance, seed: (seedBase ?? 1337) + b }
      }, trialMod);
      if (res.winner === 'attacker') wins++;
      const aRem = sumTroops(res.attacker_remaining);
      const dRem = sumTroops(res.defender_remaining);
      const attackerScore = defStart - dRem;   // damage dealt to defender
      const defenderScore = attStart - aRem;   // damage taken by attacker
      atkSum += attackerScore;
      defSum += defenderScore;
    }
    return {
      winRate: wins / Math.max(1,battles),
      atkScoreAvg: atkSum / Math.max(1,battles),
      defScoreAvg: defSum / Math.max(1,battles)
    };
  }

  function clamp(v, lo, hi){ return Math.max(lo, Math.min(hi, v)); }

  // Trial presets from your spec (used as search priors)
  const PRESETS = {
    // fi, fc, fa
    'Crystal Cave':       { fi:0.60, fc:0.20, fa:0.20 },
    'Knowledge Nexus':    { fi:0.50, fc:0.20, fa:0.30 },
    'Radiant Spire':      { fi:0.50, fc:0.15, fa:0.35 },
    'Forest of Life':     { fi:0.50, fc:0.15, fa:0.35 },
    'Molten Fort':        { fi:0.60, fc:0.15, fa:0.25 },
    // Coliseum guidance (heroes not modeled): two recommended seeds
    'Coliseum-March1-Calv2nd': { fi:0.50, fc:0.10, fa:0.40 },
    'Coliseum-March2-Calv1st': { fi:0.40, fc:0.40, fa:0.20 }
  };

  // Helper to build scanning windows
  function windowAround(fr, radFi=0.08, radFc=0.08){
    const lo = { fi: clamp(fr.fi - radFi, 0, 1), fc: clamp(fr.fc - radFc, 0, 1) };
    const hi = { fi: clamp(fr.fi + radFi, 0, 1), fc: clamp(fr.fc + radFc, 0, 1) };
    return { lo, hi };
  }

  // NEW main: scan attacker fractions against fixed defender formation
  async function scanFixedDefenderAdaptive({ 
    attackerBase,            // { totalTroops, tier, stats }
    defenderBase,            // { totalTroops, tier, stats, troops? (optional fixed counts) }
    trialName,
    defenderFractions,       // if defenderBase.troops not given, use these fractions
    maxTop = 10,
    // User-tunable (optional)
    battlesPerPoint = 120,
    sparsity = 0.05,
    fiMin = 0.40, fiMax = 0.80,
    fcMin = 0.15, fcMax = 0.30,
    seed = 1337
  }){
    const core = window.KingSim._battle;                              // battle core  [1](https://tipicoltd-my.sharepoint.com/personal/hadzisejdice_tipico_com/Documents/Datoteke%20aplikacije%20Microsoft%20Copilot%20Chat/optimizer.js)
    const trialMod = window.KingSim._trials.getTrial(trialName);      // trial modifiers [3](https://tipicoltd-my.sharepoint.com/personal/hadzisejdice_tipico_com/Documents/Datoteke%20aplikacije%20Microsoft%20Copilot%20Chat/rng.js)

    // Defender: prefer explicit per-type counts; else fractions → counts
    let defTroops;
    if (defenderBase.troops) {
      defTroops = defenderBase.troops;
    } else if (defenderFractions) {
      defTroops = toCounts(defenderBase.totalTroops, defenderFractions);
    } else {
      // Defender fallback presets (not attacker presets)
      const DEF_PRESETS = {
        'Crystal Cave':            { fi:0.40, fc:0.30, fa:0.30 },
        'Knowledge Nexus':         { fi:0.40, fc:0.30, fa:0.30 },
        'Forest of Life':          { fi:0.40, fc:0.30, fa:0.30 },
        'Molten Fort':             { fi:0.40, fc:0.30, fa:0.30 },
        'Radiant Spire':           { fi:0.40, fc:0.30, fa:0.30 },
        'Coliseum-March1-Calv2nd': { fi:0.40, fc:0.30, fa:0.30 },
        'Coliseum-March2-Calv1st': { fi:0.40, fc:0.30, fa:0.30 }
      };
      const preset = DEF_PRESETS[trialName] || { fi:0.40, fc:0.30, fa:0.30 };
      defTroops = toCounts(defenderBase.totalTroops, preset);
    }

    const searchPasses = [];

    // -----------------------------
    // High-density preset-centered scan (1 decimal around trial preset)
    // -----------------------------

    // center around ATTACKER preset for this trial
    const preset = PRESETS[trialName] || { fi:0.55, fc:0.20, fa:0.25 };

    // window: ±10% around preset, resolution = 0.01 (≈ 1 decimal in % space)
    // you can tighten to 0.05 if you want fewer points, or enlarge to 0.15 for more
    const windowFi = 0.10;
    const windowFc = 0.10;
    const stepFi   = 0.01;
    const stepFc   = 0.01;

    const fiMinLocal = clamp(preset.fi - windowFi, 0, 1);
    const fiMaxLocal = clamp(preset.fi + windowFi, 0, 1);
    const fcMinLocal = clamp(preset.fc - windowFc, 0, 1);
    const fcMaxLocal = clamp(preset.fc + windowFc, 0, 1);

    const points = [];
    let best = { winRate:-1, atkScore:-Infinity, defScore:Infinity, fr:{fi:0.5,fc:0.25,fa:0.25} };

    for (let fi = fiMinLocal; fi <= fiMaxLocal + 1e-9; fi += stepFi){
      for (let fc = fcMinLocal; fc <= fcMaxLocal + 1e-9; fc += stepFc){

        // keep the simplex: fi + fc + fa = 1
        const fa = 1 - fi - fc;
        if (fa < 0) continue; // skip invalid triples

        const fr = { fi, fc, fa };

        // build attacker counts from fractions; defender is fixed (defTroops)
        const att = toCounts(attackerBase.totalTroops, fr);
        const cfg = {
          attacker: { troops: att, tier: attackerBase.tier, stats: attackerBase.stats },
          defender: { troops: defTroops, tier: defenderBase.tier, stats: defenderBase.stats },
          trial: trialName,
          options: { maxRounds: 8 }
        };

        const r = await simulate(core.runBattle, cfg, trialMod, battlesPerPoint, seed);
        const attackerScore = Math.round(r.atkScoreAvg);
        const defenderScore = Math.round(r.defScoreAvg);

        // label with 1 decimal
        const label = {
          i: +(fi*100).toFixed(1),
          c: +(fc*100).toFixed(1),
          a: +(fa*100).toFixed(1)
        };

        points.push({
          fi, fc, fa,
          label: `${label.i}/${label.c}/${label.a}`,
          winPct: Math.round(r.winRate*100),
          atkScore: attackerScore,
          defScore: defenderScore
        });

        // track best by pure attacker score (ties → smaller defender score)
        if (
          attackerScore > (best.atkScore ?? -Infinity) ||
          (attackerScore === best.atkScore && defenderScore < (best.defScore ?? Infinity))
        ){
          best = { winRate:r.winRate, atkScore:attackerScore, defScore:defenderScore, fr };
        }
      }
    }

    // Scoreboard = top 10 by attacker score desc (ties → smaller defender score)
    const top = points.slice().sort((a,b)=>{
      if (b.atkScore !== a.atkScore) return b.atkScore - a.atkScore;
      if (a.defScore !== b.defScore) return a.defScore - b.defScore;
      return (b.winPct ?? 0) - (a.winPct ?? 0);
    }).slice(0, Math.max(1, maxTop));

    return {
      best: { fractions: best.fr, winChance: Math.round((best.winRate||0)*100), atkScore: best.atkScore, defScore: best.defScore },
      top,
      defender: {
        fractions: (()=>{
          const s = sumTroops(defTroops) || 1;
          return { fi: (defTroops.inf||0)/s, fc: (defTroops.cav||0)/s, fa: (defTroops.arc||0)/s };
        })(),
        troops: defTroops
      },
      points
    };
  }

  window.KingSim = window.KingSim || {};
  window.KingSim._optimizer = Object.assign({}, window.KingSim._optimizer, { scanFixedDefenderAdaptive });
})();