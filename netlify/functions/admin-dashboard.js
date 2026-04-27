'use strict';
const { query } = require('./_db');
const { ok, err, optionsResp, requireAuth } = require('./_auth');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return optionsResp();
  const user = await requireAuth(event);
  if (!user) return err('Unauthorized', 401);
  if (user.role !== 'admin') return err('Forbidden', 403);

  const [totals, byAlliance, recent, activeSessions] = await Promise.all([
    query(`
      SELECT
        COUNT(*) FILTER (WHERE verified=TRUE)                                    AS total_users,
        COUNT(*) FILTER (WHERE verified=TRUE AND role='admin')                   AS total_admins,
        COUNT(*) FILTER (WHERE verified=FALSE)                                   AS pending_verification,
        COUNT(*) FILTER (WHERE last_login > NOW()-INTERVAL '24h' AND verified=TRUE) AS active_24h,
        COUNT(*) FILTER (WHERE last_login > NOW()-INTERVAL '7d'  AND verified=TRUE) AS active_7d,
        COUNT(*) FILTER (WHERE created_at > NOW()-INTERVAL '7d'  AND verified=TRUE) AS new_7d
      FROM users
    `),
    query(`
      SELECT alliance, COUNT(*) AS cnt
      FROM users WHERE verified=TRUE AND alliance IS NOT NULL
      GROUP BY alliance ORDER BY cnt DESC
    `),
    query(`
      SELECT id, email, full_name, game_nick, alliance, role,
             verified, created_at, last_login, login_count
      FROM users ORDER BY created_at DESC LIMIT 100
    `),
    query(`
      SELECT COUNT(DISTINCT user_id) AS active_sessions
      FROM sessions WHERE expires_at > NOW()
    `),
  ]);

  return ok({
    totals: totals.rows[0],
    by_alliance: byAlliance.rows,
    active_sessions: activeSessions.rows[0].active_sessions,
    users: recent.rows,
  });
};
