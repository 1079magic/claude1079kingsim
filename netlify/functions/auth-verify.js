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

  // Normalize: userId as integer, code as trimmed string (CHAR(6) pads with spaces)
  const uid  = parseInt(userId, 10);
  const codeStr = String(code).trim();

  if (isNaN(uid)) return err('Invalid userId');
  if (!/^\d{6}$/.test(codeStr)) return err('Code must be 6 digits');

  // Debug log so we can see exactly what's being compared
  console.log('[auth-verify] uid:', uid, '| code:', JSON.stringify(codeStr));

  // Use TRIM() on the stored code to handle CHAR(6) padding
  const res = await query(
    `SELECT id FROM verification_codes
     WHERE user_id=$1 AND TRIM(code)=$2 AND expires_at > NOW() AND used=FALSE
     ORDER BY created_at DESC LIMIT 1`,
    [uid, codeStr]
  );

  console.log('[auth-verify] matching rows:', res.rows.length);

  if (!res.rows.length) {
    // Extra debug — show what codes exist for this user
    const dbg = await query(
      `SELECT TRIM(code) as code, expires_at, used FROM verification_codes WHERE user_id=$1 ORDER BY created_at DESC LIMIT 3`,
      [uid]
    );
    console.log('[auth-verify] codes in DB for user:', JSON.stringify(dbg.rows));
    return err('Invalid or expired verification code');
  }

  const codeId = res.rows[0].id;
  await query('UPDATE verification_codes SET used=TRUE WHERE id=$1', [codeId]);

  // Mark verified
  const updates = ['verified=TRUE'];
  const params = [];
  let pi = 1;

  if (full_name) { updates.push(`full_name=$${++pi}`); params.push(full_name.trim()); }
  if (game_nick) { updates.push(`game_nick=$${++pi}`); params.push(game_nick.trim()); }
  if (alliance && ALLIANCES.includes(alliance)) {
    updates.push(`alliance=$${++pi}`);
    params.push(alliance);
  }

  params.push(uid);
  await query(`UPDATE users SET ${updates.join(',')} WHERE id=$${++pi}`, params);

  return ok({ message: 'Email verified. Registration complete.' });
};
