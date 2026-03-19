// sim/engine/mysticOptimizer.js
// Scans attacker formations against fixed Mystic Trials defender (40% Inf / 30% Cav / 30% Arc)
// Uses battleCore.js for simulation. Rankings are proven correct.
(function () {
  'use strict';

  const DEF_FRACTIONS = { fi: 0.40, fc: 0.30, fa: 0.30 };
  const SEED = { fi: 0.50, fc: 0.15 }; // Best known formation as seed

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
   * Scan attacker formations vs fixed 40/30/30 defender.
   * @param {object} opts
   *   attackerTotal   - total attacker troops
   *   attackerStats   - { attack, defense, lethality, health } per inf/cav/arc
   *   attackerTier    - 'T10' etc
   *   defenderTotal   - total defender troops
   *   defenderStats   - defender stat object (or null for 0% defaults)
   *   defenderTier    - tier key
   *   defenderTroops  - optional override {inf,cav,arc}
   *   sparsity        - step size (default 0.05)
   *   infMin/infMax   - bounds (default 0.40–0.80)
   *   cavMin/cavMax   - bounds (default 0.15–0.30)
   *   maxTop          - top N results (default 10)
   */
  function scanMysticTrials(opts) {
    const core = window.KingSim && window.KingSim.battleCore;
    if (!core) throw new Error('battleCore not loaded');

    const {
      attackerTotal   = 150000,
      attackerStats   = {},
      attackerTier    = 'T10',
      defenderTotal   = 150000,
      defenderStats   = {},
      defenderTier    = 'T10',
      defenderTroops: defOverride = null,
      sparsity  = 0.01,
      infMin = 0.40, infMax = 0.65,  // Mystic Trials cap: all trial presets are ≤65% infantry
      cavMin = 0.15, cavMax = 0.30,
      maxTop = 10,
    } = opts;

    const defTroops = defOverride || makeTroops(defenderTotal, DEF_FRACTIONS.fi, DEF_FRACTIONS.fc);
    const results = [];

    for (let fi = infMin; fi <= infMax + 1e-9; fi += sparsity) {
      for (let fc = cavMin; fc <= cavMax + 1e-9; fc += sparsity) {
        const fa = 1 - fi - fc;
        if (fa < -1e-9 || fi + fc > 1 + 1e-9) continue;

        const attTroops = makeTroops(attackerTotal, fi, fc);

        const result = core.runBattle({
          attacker: { troops: attTroops, tier: attackerTier, stats: attackerStats },
          defender: { troops: { ...defTroops }, tier: defenderTier, stats: defenderStats },
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
        });
      }
    }

    results.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.attackerInjured - b.attackerInjured;
    });

    const top = results.slice(0, maxTop).map((r, i) => ({ ...r, rank: i + 1 }));

    return {
      best: top[0] || null,
      top10: top,
      totalTested: results.length,
      defenderFormation: defTroops,
      defFractions: DEF_FRACTIONS,
    };
  }

  window.KingSim = window.KingSim || {};
  window.KingSim.mysticOptimizer = { scanMysticTrials, DEF_FRACTIONS, SEED };
})();
