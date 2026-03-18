// assets/home.js
(() => {
  'use strict';

  // Reveal on scroll
  const revealEls = document.querySelectorAll('.fx-reveal');
  const io = 'IntersectionObserver' in window
    ? new IntersectionObserver(entries => {
        entries.forEach(e => {
          if (e.isIntersecting) {
            e.target.classList.add('is-visible');
            io.unobserve(e.target);
          }
        });
      }, { rootMargin: '0px 0px -10% 0px', threshold: 0.1 })
    : null;

  revealEls.forEach(el => {
    if (io) io.observe(el); else el.classList.add('is-visible');
  });

  // Lightweight tilt on hover for buttons/cards (no jank)
  const tiltNodes = document.querySelectorAll('[data-tilt="true"], .card');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function tilt(e) {
    if (reduceMotion) return;
    const rect = this.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top  + rect.height / 2;
    const dx = (e.clientX - cx) / rect.width;  // -0.5..0.5
    const dy = (e.clientY - cy) / rect.height;
    const rx = (+dy * 6).toFixed(2);
    const ry = (-dx * 6).toFixed(2);
    this.style.transform = `perspective(700px) rotateX(${rx}deg) rotateY(${ry}deg) translateZ(0)`;
  }
  function untilt() {
    this.style.transform = 'perspective(700px) rotateX(0) rotateY(0) translateZ(0)';
  }

  tiltNodes.forEach(n => {
    n.addEventListener('mousemove', tilt);
    n.addEventListener('mouseleave', untilt);
    n.addEventListener('blur', untilt);
  });

  
})();