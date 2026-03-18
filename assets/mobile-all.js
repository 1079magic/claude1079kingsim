// assets/mobile-all.js — small-screen helpers (tables, nav height, dynamic content)
(() => {
  'use strict';
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Set --navH based on actual nav height (for sticky table headers)
  function setNavHeightVar(){
    const nav = document.querySelector('.nav');
    if (!nav) return;
    const h = nav.getBoundingClientRect().height || 56;
    document.documentElement.style.setProperty('--navH', `${Math.round(h)}px`);
  }

  // Wrap wide tables in a horizontal scroller (idempotent)
  function wrapTables(root = document){
    const tables = root.querySelectorAll('table');
    tables.forEach(t => {
      if (t.closest('.table-scroll')) return;
      const wrap = document.createElement('div');
      wrap.className = 'table-scroll';
      t.parentNode.insertBefore(wrap, t);
      wrap.appendChild(t);
    });
  }

  // On load
  document.addEventListener('DOMContentLoaded', () => {
    setNavHeightVar();
    wrapTables();

    // Watch for dynamic content from engines (Magic/Option‑A/Mystic)
    const mo = new MutationObserver(muts => {
      muts.forEach(m => {
        m.addedNodes.forEach(node => {
          if (!(node instanceof HTMLElement)) return;
          if (node.tagName === 'TABLE' || node.querySelector?.('table')) wrapTables(node);
        });
      });
    });
    mo.observe(document.body, { childList: true, subtree: true });

    // Recompute nav height on resize or font size changes
    let raf;
    window.addEventListener('resize', () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(setNavHeightVar);
    }, { passive:true });
  });

  // Optional: light parallax on aurora—kept soft for mobile
  if (!reduce){
    const aurora = document.querySelector('.site-bg .fx-aurora');
    if (aurora){
      let raf;
      window.addEventListener('mousemove', e=>{
        const x = (e.clientX / innerWidth  - 0.5);
        const y = (e.clientY / innerHeight - 0.5);
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(()=>{ aurora.style.transform = `translate(${x*8}px, ${y*6}px)`; });
      }, { passive:true });
    }
  }
})();