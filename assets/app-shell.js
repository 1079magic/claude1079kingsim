// assets/app-shell.js
(function(){
  'use strict';
  // simple parallax on hero
  function parallax(){
    const c = document.querySelector('.hero-canvas');
    if(!c) return;
    const y = (window.scrollY || 0);
    c.style.transform = `translateY(${Math.min(y*0.15, 80)}px)`;
  }
  window.addEventListener('scroll', parallax, { passive:true });
})();