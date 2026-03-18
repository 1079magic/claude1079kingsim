// assets/theme-all.js
(() => {
  'use strict';

  /* Put the injected .nav-toggle inside .nav-ctas so it sits next to "Add Troops" */
  (function normalizeHeaderCluster(){
    const inner = document.querySelector('.nav .nav-inner');
    if (!inner) return;

    // Wait a tick in case JS injects later in the same frame
    requestAnimationFrame(() => {
      const ctas = inner.querySelector('.nav-ctas');
      const toggle = inner.querySelector('.nav-toggle');
      if (ctas && toggle && toggle.parentElement !== ctas) {
        ctas.appendChild(toggle);  // move Menu into the cluster
      }
    });
  })();
  /* Keep Menu (.nav-toggle) next to "Add Troops" across all pages */
  (function normalizeHeaderCluster(){
    const inner = document.querySelector('.nav .nav-inner');
    if (!inner) return;

    function ensureCluster(){
      let ctas = inner.querySelector('.nav-ctas');
      if (!ctas){
        ctas = document.createElement('div');
        ctas.className = 'nav-ctas';
        inner.appendChild(ctas);
      }
      return ctas;
    }

    function place(){
      const ctas = ensureCluster();
      const toggle = inner.querySelector('.nav-toggle');
      if (toggle && toggle.parentElement !== ctas){
        ctas.appendChild(toggle);     // put Menu inside cluster
      }
      // push cluster to far right (last child in the line)
      if (inner.lastElementChild !== ctas){
        inner.appendChild(ctas);
      }
    }

    // Run now and whenever header mutates (e.g., script injects toggle later)
    const mo = new MutationObserver(() => requestAnimationFrame(place));
    mo.observe(inner, { childList: true, subtree: true });
    // first pass
    requestAnimationFrame(place);
  })();

  /* Keep Menu (.nav-toggle) and Add Troops inside one cluster at far-right */
  (function normalizeHeaderCluster(){
    function place(){
      const inner = document.querySelector('.nav .nav-inner');
      if (!inner) return;

      // Ensure there is a cluster container (some pages have it already)
      let ctas = inner.querySelector('.nav-ctas');
      if (!ctas){
        ctas = document.createElement('div');
        ctas.className = 'nav-ctas';
        inner.appendChild(ctas);
      }

      // Move the injected toggle into the cluster
      const toggle = inner.querySelector('.nav-toggle');
      if (toggle && toggle.parentElement !== ctas){
        ctas.appendChild(toggle);
      }

      // Make sure the cluster is the LAST item (rightmost) in the header line
      if (inner.lastElementChild !== ctas){
        inner.appendChild(ctas);
      }
    }

    // Run after injection and on resize (in case header reshuffles)
    const run = () => requestAnimationFrame(place);
    document.addEventListener('DOMContentLoaded', run);
    window.addEventListener('load', run, { once:true });
    window.addEventListener('resize', run, { passive:true });
  })();

  /* ---------- Global background layers (all pages) ---------- */
  (function injectSiteBackdrop(){
    if (document.querySelector('.site-bg')) return;   // already injected
    const wrap = document.createElement('div');
    wrap.className = 'site-bg';
    ['bg-image','fx-aurora','fx-grid','fx-vignette'].forEach(cls => {
      const s = document.createElement('span'); s.className = cls; wrap.appendChild(s);
    });
    document.body.insertBefore(wrap, document.body.firstChild);
  })();

  /* ---------- Center the active nav pill in the row if it can scroll ---------- */
  (function centerActiveNav(){
    const row = document.querySelector('.nav .nav-links');
    if (!row) return;

    const centerIt = () => {
      const active = row.querySelector('a.is-active');
      if (!active) return;
      // If row is scrollable, center the active link
      const scrollable = row.scrollWidth > row.clientWidth + 4;
      if (!scrollable) return;
      const aRect = active.getBoundingClientRect();
      const rRect = row.getBoundingClientRect();
      const delta = (aRect.left + aRect.width/2) - (rRect.left + rRect.width/2);
      row.scrollBy({ left: delta, behavior: 'smooth' });
    };

    // run on load and when resizing
    window.addEventListener('load', centerIt, { once:true });
    window.addEventListener('resize', () => requestAnimationFrame(centerIt), { passive:true });

    // also run after a brief delay to catch late font rendering
    setTimeout(centerIt, 150);
  })();

  /* ---------- Adaptive nav (toggle on the right) ---------- */
  (function installAdaptiveNav(){
    const navInner = document.querySelector('.nav .nav-inner');
    const menu = navInner?.querySelector('.nav-links');
    if (!navInner || !menu) return;

    if (!menu.id) menu.id = 'site-menu';
    if (navInner.querySelector('.nav-toggle')) return;

    const btn = document.createElement('button');
    btn.className = 'nav-toggle';
    btn.setAttribute('aria-controls', menu.id);
    btn.setAttribute('aria-expanded', 'false');
    btn.setAttribute('aria-label', 'Open navigation');
    btn.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" focusable="false" style="margin-right:6px">
        <path fill="currentColor" d="M3 6h18v2H3V6zm0 5h18v2H3v-2zm0 5h18v2H3v-2z"/>
      </svg>
      <span class="label">Menu</span>
    `;
    /* append at the end -> right side */
    navInner.appendChild(btn);

    const open  = () => { menu.classList.add('is-open'); btn.setAttribute('aria-expanded','true');  document.body.classList.add('nav-open'); };
    const close = () => { menu.classList.remove('is-open'); btn.setAttribute('aria-expanded','false'); document.body.classList.remove('nav-open'); };
    const toggle= () => (menu.classList.contains('is-open') ? close() : open());

    btn.addEventListener('click', toggle);
    document.addEventListener('click', (e)=>{ if(menu.classList.contains('is-open') && !menu.contains(e.target) && !btn.contains(e.target)) close(); });
    document.addEventListener('keydown', (e)=>{ if(e.key==='Escape' && menu.classList.contains('is-open')) close(); });

    const setNavH = () => {
      const h = document.querySelector('.nav')?.getBoundingClientRect().height || 56;
      document.documentElement.style.setProperty('--navH', `${Math.round(h)}px`);
    };
    setNavH();
    new ResizeObserver(setNavH).observe(document.querySelector('.nav'));
  })();

  // Active nav tab by URL
  const path = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
  const map = {
    '': 'home', 'index.html': 'home',
    'troops.html': 'troops', 'magic.html': 'magic', 'optiona.html': 'optiona',
    'mystic.html': 'mystic', 'pvp.html': 'pvp', 'cb.html': 'cb'
  };
  const active = map[path] || 'home';
  document.querySelectorAll('.nav .nav-links a').forEach(a => {
    const isHome = a.getAttribute('href').toLowerCase() === 'index.html' && active === 'home';
    if (a.dataset.tab === active || isHome) a.classList.add('is-active');
  });

  // Click ripple for anchors & buttons
  const targets = document.querySelectorAll('a, button, .btn, .btn-ok, .btn-primary, .btn-secondary, .btn-outline');
  targets.forEach(el => {
    el.addEventListener('click', e => {
      const r = el.getBoundingClientRect();
      const d = Math.max(r.width, r.height);
      const span = document.createElement('span');
      span.className = 'ripple';
      span.style.width = span.style.height = d + 'px';
      span.style.left = (e.clientX - r.left - d / 2) + 'px';
      span.style.top  = (e.clientY - r.top  - d / 2) + 'px';
      el.appendChild(span);
      setTimeout(() => span.remove(), 650);
    }, { passive: true });
  });

    /* FINAL: Keep .nav-toggle next to "Add Troops" (inside .nav-ctas) everywhere */
  (function normalizeHeaderCluster(){
    const inner = document.querySelector('.nav .nav-inner');
    if (!inner) return;

    function ensureCluster(){
      let ctas = inner.querySelector('.nav-ctas');
      if (!ctas){
        ctas = document.createElement('div');
        ctas.className = 'nav-ctas';
        inner.appendChild(ctas);
      }
      return ctas;
    }

    function place(){
      const ctas = ensureCluster();
      const toggle = inner.querySelector('.nav-toggle');
      if (toggle && toggle.parentElement !== ctas){
        ctas.appendChild(toggle);          // put Menu inside cluster
      }
      if (inner.lastElementChild !== ctas){
        inner.appendChild(ctas);           // keep cluster last -> docks right
      }
    }

    // Initial & reactive (covers Troops and all pages)
    const mo = new MutationObserver(() => requestAnimationFrame(place));
    mo.observe(inner, { childList: true, subtree: true });
    document.addEventListener('DOMContentLoaded', () => requestAnimationFrame(place));
    window.addEventListener('load', () => requestAnimationFrame(place), { once:true });
    window.addEventListener('resize', () => requestAnimationFrame(place), { passive:true });
  })();

  /* Make "Start" lead to Troops across the site */
(function wireStartToTroops(){
  const nav = document.querySelector('.nav .nav-inner');
  if (!nav) return;
  let start = [...nav.querySelectorAll('a,button,span')].find(el => el.textContent.trim() === 'Start');
  if (!start) return;
  if (start.tagName !== 'A') {
    const a = document.createElement('a');
    a.textContent = 'Start';
    a.className = start.className || '';
    start.replaceWith(a);
    start = a;
  }
  start.setAttribute('href', 'troops.html');
  start.setAttribute('role', 'link');
})();


// ===== [PATCH] Ensure Add Troops + Menu cluster on phones (Menu at right) =====
(function ensureCtasCluster(){
  const inner = document.querySelector('.nav .nav-inner');
  if (!inner) return;

  function ensureCtas(){
    let ctas = inner.querySelector('.nav-ctas');
    if (!ctas){
      ctas = document.createElement('div');
      ctas.className = 'nav-ctas';
      inner.appendChild(ctas);
    }
    if (inner.lastElementChild !== ctas) inner.appendChild(ctas);
    return ctas;
  }

  function getActiveTab() {
    const path = location.pathname
      .replace(/\/+$/, '')      // remove trailing slash
      .replace(/\.html$/, '')   // remove .html
      .toLowerCase();

    const last = path.split('/').pop();

    // Map slugs to tabs
    if (last === '' || last === 'index') return 'home';
    if (last === 'troops') return 'troops';
    if (last === 'heros' || last === 'heroes') return 'heroes';
    if (last === 'magic') return 'magic';
    if (last === 'optiona') return 'optiona';
    if (last === 'mystic') return 'mystic';
    if (last === 'pvp') return 'pvp';
    if (last === 'cb') return 'cb';

    return last; // fallback
  }

  function ensureAddTroops(ctas){
    let add = ctas.querySelector('a.btn-primary--compact');
    if (!add){
      add = document.createElement('a');
      add.className = 'btn-primary--compact';
      add.href = 'troops.html';
      add.textContent = 'Add Troops';
      ctas.prepend(add);                         // Add Troops first, Menu second
    }
    // Hide Add Troops only on Troops page
    add.style.display = (getActiveTab() === 'troops') ? 'none' : '';
  }

  function ensureMenuInside(ctas){
    const btn = inner.querySelector('.nav-toggle');
    if (btn && btn.parentElement !== ctas) ctas.appendChild(btn);
  }

  function place(){
    const ctas = ensureCtas();
    ensureAddTroops(ctas);
    ensureMenuInside(ctas);
    // Keep CTAs last → docked to the far right (CSS handles final alignment)
    if (inner.lastElementChild !== ctas) inner.appendChild(ctas);
  }

  // Initial & reactive (header can mutate)
  const mo = new MutationObserver(() => requestAnimationFrame(place));
  mo.observe(inner, { childList: true, subtree: true });

  document.addEventListener('DOMContentLoaded', () => requestAnimationFrame(place));
  window.addEventListener('load', () => requestAnimationFrame(place), { once:true });
  window.addEventListener('resize', () => requestAnimationFrame(place), { passive:true });
})();

(function markActiveNav(){
  // 1) Normalize current path (strip query/hash, trailing slash, and .html)
  const raw = location.pathname || '/';
  const path = raw
    .replace(/[?#].*$/, '')
    .replace(/\/index\.html$/i, '/')
    .replace(/\.html$/i, '')
    .replace(/\/+$/, '') || '/';

  // 2) Resolve to a slug we can match against data-tab/href
  //    We treat both "heroes" and the file name "heros" as the same page.
  const last = path.split('/').filter(Boolean).pop() || '';
  const slug =
    (!last || last.toLowerCase()==='index') ? 'home' :
    (last.toLowerCase()==='troops')        ? 'troops' :
    (last.toLowerCase()==='magic')         ? 'magic'  :
    (last.toLowerCase()==='optiona')       ? 'optiona':
    (['heroes','heros'].includes(last.toLowerCase())) ? 'heroes' :
    (last.toLowerCase()==='mystic')        ? 'mystic' :
    (last.toLowerCase()==='pvp')           ? 'pvp'    :
    (['cb','cb-turrets'].includes(last.toLowerCase()))            ? 'cb' :
    'home';

  // 3) Clear any previous state
  document.querySelectorAll('.nav .nav-links a.is-active')
    .forEach(a => a.classList.remove('is-active'));

  // 4) Prefer matching by data-tab="…"
  let active = document.querySelector(`.nav .nav-links a[data-tab="${slug}"]`);

  // 5) Fallback: match by href (supports clean URLs & .html & heros/heroes)
  if (!active) {
    const candidates = Array.from(document.querySelectorAll('.nav .nav-links a'));
    active = candidates.find(a => {
      const href = (a.getAttribute('href') || '').replace(/[?#].*$/, '');
      const norm = href
        .replace(/\/index\.html$/i, '/')
        .replace(/\.html$/i, '')
        .replace(/\/+$/, '')
        .toLowerCase();

      // last segment of the link
      const hLast = norm.split('/').filter(Boolean).pop() || '';
      if (slug === 'home') return norm === '' || norm === '/' || hLast === 'index';
      if (slug === 'heroes') return ['heroes','heros'].includes(hLast);
      if (slug === 'cb')     return ['cb','cb-turrets'].includes(hLast);
      return hLast === slug;
    });
  }

  if (active) active.classList.add('is-active');
})();

})();