'use strict';
const { query } = require('./_db');
const { ok, err, optionsResp, requireAuth } = require('./_auth');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return optionsResp();
  const user = await requireAuth(event);
  if (!user) return err('Unauthorized', 401);

  const statsRes = await query('SELECT * FROM user_stats WHERE user_id=$1', [user.user_id]);
  const heroesRes = await query('SELECT * FROM user_heroes WHERE user_id=$1 ORDER BY saved_at DESC', [user.user_id]);

  return ok({
    user: {
      id: user.user_id,
      email: user.email,
      role: user.role,
      full_name: user.full_name,
      game_nick: user.game_nick,
      alliance: user.alliance,
    },
    stats: statsRes.rows[0] || null,
    heroes: heroesRes.rows,
  });
};
