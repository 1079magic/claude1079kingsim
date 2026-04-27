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
  const uid     = parseInt(userId, 10);
  const codeStr = String(code).trim();

  if (isNaN(uid))              return err('Invalid userId');
  if (!/^\d{6}$/.test(codeStr)) return err('Code must be 6 digits');

  // Match code — TRIM() handles any legacy CHAR(6) padding
  const res = await query(
    `SELECT id FROM verification_codes
     WHERE user_id=$1 AND TRIM(code)=$2 AND expires_at > NOW() AND used=FALSE
     ORDER BY created_at DESC LIMIT 1`,
    [uid, codeStr]
  );

  if (!res.rows.length) return err('Invalid or expired verification code');

  // Mark code used
  await query('UPDATE verification_codes SET used=TRUE WHERE id=$1', [res.rows[0].id]);

  // Build UPDATE — userId is $1, optional fields follow as $2, $3...
  // This fixes the previous bug where WHERE id=$2 was built with only 1 param
  const params = [uid];  // $1 always
  const sets   = ['verified=TRUE'];

  if (full_name) { params.push(full_name.trim()); sets.push(`full_name=$${params.length}`); }
  if (game_nick) { params.push(game_nick.trim()); sets.push(`game_nick=$${params.length}`); }
  if (alliance && ALLIANCES.includes(alliance)) {
    params.push(alliance);
    sets.push(`alliance=$${params.length}`);
  }

  await query(`UPDATE users SET ${sets.join(',')} WHERE id=$1`, params);

  return ok({ message: 'Email verified. Registration complete.' });
};
