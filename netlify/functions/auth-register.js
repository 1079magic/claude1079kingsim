'use strict';
const bcrypt = require('bcryptjs');
const { query, ensureSchema } = require('./_db');
const { sendVerificationCode } = require('./_email');
const { ok, err, optionsResp, randomCode } = require('./_auth');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return optionsResp();
  if (event.httpMethod !== 'POST') return err('Method not allowed', 405);

  await ensureSchema();

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return err('Invalid JSON'); }

  const { email, password } = body;
  if (!email || !password) return err('Email and password required');

  const emailRx = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRx.test(email)) return err('Invalid email address');
  if (password.length < 8) return err('Password must be at least 8 characters');

  const existing = await query('SELECT id, verified FROM users WHERE email = $1', [email.toLowerCase()]);
  if (existing.rows.length && existing.rows[0].verified) {
    return err('Email already registered');
  }

  const hash = await bcrypt.hash(password, 12);
  const code = randomCode();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

  let userId;
  if (existing.rows.length) {
    userId = existing.rows[0].id;
    await query('UPDATE users SET password_hash=$1, verified=FALSE WHERE id=$2', [hash, userId]);
    await query('UPDATE verification_codes SET used=TRUE WHERE user_id=$1', [userId]);
  } else {
    const ins = await query(
      'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id',
      [email.toLowerCase(), hash]
    );
    userId = ins.rows[0].id;
  }

  await query(
    'INSERT INTO verification_codes (user_id, code, expires_at) VALUES ($1, $2, $3)',
    [userId, code, expiresAt]
  );

  try {
    await sendVerificationCode(email, code);
  } catch (e) {
    console.error('[auth-register] Email send failed:', e.message);
    return err('Email send failed: ' + e.message, 500);
  }

  return ok({ message: 'Verification code sent', userId });
};
