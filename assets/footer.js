// assets/footer.js — auto-insert footer + Patreon banner on all pages
document.addEventListener("DOMContentLoaded", () => {
  const html = `
    <!-- Subtle Patreon strip (non-home pages) -->
    <div style="background:rgba(255,100,40,.07);border-top:1px solid rgba(255,100,40,.12);padding:10px 20px;text-align:center;font-size:.82rem;display:flex;align-items:center;justify-content:center;gap:12px;flex-wrap:wrap;">
      <span style="color:#d4a080">❤️ <strong style="color:#ff7a50">Support 1079KingSim</strong> — free forever, built with love</span>
      <a href="https://www.patreon.com/15651923/join" target="_blank" rel="noopener noreferrer"
         style="display:inline-flex;align-items:center;gap:5px;background:linear-gradient(90deg,#ff6428,#e53e00);color:#fff;font-weight:700;font-size:.78rem;padding:5px 14px;border-radius:8px;text-decoration:none;white-space:nowrap;min-height:32px">
        Patreon ↗
      </a>
    </div>

    <!-- Special Thanks card -->
    <div style="background:rgba(15,19,32,.8);border-top:1px solid rgba(35,54,77,.5);padding:18px 20px;text-align:center">
      <p style="margin:0 0 6px;font-size:.75rem;font-weight:700;color:#7dd3fc;text-transform:uppercase;letter-spacing:.07em">Special Thanks</p>
      <p style="margin:0;font-size:.82rem;color:#7a8ba4;line-height:1.6">
        BladeXtreme · Deydorian · LoL alliance members<br>
        and every supporter from Kingdom #1079 that gave its love 🙏
      </p>
    </div>

    <!-- Footer -->
    <footer style="background:#0d1018;color:#4a5568;padding:14px 20px;text-align:center;font-size:.75rem;border-top:1px solid #1a2030">
      <span>© 2026 1079KingSim — fan-made tool, not affiliated with KingShot developers.</span>
      &nbsp;·&nbsp;
      <a href="disclaimer.html" style="color:#3b6ea6">Disclaimer</a>
      &nbsp;·&nbsp;
      <a href="privacy.html" style="color:#3b6ea6">Privacy</a>
    </footer>
  `;

  document.body.insertAdjacentHTML("beforeend", html);
});
