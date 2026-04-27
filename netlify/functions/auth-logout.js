'use strict';
const { query } = require('./_db');
const { ok, err, optionsResp, requireAuth } = require('./_auth');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return optionsResp();
  const user = await requireAuth(event);
  if (!user) return err('Unauthorized', 401);
  await query('DELETE FROM sessions WHERE token=$1', [user.token]);
  return ok({ message: 'Logged out' });
};
