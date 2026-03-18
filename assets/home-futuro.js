// assets/home-futuro.js
(() => {
  'use strict';

  const prefersReduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------------------------------------------------------
     Reveal on scroll
  --------------------------------------------------------- */
  (function revealOnScroll(){
    const els = document.querySelectorAll('.fx-reveal');
    if (!('IntersectionObserver' in window)){
      els.forEach(el => el.classList.add('is-visible'));
      return;
    }
    const io = new IntersectionObserver((entries)=>{
      entries.forEach(e=>{
        if (e.isIntersecting){
          e.target.classList.add('is-visible');
          io.unobserve(e.target);
        }
      });
    }, { rootMargin:'0px 0px -10% 0px', threshold:0.15 });

    els.forEach(el => io.observe(el));
  })();

  /* ---------------------------------------------------------
     Scroll progress bar
  --------------------------------------------------------- */
  (function scrollProgress(){
    const bar = document.querySelector('.scroll-progress span');
    if (!bar) return;

    function set(){
      const h = document.documentElement;
      const max = h.scrollHeight - h.clientHeight;
      const p = max > 0 ? (h.scrollTop || document.body.scrollTop) / max : 0;
      bar.style.width = (p * 100).toFixed(2) + '%';
    }
    set();
    window.addEventListener('scroll', set, { passive:true });
  })();

  /* ---------------------------------------------------------
     Parallax Aurora — Desktop Only (DISABLED ON MOBILE)
     Fixes mobile background "jump" and "zoom"
  --------------------------------------------------------- */
  (function parallaxAurora(){
    // ✨ Disable entirely on mobile
    if (window.innerWidth < 820) return;
    if (prefersReduce) return;

    const aurora = document.querySelector('.fx-aurora');
    if (!aurora) return;

    let raf;
    window.addEventListener('mousemove', e=>{
      const x = (e.clientX / innerWidth - 0.5);
      const y = (e.clientY / innerHeight - 0.5);
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(()=>{
        aurora.style.transform = `translate(${x*12}px, ${y*8}px)`;
      });
    }, { passive:true });
  })();

  /* ---------------------------------------------------------
     Count-up metrics
  --------------------------------------------------------- */
  (function countUp(){
    const counters = document.querySelectorAll('.stat-value');
    if (!counters.length) return;

    const ease = t => 1 - Math.pow(1 - t, 4);

    function run(el){
      const to = +el.getAttribute('data-count-to') || 0;
      const suffix = el.getAttribute('data-suffix') || '';
      let start = null;
      const dur = 1200;
      function step(ts){
        if (!start) start = ts;
        const p = Math.min(1, (ts - start)/dur);
        const v = Math.floor(ease(p) * to);
        el.textContent = v.toLocaleString() + suffix;
        if (p < 1) requestAnimationFrame(step);
      }
      requestAnimationFrame(step);
    }

    const hero = document.getElementById('hero');
    if ('IntersectionObserver' in window && hero){
      const io = new IntersectionObserver(e=>{
        if (e[0].isIntersecting){
          counters.forEach(run);
          io.disconnect();
        }
      }, { threshold:.35 });
      io.observe(hero);
    } else {
      counters.forEach(run);
    }
  })();

  /* ---------------------------------------------------------
     Click ripple
  --------------------------------------------------------- */
  (function ripple(){
    const targets = document.querySelectorAll(
      '.nav-links a, .btn-primary, .btn-secondary, .btn-outline, .btn-pill, .slab-carousel .tab, .feature.card'
    );

    targets.forEach(el=>{
      el.addEventListener('click', e=>{
        const r = el.getBoundingClientRect();
        const d = Math.max(r.width, r.height);
        const span = document.createElement('span');
        span.className = 'ripple';
        span.style.width = span.style.height = d+'px';
        span.style.left = (e.clientX - r.left - d/2) + 'px';
        span.style.top = (e.clientY - r.top - d/2) + 'px';
        el.appendChild(span);
        setTimeout(()=> span.remove(), 650);
      }, { passive:true });
    });
  })();

  /* ---------------------------------------------------------
     Slab carousel switching
  --------------------------------------------------------- */
  (function slabCarousel(){
    const wrap = document.querySelector('.slab-content');
    if (!wrap) return;

    const tabs = wrap.querySelectorAll('.slab-carousel .tab');
    const panels = wrap.querySelectorAll('.slab-panels .panel');

    function select(tab){
      tabs.forEach(t=>{
        const active = (t===tab);
        t.classList.toggle('is-active', active);
        t.setAttribute('aria-selected', active ? 'true' : 'false');
      });
      const id = tab.getAttribute('data-target');
      panels.forEach(p=> p.classList.toggle('is-visible', '#'+p.id === id));
    }

    tabs.forEach(t => t.addEventListener('click', ()=> select(t)));

    // Hover/focus on feature cards updates the slab
    document.querySelectorAll('.feature.card').forEach(card=>{
      const target = card.getAttribute('data-target');
      const tab = [...tabs].find(t => t.getAttribute('data-target')===target);
      if (!tab) return;
      card.addEventListener('mouseenter', ()=> select(tab));
      card.addEventListener('focus', ()=> select(tab));
    });
  })();

  /* ---------------------------------------------------------
     Smooth scroll (scroll cue)
  --------------------------------------------------------- */
  (function smoothCue(){
    const cue = document.querySelector('.hero-scroll-cue .cue');
    if (!cue) return;
    cue.addEventListener('click', e=>{
      const href = cue.getAttribute('href');
      const el = document.querySelector(href);
      if (!el) return;
      e.preventDefault();
      el.scrollIntoView({ behavior:'smooth', block:'start' });
    });
  })();
})();

