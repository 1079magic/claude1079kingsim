'use strict';
const { query, ensureSchema } = require('./_db');
const { ok, err, optionsResp } = require('./_auth');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return optionsResp();
  if (event.httpMethod !== 'POST') return err('Method not allowed', 405);

  await ensureSchema();

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return err('Invalid JSON'); }

  const { userId, code, full_name, game_nick, alliance } = body;
  if (!userId || !code) return err('userId and code required');

  const ALLIANCES = ['WHO', 'HRD', '404', 'UNT'];

  // Validate code
  const res = await query(
    `SELECT id FROM verification_codes
     WHERE user_id=$1 AND code=$2 AND expires_at > NOW() AND used=FALSE
     ORDER BY created_at DESC LIMIT 1`,
    [userId, String(code).trim()]
  );
  if (!res.rows.length) return err('Invalid or expired verification code');

  const codeId = res.rows[0].id;

  // Mark code used
  await query('UPDATE verification_codes SET used=TRUE WHERE id=$1', [codeId]);

  // Update user — mark verified + profile if provided
  const updates = ['verified=TRUE'];
  const params = [];
  let pi = 1;

  if (full_name)  { updates.push(`full_name=$${++pi}`);  params.push(full_name.trim()); }
  if (game_nick)  { updates.push(`game_nick=$${++pi}`);  params.push(game_nick.trim()); }
  if (alliance && ALLIANCES.includes(alliance)) {
    updates.push(`alliance=$${++pi}`);
    params.push(alliance);
  }

  params.push(userId);
  await query(`UPDATE users SET ${updates.join(',')} WHERE id=$${++pi}`, params);

  return ok({ message: 'Email verified. Registration complete.' });
};
