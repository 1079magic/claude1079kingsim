'use strict';
const bcrypt = require('bcryptjs');
const { query, ensureSchema } = require('./_db');
const { ok, err, optionsResp, signToken, SESSION_DAYS } = require('./_auth');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return optionsResp();
  if (event.httpMethod !== 'POST') return err('Method not allowed', 405);

  await ensureSchema();

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return err('Invalid JSON'); }

  const { email, password } = body;
  if (!email || !password) return err('Email and password required');

  const res = await query(
    'SELECT id, password_hash, verified, role, full_name, game_nick, alliance FROM users WHERE email=$1',
    [email.toLowerCase()]
  );
  if (!res.rows.length) return err('Invalid email or password', 401);

  const user = res.rows[0];
  const match = await bcrypt.compare(password, user.password_hash);
  if (!match) return err('Invalid email or password', 401);
  if (!user.verified) return err('Email not verified. Please complete registration first.', 403);

  const token = signToken(user.id);
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  const ip = event.headers['x-forwarded-for'] || event.headers['client-ip'] || '';
  const ua = event.headers['user-agent'] || '';

  await query(
    'INSERT INTO sessions (user_id, token, expires_at, ip, user_agent) VALUES ($1,$2,$3,$4,$5)',
    [user.id, token, expiresAt, ip.slice(0,100), ua.slice(0,300)]
  );

  // Update login stats
  await query(
    'UPDATE users SET last_login=NOW(), login_count=login_count+1 WHERE id=$1',
    [user.id]
  );

  return ok({
    token,
    user: {
      id: user.id,
      email,
      role: user.role,
      full_name: user.full_name,
      game_nick: user.game_nick,
      alliance: user.alliance,
    }
  });
};
