
(function(){
  'use strict';

  // Explanation:
  // - baseTriangle: neutral multiplier baseline (normally 1.0)
  // - advTriangle: advantage multiplier for winning edge in triangle
  // - vs: fine-grained per (attacker -> defender) multipliers
  // - variance: randomness amplitude in [0..1]
  // - globalMul: overall scaling (does not change ratio ranking, only speed of kills)

  const TRIALS = {
    "Crystal Cave": {
      baseTriangle: 1.00,
      advTriangle: 1.12,
      variance: 0.06,
      globalMul: 1.00,
      // Slight bias toward Archers vs Cav, and Inf vs Arc (emphasize triangle),
      // but keep cavalry modest so 52/15/33 tends to be best.
      vs: {
        inf: { inf:1.00, cav:1.00, arc:1.08 },
        cav: { inf:1.05, cav:1.00, arc:0.98 },
        arc: { inf:0.98, cav:1.10, arc:1.00 }
      },
      note: "CC modifiers tuned for ~52/15/33 ≈ 80%."
    },
    "Forest of Life": {
      baseTriangle: 1.02,
      advTriangle: 1.14,
      variance: 0.05,
      globalMul: 1.02,
      // Favors infantry survivability + archers output; cavalry reduced.
      vs: {
        inf: { inf:1.02, cav:1.00, arc:1.12 },
        cav: { inf:1.02, cav:1.00, arc:0.96 },
        arc: { inf:0.98, cav:1.08, arc:1.00 }
      },
      note: "FoL modifiers tuned for ~46/21/33 ≈ 100%."
    },
    "Knowledge Nexus": {
      baseTriangle: 1.00,
      advTriangle: 1.13,
      variance: 0.06,
      globalMul: 1.00,
      // Reduce cav efficiency, archers strong → ~46/15/39 or 40/21/39 families.
      vs: {
        inf: { inf:1.00, cav:1.00, arc:1.08 },
        cav: { inf:0.98, cav:1.00, arc:0.96 },
        arc: { inf:1.00, cav:1.10, arc:1.00 }
      },
      note: "KN tuned for ~46/15/39 ≈ 90%."
    },
    "Molten Fort": {
      baseTriangle: 1.00,
      advTriangle: 1.13,
      variance: 0.06,
      globalMul: 1.00,
      vs: {
        inf: { inf:1.00, cav:1.00, arc:1.08 },
        cav: { inf:0.98, cav:1.00, arc:0.96 },
        arc: { inf:1.00, cav:1.10, arc:1.00 }
      },
      note: "MF tuned for ~46/15/39 ≈ 90%."
    }
  };

  function getTrial(name){
    return TRIALS[name] || TRIALS["Crystal Cave"];
  }

  window.KingSim = window.KingSim || {};
  window.KingSim._trials = { getTrial };
})();
