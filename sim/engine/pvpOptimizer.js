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

    const {
      attackerTotal   = 150000,
      attackerStats   = {},
      attackerTier    = 'T10',
      defenderTroops,
      defenderStats   = {},
      defenderTier    = 'T10',
      sparsity  = 0.01,
      infMin = 0.40, infMax = 0.80,
      cavMin = 0.15, cavMax = 0.22,
      arcMin = 0.15,   // always ≥15% archers — archers are DPS, must be present
      maxTop = 10,
    } = opts;

    if (!defenderTroops) throw new Error('defenderTroops required for PvP scan');

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

  window.KingSim = window.KingSim || {};
  window.KingSim.pvpOptimizer = { scanPvP };
})();
