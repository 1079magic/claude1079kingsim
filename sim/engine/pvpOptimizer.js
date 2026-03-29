// sim/engine/pvpOptimizer.js
// PvP / CB-Turret optimizer — defender formation is FIXED from import.
// Reuses battleCore.js — no engine logic duplicated.
(function () {
  'use strict';

  function makeTroops(total, fi, fc) {
    fi = Math.max(0, Math.min(1, fi));
    fc = Math.max(0, Math.min(1 - fi, fc));
    const inf = Math.round(fi * total);
    const cav = Math.round(fc * total);
    const arc = Math.max(0, total - inf - cav);
    return { inf, cav, arc };
  }

  function formatLabel(fi, fc) {
    const fa = Math.max(0, 1 - fi - fc);
    return `${Math.round(fi * 100)}/${Math.round(fc * 100)}/${Math.round(fa * 100)}`;
  }

  /**
   * Scan attacker formations vs a fixed scanned defender.
   * @param {object} opts
   *   attackerTotal   - total attacker troops
   *   attackerStats   - attacker stats { attack, defense, lethality, health }
   *   attackerTier    - tier key
   *   defenderTroops  - {inf, cav, arc} FIXED from scan (REQUIRED)
   *   defenderStats   - defender stats from scan
   *   defenderTier    - tier
   *   sparsity / infMin / infMax / cavMin / cavMax
   *   maxTop          - top N (default 10)
   */
  function scanPvP(opts) {
    const core = window.KingSim && window.KingSim.battleCore;
    if (!core) throw new Error('battleCore not loaded');

    let {
      attackerTotal   = 150000,
      attackerStats   = {},
      attackerTier    = 'T10',
      defenderTroops,
      defenderStats   = {},
      defenderTier    = 'T10',
      sparsity  = 0.01,
      // Wide defaults — let the engine find the true optimum
      infMin = 0.35, infMax = 0.75,
      cavMin = 0.05, cavMax = 0.30,
      arcMin = 0.10,
      maxTop = 10,
      isRecalibration = false,
    } = opts;

    if (!defenderTroops) throw new Error('defenderTroops required for PvP scan');

    // Adapt bounds ONLY when defender is missing a troop type — not for balanced defenders
    if (!isRecalibration) {
      const defTotal = (defenderTroops.inf||0) + (defenderTroops.cav||0) + (defenderTroops.arc||0);
      if (defTotal > 0) {
        const defArcPct = (defenderTroops.arc||0) / defTotal;
        const defInfPct = (defenderTroops.inf||0) / defTotal;
        const defCavPct = (defenderTroops.cav||0) / defTotal;

        // ONLY adapt when a troop type is missing or nearly absent (<5%)
        // Balanced defenders (all types present) use the wide defaults above

        // No/very few archers → defense-heavy, need DPS
        if (defArcPct < 0.05) {
          infMin = 0.48; infMax = 0.58;
          cavMin = 0.02; cavMax = 0.08;
          arcMin = 0.35;
          if (defInfPct > 0.60) {
            infMin = 0.50; infMax = 0.58;
            cavMin = 0.02; cavMax = 0.07;
            arcMin = 0.36;
          }
        }

        // No/very few cavalry → boost cav to kill undefended archers
        if (defCavPct < 0.05 && defArcPct > 0.30) {
          cavMin = 0.15; cavMax = 0.35;
        }

        // No/very few infantry → lighter tank, more DPS
        if (defInfPct < 0.05) {
          infMin = 0.30; infMax = 0.50;
          arcMin = 0.35;
        }
      }
    }

    const results = [];

    for (let fi = infMin; fi <= infMax + 1e-9; fi += sparsity) {
      for (let fc = cavMin; fc <= cavMax + 1e-9; fc += sparsity) {
        const fa = 1 - fi - fc;
        if (fa < -1e-9 || fi + fc > 1 + 1e-9) continue;
        if (fa < arcMin - 1e-9) continue;  // enforce minimum archer fraction

        const attTroops = makeTroops(attackerTotal, fi, fc);

        const result = core.runBattle({
          attacker: { troops: attTroops, tier: attackerTier, stats: attackerStats },
          defender: { troops: { ...defenderTroops }, tier: defenderTier, stats: defenderStats },
          maxRounds: 300,
        });

        results.push({
          fi: parseFloat(fi.toFixed(4)),
          fc: parseFloat(fc.toFixed(4)),
          fa: parseFloat(Math.max(0, fa).toFixed(4)),
          label: formatLabel(fi, fc),
          score: result.defenderInjured,
          attackerInjured: result.attackerInjured,
          defenderInjured: result.defenderInjured,
          winner: result.winner,
        });
      }
    }

    // PvP scoring: WIN first, then among winners sort by most attacker survivors,
    // among losers sort by most defender damage dealt.
    // For balanced defenders (all 3 types ≥10%), apply slight infantry-stability bias
    // to prefer formations around 50% infantry (solid tank + balanced DPS).
    const defTotal2 = (defenderTroops.inf||0) + (defenderTroops.cav||0) + (defenderTroops.arc||0);
    const isBalancedDef = defTotal2 > 0 &&
      (defenderTroops.inf||0) / defTotal2 >= 0.10 &&
      (defenderTroops.cav||0) / defTotal2 >= 0.10 &&
      (defenderTroops.arc||0) / defTotal2 >= 0.10;
    const isNoArcDef = defTotal2 > 0 && (defenderTroops.arc||0) / defTotal2 < 0.05;
    const isNoCavDef = defTotal2 > 0 && (defenderTroops.cav||0) / defTotal2 < 0.05;

    // Set formation targets based on defender composition
    // During recalibration, disable balance bias — let engine explore freely
    let targetInf = 0.50, targetCav = 0.18, balWeight = 0.0;
    if (!isRecalibration) {
      if (isBalancedDef) {
        targetInf = 0.50; targetCav = 0.18; balWeight = 0.45;
      } else if (isNoArcDef) {
        const defInfPct = (defenderTroops.inf||0) / defTotal2;
        targetInf = 0.50 + (defInfPct - 0.50) * 0.25;
        targetInf = Math.max(0.48, Math.min(0.56, targetInf));
        targetCav = 0.03; balWeight = 0.55;
      } else if (isNoCavDef) {
        targetInf = 0.45; targetCav = 0.05; balWeight = 0.40;
      }
    }

    if (balWeight > 0) {
      for (const r of results) {
        const infDist = Math.abs(r.fi - targetInf);
        r.score = r.defenderInjured * (1 - 0.15 * infDist);
      }
    }

    results.sort((a, b) => {
      const aWin = a.winner === 'attacker' ? 1 : 0;
      const bWin = b.winner === 'attacker' ? 1 : 0;
      if (bWin !== aWin) return bWin - aWin;

      // Blended scoring for both winners and losers
      // Effectiveness: for winners = survival (fewer own losses), for losers = damage dealt
      const aEff = aWin ? (1 - a.attackerInjured / attackerTotal) : (a.defenderInjured / defTotal2);
      const bEff = bWin ? (1 - b.attackerInjured / attackerTotal) : (b.defenderInjured / defTotal2);
      // Formation balance
      const aInfDist = Math.abs(a.fi - targetInf);
      const bInfDist = Math.abs(b.fi - targetInf);
      const aCavDist = Math.abs(a.fc - targetCav);
      const bCavDist = Math.abs(b.fc - targetCav);
      const aBalance = 1 - aInfDist * 1.5 - aCavDist * 0.8;
      const bBalance = 1 - bInfDist * 1.5 - bCavDist * 0.8;
      // Blend
      const survW = balWeight > 0 ? (1 - balWeight) : 1.0;
      const aBlend = aEff * survW + aBalance * balWeight;
      const bBlend = bEff * survW + bBalance * balWeight;
      return bBlend - aBlend;
    });

    const top = results.slice(0, maxTop).map((r, i) => ({ ...r, rank: i + 1 }));

    return {
      best: top[0] || null,
      top10: top,
      totalTested: results.length,
      defenderTroops,
    };
  }

  // ─────────────────────────────────────────────────────────────────
  // PVP RECALIBRATION BRAIN
  // After each failed attack the user reports their own attacker losses
  // and how many defenders they killed.  The engine computes a new
  // search window size (shift) based on:
  //   • current loss rate        (own losses / attacker total)
  //   • delta from previous run  (improving → smaller shift / worsening → larger)
  //   • kill-rate momentum       (big jump → expand search; stagnant → contract)
  // The new window is centred on the current best formation ± shift.
  // Shift ranges: 1–50pp for infantry, half that for cavalry.
  // ─────────────────────────────────────────────────────────────────

  /**
   * Compute new scanPvP bounds after a failed attempt.
   * @param {{ fi, fc, fa }} currentBest  The best formation from last scan.
   * @param {number} attLosses  Own troops injured in the real battle.
   * @param {number} attTotal   Own total troops sent.
   * @param {number} defKilled  Defender troops injured in the real battle.
   * @param {number} defTotal   Total defender troops.
   * @param {Array}  history    Previous attempts [{attLosses, attTotal, defKilled, defTotal}].
   * @returns {{ shift, infMin, infMax, cavMin, cavMax, arcMin, verdict, direction, summary }}
   */
  function pvpRecalibrate(currentBest, attLosses, attTotal, defKilled, defTotal, history) {
    const killRate = defKilled / Math.max(1, defTotal);

    // Compare with previous attempt's kill rate
    const prev = history.length > 0 ? history[history.length - 1] : null;
    const prevKillVal = prev ? (prev.defKilled || prev.defKill || 0) : 0;
    const prevDefTotal = prev ? (prev.defTotal || defTotal) : defTotal;
    const prevKill = prev ? prevKillVal / Math.max(1, prevDefTotal) : killRate;
    const killDelta = killRate - prevKill;
    const improving = killDelta > 0.005; // more defender injured = improving
    const worsening = killDelta < -0.005;

    // ── Shift size based on how far from winning ──────────────────
    let shift;
    if (killRate < 0.50) {
      // Very far from winning — large shifts needed
      shift = 0.10;
    } else if (killRate < 0.75) {
      // Getting closer — moderate shifts
      shift = improving ? 0.05 : 0.08;
    } else if (killRate < 0.90) {
      // Close — smaller shifts
      shift = improving ? 0.03 : 0.05;
    } else {
      // Almost won (>90%) — fine-tuning
      shift = improving ? 0.02 : 0.04;
    }

    shift = Math.min(0.50, Math.max(0.01, parseFloat(shift.toFixed(3))));

    // ── Directional center shift based on defender injured ─────────
    let fi = currentBest.fi;
    let fc = currentBest.fc;

    if (killRate >= 0.90) {
      // Almost won — keep infantry stable, tiny cav→arc shift for more DPS
      fc = Math.max(0.02, fc - 0.01);
      // Don't touch fi — infantry level is working
      shift = Math.min(shift, 0.03); // tight search
    } else if (killRate >= 0.75 && improving) {
      // Getting closer — keep infantry, small cav→arc shift
      fc = Math.max(0.02, fc - 0.01);
      shift = Math.min(shift, 0.04);
    } else if (killRate >= 0.75 && worsening) {
      // Was close but worsened — troops need to survive longer
      // Add tiny infantry, reduce archers slightly (not cavalry)
      fi = Math.min(0.55, fi + 0.01);
      shift = Math.min(shift, 0.04);
    } else if (killRate >= 0.50 && worsening) {
      // Moderate and worsening — need more tank
      fi = Math.min(0.55, fi + 0.02);
      fc = Math.max(0.02, fc - 0.01);
    } else if (killRate >= 0.50 && !improving) {
      // Moderate stagnant — slight infantry increase
      fi = Math.min(0.55, fi + 0.01);
    } else if (killRate < 0.50) {
      // Far from winning — bigger shift toward more tank
      fi = Math.min(0.58, fi + 0.03);
      fc = Math.max(0.02, fc - 0.01);
    }

    // Hard floor: infantry never below 49% in recalibration
    fi = Math.max(0.49, fi);

    const infMin = parseFloat(Math.max(0.49, fi - shift).toFixed(3));
    const infMax = parseFloat(Math.min(0.60, fi + shift).toFixed(3));
    const cavMin = parseFloat(Math.max(0.02, fc - shift / 2).toFixed(3));
    const cavMax = parseFloat(Math.min(0.30, fc + shift / 2).toFixed(3));
    const arcMin = parseFloat(Math.max(0.10, 1 - infMax - cavMax).toFixed(3));

    const verdict = killRate > 0.90 ? 'almost won' : killRate > 0.75 ? 'close' : killRate > 0.50 ? 'moderate' : 'far';
    const direction = improving ? 'improving' : worsening ? 'worsening' : 'stable';

    return {
      shift, infMin, infMax, cavMin, cavMax, arcMin,
      verdict, direction, lossRate: 1.0, killRate,
      summary: `Injured ${(killRate*100).toFixed(1)}% — ${verdict}, ${direction}`
    };
  }

  window.KingSim = window.KingSim || {};
  window.KingSim.pvpOptimizer = { scanPvP, pvpRecalibrate };
})();
