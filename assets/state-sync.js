// assets/state-sync.js
(function(){
  'use strict';
  const KEY = 'kingSim_shared_inputs_v1';
  const FIELDS = ['inf_atk','inf_let','cav_atk','cav_let','arc_atk','arc_let','troopTier','stockInf','stockCav','stockArc','rallySize','marchSize','numFormations'];

  function save(){
    const data={}; FIELDS.forEach(id=>{ const el=document.getElementById(id); if(el) data[id]=el.value; });
    localStorage.setItem(KEY, JSON.stringify(data));
  }
  function load(){
    let data={}; try{ data=JSON.parse(localStorage.getItem(KEY)||'{}'); }catch{}
    FIELDS.forEach(id=>{ const el=document.getElementById(id); if(el && data[id]!=null){ el.value=data[id]; } });
  }
  function attach(){
    FIELDS.forEach(id=>{
      const el=document.getElementById(id); if(!el) return;
      el.addEventListener('input', save); el.addEventListener('change', save);
    });
  }

  // expose helpers for other pages
  window.KingState = { load, save };

  if (document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded', ()=>{ load(); attach(); });
  } else { load(); attach(); }
})();