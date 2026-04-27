'use strict';
const { query } = require('./_db');
const { ok, err, optionsResp } = require('./_auth');

const ALLIANCES = ['WHO', 'HRD', '404', 'UNT'];

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return optionsResp();
  if (event.httpMethod !== 'POST') return err('Method not allowed', 405);

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return err('Invalid JSON'); }

  const { userId, full_name, game_nick, alliance } = body;
  if (!userId) return err('userId required');

  // Verify user exists and is verified
  const res = await query('SELECT id, verified FROM users WHERE id=$1', [userId]);
  if (!res.rows.length) return err('User not found', 404);
  if (!res.rows[0].verified) return err('Email not verified', 403);

  if (!game_nick || !game_nick.trim()) return err('game_nick required');
  if (!alliance || !ALLIANCES.includes(alliance)) return err('Valid alliance required');

  await query(
    'UPDATE users SET full_name=$1, game_nick=$2, alliance=$3 WHERE id=$4',
    [full_name?.trim() || null, game_nick.trim(), alliance, userId]
  );

  return ok({ message: 'Profile saved' });
};
