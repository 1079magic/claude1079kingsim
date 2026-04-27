'use strict';
const { query } = require('./_db');
const { ok, err, optionsResp, requireAuth } = require('./_auth');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return optionsResp();
  const user = await requireAuth(event);
  if (!user) return err('Unauthorized', 401);

  const alliance = event.queryStringParameters?.alliance || user.alliance;

  const res = await query(`
    SELECT
      u.id, u.game_nick, u.full_name, u.alliance, u.last_login,
      s.troop_tier,
      s.inf_atk, s.inf_def, s.inf_let, s.inf_hp,
      s.cav_atk, s.cav_def, s.cav_let, s.cav_hp,
      s.arc_atk, s.arc_def, s.arc_let, s.arc_hp,
      s.stock_inf, s.stock_cav, s.stock_arc,
      s.march_size, s.rally_size, s.updated_at AS stats_updated
    FROM users u
    LEFT JOIN user_stats s ON s.user_id = u.id
    WHERE u.alliance=$1 AND u.verified=TRUE
    ORDER BY u.game_nick ASC
  `, [alliance]);

  return ok({ alliance, members: res.rows });
};
