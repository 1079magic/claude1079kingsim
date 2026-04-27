'use strict';
// TEMPORARY DEBUG — remove after diagnosis
// GET /.netlify/functions/debug-verify?secret=ks-debug-2026&email=egon.hadzisejdic1@gmail.com
const { query } = require('./_db');

exports.handler = async (event) => {
  const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };
  
  if (event.queryStringParameters?.secret !== 'ks-debug-2026') {
    return { statusCode: 403, headers, body: JSON.stringify({ error: 'Forbidden' }) };
  }

  const email = event.queryStringParameters?.email;
  if (!email) return { statusCode: 400, headers, body: JSON.stringify({ error: 'email param required' }) };

  const user = await query(
    'SELECT id, email, verified FROM users WHERE email=$1',
    [email.toLowerCase()]
  );

  if (!user.rows.length) {
    return { statusCode: 200, headers, body: JSON.stringify({ found: false, email }) };
  }

  const u = user.rows[0];
  const codes = await query(
    `SELECT id, code, LENGTH(code) as code_len, used, expires_at, expires_at > NOW() as still_valid
     FROM verification_codes WHERE user_id=$1 ORDER BY created_at DESC LIMIT 5`,
    [u.id]
  );

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      user: u,
      codes: codes.rows,
    }, null, 2),
  };
};
