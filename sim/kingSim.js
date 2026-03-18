
(function(){
  'use strict';

  const battleCore = window.KingSim._battle;
  const optimizer  = window.KingSim._optimizer;

  // Convenience: run a single battle
  async function runBattle(config){
    const trialMod = window.KingSim._trials.getTrial(config.trial);
    return battleCore.runBattle(config, trialMod);
  }

  // Convenience: run a Mystic Trial scan (grid)
  async function scanMysticTrial(input){
    return optimizer.scanGrid({ runBattle }, input);
  }

  // Helper: build base blocks from current page inputs (reads existing fields)
  function readSharedInputsAsBase(troopTotal = 100000, tier='T10'){
    const g = id => Number.parseFloat(document.getElementById(id)?.value || '0') || 0;
    const stats = {
      attack: { inf:g('inf_atk'), cav:g('cav_atk'), arc:g('arc_atk') },
      defense:{ inf:100, cav:100, arc:100 },      // default 100
      lethality:{ inf:g('inf_let'), cav:g('cav_let'), arc:g('arc_let') },
      health:{ inf:100, cav:100, arc:100 }        // default 100
    };
    return { totalTroops: troopTotal, tier, stats };
  }

  window.KingSim = window.KingSim || {};
  window.KingSim.runBattle = runBattle;
  window.KingSim.scanMysticTrial = scanMysticTrial;
  window.KingSim.readSharedInputsAsBase = readSharedInputsAsBase;
})();