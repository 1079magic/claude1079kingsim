// assets/footer.js — auto-insert footer + Patreon banner on all pages
document.addEventListener("DOMContentLoaded", () => {
  const html = `
    <!-- Patreon Banner -->
    <section style="
      background: linear-gradient(135deg, rgba(255,100,40,.08), rgba(100,60,255,.06));
      border-top: 1px solid rgba(255,100,40,.15);
      border-bottom: 1px solid rgba(255,100,40,.10);
      padding: 16px 20px;
      text-align: center;
    ">
      <div style="max-width:780px;margin:0 auto;display:flex;align-items:center;justify-content:center;gap:16px;flex-wrap:wrap;">
        <div style="color:#e9eef7;font-size:.9rem;">
          <strong style="color:#ff6428;">Support this tool on Patreon</strong>
          — Thank you to all supporters! ❤️
        </div>
        <a
          href="https://www.patreon.com/15651923/join"
          target="_blank"
          rel="noopener noreferrer"
          style="
            display:inline-flex;align-items:center;gap:6px;
            background:linear-gradient(90deg,#ff6428,#ff4500);
            color:#fff;font-weight:700;font-size:.85rem;
            padding:8px 18px;border-radius:10px;text-decoration:none;
            box-shadow:0 4px 14px rgba(255,100,40,.25);
            white-space:nowrap;min-height:44px;
          "
        >
          ❤️ Support on Patreon
        </a>
      </div>
    </section>

    <!-- Footer -->
    <footer style="
      background:#1a1d24;
      color:#9aa4b2;
      padding:25px 16px;
      text-align:center;
      font-size:.88rem;
      border-top:1px solid #2d3340;
      margin-top:0;
    ">
      <p style="margin:0 0 10px 0;">
        Disclaimer: 1079KingSim is an independent, fan-made tool for KingShot players.
        Not affiliated with or endorsed by the game's developers or publisher.
      </p>
      <p style="margin:0 0 10px 0;">
        <a href="disclaimer.html" style="color:#3b82f6;">Full Disclaimer</a> ·
        <a href="privacy.html" style="color:#3b82f6;">Privacy &amp; GDPR</a>
      </p>
      <p style="margin:0;">
        © 2026 1079KingSim<br>
        Created by Cro_Baby_Shark, with contributions from the community.<br>
        Special thanks to BladeXtreme, Deydorian and to all supporters from Kingdom #1079!<br>
        All rights reserved.
      </p>
    </footer>
  `;

  document.body.insertAdjacentHTML("beforeend", html);
});
