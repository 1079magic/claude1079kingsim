// assets/anim-all.js — site-wide entrance + table/input animations
(() => {
  'use strict';

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce) return;

  // 1) Page entrance
  document.body.classList.add('fx-preload');

  function markReady(){
    requestAnimationFrame(() => {
      // add entrance classes
      document.body.classList.remove('fx-preload');
      document.body.classList.add('fx-ready');

      // nav
      const nav = document.querySelector('.nav');
      if (nav) nav.classList.add('fx-enter');

      // panels
      const panels = [...document.querySelectorAll('.panel')];
      panels.forEach((p, i) => {
        p.classList.add('fx-enter');
        p.style.setProperty('--i', i);
        // optional shine only on main panels, not tiny nested ones
        if (i < 4) p.classList.add('fx-shine');
      });

      // inputs/selects
      const inputs = [...document.querySelectorAll('input, select, textarea')];
      inputs.forEach((el, i) => {
        el.classList.add('fx-enter');
        el.style.setProperty('--i', i);
      });

      // animate any existing tables
      animateTables(document);
    });
  }

  // 2) Table animation helper
  function animateTable(table){
    if (!table || table.classList.contains('fx-table')) return;
    table.classList.add('fx-table', 'fx-sheen');

    // rows stagger
    const rows = table.querySelectorAll('tbody tr');
    rows.forEach((tr, idx) => {
      tr.style.setProperty('--ri', idx);
      // kick in after one frame
      requestAnimationFrame(() => tr.classList.add('fx-row-in'));
    });

    // cleanup sheen class after animation
    setTimeout(() => table.classList.remove('fx-sheen'), 1600);
  }

  function animateTables(root){
    const tables = root.querySelectorAll ? root.querySelectorAll('table') : [];
    tables.forEach(animateTable);
  }

  // 3) Observe dynamic content (app1/app2/mystic render tables late)
  const mo = new MutationObserver((mutations) => {
    for (const m of mutations){
      m.addedNodes.forEach(node => {
        if (!(node instanceof HTMLElement)) return;

        // if a table itself is added
        if (node.tagName === 'TABLE') animateTable(node);

        // if tables are added inside a wrapper
        animateTables(node);

        // if inputs are added dynamically
        const newInputs = node.querySelectorAll ? node.querySelectorAll('input, select, textarea') : [];
        newInputs.forEach((el, i) => {
          el.classList.add('fx-enter');
          el.style.setProperty('--i', i);
        });
      });
    }
  });

  document.addEventListener('DOMContentLoaded', () => {
    markReady();
    mo.observe(document.body, { childList: true, subtree: true });
  });

})();

// Mark that user has seen the nav once (stops the pulse)
(() => {
  const btn = document.querySelector('.nav-toggle');
  if (!btn) return;
  const seen = localStorage.getItem('nav-seen');
  if (seen) document.body.classList.add('nav-seen');
  btn.addEventListener('click', () => {
    localStorage.setItem('nav-seen','1');
    document.body.classList.add('nav-seen');
  }, { once: true });
})();