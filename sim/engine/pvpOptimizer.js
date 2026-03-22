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
      infMin = 0.40, infMax = 0.80,
      cavMin = 0.15, cavMax = 0.22,
      arcMin = 0.15,
      maxTop = 10,
      isRecalibration = false,
    } = opts;

    if (!defenderTroops) throw new Error('defenderTroops required for PvP scan');

    // Adapt bounds based on defender composition — only on initial scan, not recalibration
    if (!isRecalibration) {
      const defTotal = (defenderTroops.inf||0) + (defenderTroops.cav||0) + (defenderTroops.arc||0);
      if (defTotal > 0) {
        const defArcPct = (defenderTroops.arc||0) / defTotal;
        const defInfPct = (defenderTroops.inf||0) / defTotal;
        const defCavPct = (defenderTroops.cav||0) / defTotal;

        // No/very few archers → defense-heavy build
        // Counter: keep solid infantry tank, boost archers for DPS, minimize cavalry
        // Target range: ~50-55% inf, 2-8% cav, 40-48% arc
        if (defArcPct < 0.05) {
          infMin = 0.40; infMax = 0.60;
          cavMin = 0.02; cavMax = 0.10;
          arcMin = 0.35;

          // Fine-tune based on defender's infantry ratio
          // More defender infantry → slightly more attacker infantry to absorb
          if (defInfPct > 0.60) {
            infMin = 0.45; infMax = 0.60;
            cavMin = 0.02; cavMax = 0.08;
            arcMin = 0.35;
          }
        } else if (defArcPct < 0.15) {
          // Few archers: moderate DPS boost
          infMin = 0.40; infMax = 0.65;
          cavMin = 0.05; cavMax = 0.15;
          arcMin = 0.25;
        }

        // No cavalry → archers undefended, boost cav to kill archers
        if (defCavPct < 0.05 && defArcPct > 0.30) {
          cavMin = 0.10; cavMax = 0.30;
        }

        // No infantry → lighter tank needed, more DPS
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
    results.sort((a, b) => {
      const aWin = a.winner === 'attacker' ? 1 : 0;
      const bWin = b.winner === 'attacker' ? 1 : 0;
      if (bWin !== aWin) return bWin - aWin;                          // winners first
      if (aWin === 1) {
        // Both win: prefer more attacker survivors (attackerTotal - attackerInjured)
        const aLeft = (a.score - a.defenderInjured) + a.defenderInjured; // trick: use attacker context
        return b.attackerInjured - a.attackerInjured;                  // fewer own losses
      }
      return b.score - a.score;                                        // both lose: more def damage
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
    const lossRate = attLosses / Math.max(1, attTotal);
    const killRate = defKilled / Math.max(1, defTotal);

    const prev        = history.length > 0 ? history[history.length - 1] : null;
    const prevLoss    = prev ? prev.attLosses / Math.max(1, prev.attTotal) : lossRate;
    const prevKill    = prev ? prev.defKilled / Math.max(1, prev.defTotal) : 0;
    const killDelta   = killRate - prevKill;
    const lossImprove = lossRate < prevLoss;

    // ── Base shift by loss severity ───────────────────────────────
    let shift;
    if (lossRate > 0.60) {
      shift = lossImprove ? 0.07 : 0.15;
    } else if (lossRate > 0.30) {
      shift = lossImprove ? 0.04 : 0.08;
    } else {
      shift = lossImprove ? 0.01 : 0.03;
    }

    // Kill-rate amplifiers
    if (killDelta > 0.50) shift = Math.min(0.50, shift * 2.0);
    else if (killDelta > 0.30) shift = Math.min(0.50, shift * 1.5);
    if (Math.abs(killDelta) < 0.05 && lossRate < 0.50) shift = Math.max(0.01, shift * 0.5);

    shift = Math.min(0.50, Math.max(0.01, parseFloat(shift.toFixed(3))));

    // ── Direction-aware bounds ─────────────────────────────────────
    // When worsening (kill rate dropped or losses increased), don't center
    // on current best — shift AWAY from it toward more balanced formations.
    // This prevents getting stuck exploring around a bad formation.
    let fi = currentBest.fi;
    let fc = currentBest.fc;

    const isWorsening = !lossImprove || killDelta < -0.10;

    if (isWorsening && lossRate > 0.50) {
      // Heavy losses AND worsening: pull toward a more balanced center
      // Move infantry toward 50%, boost archers
      const pullTarget = 0.50; // target inf fraction
      fi = fi + (pullTarget - fi) * 0.4; // blend 40% toward target
      fc = Math.max(0.05, fc * 0.8);     // reduce cav slightly
    }

    if (isWorsening && killDelta < -0.20) {
      // Kill rate dropped sharply — reverse direction more aggressively
      fi = fi + (0.45 - fi) * 0.5;
      fc = Math.max(0.05, Math.min(0.15, fc));
      shift = Math.max(shift, 0.20); // widen search
    }

    const infMin = parseFloat(Math.max(0.15, fi - shift).toFixed(3));
    const infMax = parseFloat(Math.min(0.85, fi + shift).toFixed(3));
    const cavMin = parseFloat(Math.max(0.03, fc - shift / 2).toFixed(3));
    const cavMax = parseFloat(Math.min(0.50, fc + shift / 2).toFixed(3));
    const arcMin = parseFloat(Math.max(0.10, 1 - infMax - cavMax).toFixed(3));

    const verdict   = lossRate > 0.50 ? 'heavy' : lossRate > 0.20 ? 'moderate' : 'light';
    const direction = lossImprove ? 'improving' : 'worsening';

    return {
      shift, infMin, infMax, cavMin, cavMax, arcMin,
      verdict, direction, lossRate, killRate,
      summary: `±${(shift*100).toFixed(0)}pp — ${verdict} losses (${(lossRate*100).toFixed(0)}%), ${direction}`
    };
  }

  window.KingSim = window.KingSim || {};
  window.KingSim.pvpOptimizer = { scanPvP, pvpRecalibrate };
})();