/* ---------------------------------------------------------
   Quick actions row
--------------------------------------------------------- */
(() => {
  const row = document.getElementById('homeQuick');
  if (!row) return;

  row.addEventListener('click', (e)=>{
    const btn = e.target.closest('.chip');
    if (!btn) return;

    if (btn.dataset.href) {
      location.href = btn.dataset.href;
    }
    if (btn.dataset.action === 'open-menu') {
      document.querySelector('.nav-toggle')?.click();
    }
  });
})();

/* ---------------------------------------------------------
   Colorize "Open" links & upgrade top buttons
--------------------------------------------------------- */
(() => {
  // Header "Add Troops"
  const header = document.querySelector('.nav .nav-inner');
  if (header){
    const addTroops = [...header.querySelectorAll('a,button')]
      .find(a => /add troops/i.test(a.textContent));

    if (addTroops){
      addTroops.classList.add('btn-primary--compact');
      if (addTroops.tagName !== 'A'){
        const a = document.createElement('a');
        a.href = 'troops.html';
        a.className = addTroops.className;
        a.textContent = addTroops.textContent;
        addTroops.replaceWith(a);
      } 
      else if (!addTroops.getAttribute('href')){
        addTroops.setAttribute('href','troops.html');
      }
    }
  }

  // “Open →” links inside cards/panels
  const featureOpens = document.querySelectorAll('.feature.card a, .panel.panel-glass a');
  featureOpens.forEach(a => {
    if (/^open\b/i.test(a.textContent.trim())) {
      a.classList.add('btn-primary--compact');
      a.style.display = 'inline-block';
      a.style.marginTop = '8px';
    }
  });
})();

/* ---------------------------------------------------------
   Sticky Scroll/Up hint
--------------------------------------------------------- */
(() => {
  let hint = document.querySelector('.scroll-hint');

  if (!hint){
    hint = document.createElement('div');
    hint.className = 'scroll-hint';
    hint.innerHTML = `
      <div class="label">Scroll</div>
      <div class="arrows"><span class="arrow"></span><span class="arrow"></span></div>
    `;
    document.body.appendChild(hint);
  }

  const atTop = () => (window.scrollY || document.documentElement.scrollTop || 0) < 2;
  const maxY = () => document.documentElement.scrollHeight - document.documentElement.clientHeight;
  const nearBottom = () => (window.scrollY || document.documentElement.scrollTop || 0) > maxY() - 160;

  const updateState = () => {
    if (nearBottom()){
      hint.classList.add('is-up');
      hint.querySelector('.label').textContent = 'Scroll Up';
    } else {
      hint.classList.remove('is-up');
      hint.querySelector('.label').textContent = 'Scroll';
    }
  };

  hint.style.pointerEvents = 'auto';
  hint.style.cursor = 'pointer';

  hint.addEventListener('click', () => {
    if (hint.classList.contains('is-up')){
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      const step = Math.round(window.innerHeight * 0.85);
      const target = Math.min(maxY(), (window.scrollY || document.documentElement.scrollTop || 0) + step);
      window.scrollTo({ top: target, behavior: 'smooth' });
    }
  });

  let raf;
  const onScrollOrResize = () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(updateState);
  };

  window.addEventListener('scroll', onScrollOrResize, { passive:true });
  window.addEventListener('resize', onScrollOrResize, { passive:true });

  updateState();
})();

/* ---------------------------------------------------------
   Style adjustments for "Open" buttons & header CTAs
--------------------------------------------------------- */
(() => {
  document.querySelectorAll('.feature.card a, .panel.panel-glass a').forEach(a => {
    const txt = a.textContent.trim();
    if (/^open\b/i.test(txt)) {
      a.classList.add('btn-primary--compact');
      a.style.marginTop = '8px';
    }
  });

  const topButtons = document.querySelectorAll(
    '.quick-choices a, .slab-carousel .tab, .home-quick .chip, .engine-and-choices .quick-choices a'
  );
  topButtons.forEach(el => {
    const label = el.textContent.trim().toLowerCase();
    if (label === 'bear magic' || label === 'bear option‑a' || label === 'bear option-a' || label === 'mystic trials') {
      el.classList.add('btn-primary--compact');
      el.style.border = '0';
      el.style.backgroundClip = 'padding-box';
    }
  });
})();

/* ---------------------------------------------------------
   Remove legacy green scroll cue arrows
--------------------------------------------------------- */
(() => {
  document.querySelectorAll('.cue').forEach(el => el.remove());
})();