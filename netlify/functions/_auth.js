'use strict';
const jwt = require('jsonwebtoken');
const { query } = require('./_db');

const JWT_SECRET = process.env.JWT_SECRET || 'kingsim-dev-secret-change-in-prod';
const SESSION_DAYS = 30;

function cors(extra = {}) {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json',
    ...extra,
  };
}

function ok(body, code = 200) {
  return { statusCode: code, headers: cors(), body: JSON.stringify(body) };
}

function err(msg, code = 400) {
  return { statusCode: code, headers: cors(), body: JSON.stringify({ error: msg }) };
}

function optionsResp() {
  return { statusCode: 204, headers: cors(), body: '' };
}

function signToken(userId) {
  return jwt.sign({ sub: userId }, JWT_SECRET, { expiresIn: `${SESSION_DAYS}d` });
}

async function requireAuth(event) {
  const auth = event.headers['authorization'] || event.headers['Authorization'] || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return null;

  let payload;
  try { payload = jwt.verify(token, JWT_SECRET); } catch { return null; }

  const res = await query(
    `SELECT s.user_id, u.role, u.verified, u.email, u.full_name, u.game_nick, u.alliance
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token = $1 AND s.expires_at > NOW()`,
    [token]
  );
  if (!res.rows.length) return null;
  return { ...res.rows[0], token };
}

function randomCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

module.exports = { cors, ok, err, optionsResp, signToken, requireAuth, randomCode, SESSION_DAYS, JWT_SECRET };
