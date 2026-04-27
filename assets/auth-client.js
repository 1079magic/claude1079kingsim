/* KingSim Auth Client — loaded on every page */
(function () {
  'use strict';

  const API = '/.netlify/functions';
  const TOKEN_KEY = 'ks_token';
  const USER_KEY  = 'ks_user';

  function saveSession(token, user) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  }
  function clearSession() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  }
  function getToken()  { return localStorage.getItem(TOKEN_KEY); }
  function getUser()   { try { return JSON.parse(localStorage.getItem(USER_KEY)); } catch { return null; } }
  function isLoggedIn(){ return !!getToken() && !!getUser(); }

  async function apiFetch(path, opts = {}) {
    const token = getToken();
    const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(API + path, { ...opts, headers });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  }

  async function logout() {
    try { await apiFetch('/auth-logout', { method: 'POST' }); } catch {}
    clearSession();
    window.location.href = '/login.html';
  }

  // --- Nav injection: show user pill + logout when logged in ---
  function injectNavUser() {
    const user = getUser();
    if (!user) return;
    const nav = document.querySelector('.nav-links');
    if (!nav) return;

    // Remove any existing pill
    nav.querySelectorAll('.ks-user-pill').forEach(e => e.remove());

    const pill = document.createElement('span');
    pill.className = 'ks-user-pill';
    pill.style.cssText = `
      display:inline-flex;align-items:center;gap:8px;
      background:rgba(246,164,53,0.12);border:1px solid rgba(246,164,53,0.3);
      border-radius:20px;padding:3px 12px 3px 8px;font-size:0.82rem;color:#f6a435;
      margin-left:8px;
    `;
    const nick = user.game_nick || user.full_name || user.email.split('@')[0];
    const tag  = user.alliance ? ` [${user.alliance}]` : '';
    pill.innerHTML = `
      <span style="width:20px;height:20px;border-radius:50%;background:#f6a435;color:#0a0f15;
        display:inline-flex;align-items:center;justify-content:center;font-weight:700;font-size:0.7rem;">
        ${nick[0].toUpperCase()}
      </span>
      <span>${nick}${tag}</span>
      ${user.role === 'admin' ? '<span style="background:#e8324a;color:#fff;border-radius:4px;padding:1px 5px;font-size:0.68rem;font-weight:700">ADMIN</span>' : ''}
      <button onclick="window.KsAuth.logout()" style="background:none;border:none;color:#f6a435;cursor:pointer;font-size:0.8rem;padding:0;margin-left:4px;" title="Logout">✕</button>
    `;
    nav.appendChild(pill);

    // Show admin link if admin
    if (user.role === 'admin') {
      const existing = nav.querySelector('a[href="/admin.html"]');
      if (!existing) {
        const a = document.createElement('a');
        a.href = '/admin.html';
        a.textContent = '⚙ Admin';
        a.style.color = '#e8324a';
        nav.insertBefore(a, pill);
      }
    }
  }

  // --- Page guard: redirect to login if not authenticated ---
  // Call on protected pages: window.KsAuth.requireLogin()
  async function requireLogin() {
    if (!isLoggedIn()) {
      window.location.href = '/login.html';
      return false;
    }
    // Optionally verify token is still valid server-side
    const { ok, data } = await apiFetch('/auth-me');
    if (!ok) {
      clearSession();
      window.location.href = '/login.html';
      return false;
    }
    // Refresh user in storage
    saveSession(getToken(), data.user);
    injectNavUser();
    return data;
  }

  // --- Save current tool stats to DB ---
  async function saveStats(statsObj) {
    if (!isLoggedIn()) return;
    return apiFetch('/user-save-stats', {
      method: 'POST',
      body: JSON.stringify({ type: 'stats', stats: statsObj }),
    });
  }

  async function saveHeroes(heroesArr) {
    if (!isLoggedIn()) return;
    return apiFetch('/user-save-stats', {
      method: 'POST',
      body: JSON.stringify({ type: 'heroes', heroes: heroesArr }),
    });
  }

  // Expose globally
  window.KsAuth = {
    isLoggedIn, getToken, getUser,
    saveSession, clearSession,
    apiFetch, logout,
    requireLogin, injectNavUser,
    saveStats, saveHeroes,
  };

  // Auto-inject nav user pill on every page if logged in
  document.addEventListener('DOMContentLoaded', () => {
    if (isLoggedIn()) injectNavUser();
  });
})();
