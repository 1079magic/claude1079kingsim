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
// ===== v2: Scroll-reveal for panels =====
(() => {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  document.addEventListener('DOMContentLoaded', () => {
    // Scroll-reveal
    const revealItems = document.querySelectorAll('.panel, .feature.card, .beat, .hero-card');
    if (!revealItems.length) return;

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('in-view');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.08 });

    revealItems.forEach((el, i) => {
      el.classList.add('fx-reveal-item');
      el.style.transitionDelay = Math.min(i * 40, 300) + 'ms';
      observer.observe(el);
    });

    // Sticky Run CTA for simulator pages on mobile
    const runBtn = document.querySelector('.btn-run, #mt_run, #pvp_run_btn, #btnMagic12, #btnRecompute');
    if (runBtn && window.innerWidth < 640) {
      const stickyBar = document.createElement('div');
      stickyBar.id = 'sticky-run-bar';
      stickyBar.style.cssText = 'position:fixed;bottom:0;left:0;right:0;padding:10px 16px;' +
        'background:rgba(11,15,26,.95);border-top:1px solid #223148;z-index:500;' +
        'display:none;backdrop-filter:blur(8px);';

      const stickyBtn = document.createElement('button');
      stickyBtn.textContent = runBtn.textContent || 'Run Simulation';
      stickyBtn.style.cssText = 'width:100%;min-height:44px;border-radius:10px;border:0;' +
        'background:linear-gradient(90deg,#22d3ee,#60a5fa);color:#05121f;' +
        'font-family:Rajdhani,sans-serif;font-weight:700;font-size:1rem;cursor:pointer;';
      stickyBtn.addEventListener('click', () => runBtn.click());
      stickyBar.appendChild(stickyBtn);
      document.body.appendChild(stickyBar);

      const btnObserver = new IntersectionObserver((entries) => {
        const visible = entries[0].isIntersecting;
        stickyBar.style.display = visible ? 'none' : 'block';
      }, { threshold: 0.5 });
      btnObserver.observe(runBtn);
    }
  });
})();

// ===== v2: Page transition on internal links =====
(() => {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href]');
    if (!a) return;
    const href = a.getAttribute('href');
    if (!href || href.startsWith('#') || href.startsWith('http') ||
        href.startsWith('mailto') || a.target === '_blank') return;
    e.preventDefault();
    document.body.classList.add('page-exit');
    setTimeout(() => { window.location.href = href; }, 150);
  });
})();
