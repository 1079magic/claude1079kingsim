'use strict';
// ONE-TIME SETUP FUNCTION
// Visit: https://1079kingsim.netlify.app/.netlify/functions/init-db?secret=kingsim-init-2026
// After it returns success, delete this file and redeploy.

const { query, ensureSchema } = require('./_db');
const bcrypt = require('bcryptjs');

const INIT_SECRET = process.env.INIT_SECRET || 'kingsim-init-2026';

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  };

  // Simple secret guard so random people can't hit this
  const secret = event.queryStringParameters?.secret;
  if (secret !== INIT_SECRET) {
    return { statusCode: 403, headers, body: JSON.stringify({ error: 'Forbidden — wrong secret' }) };
  }

  try {
    // Create all tables
    await ensureSchema();

    // Create admin account
    const hash = await bcrypt.hash('Kingsim1079!', 12);
    const existing = await query("SELECT id FROM users WHERE email='tipicoegon@gmail.com'");

    if (existing.rows.length) {
      await query(
        "UPDATE users SET password_hash=$1, role='admin', verified=TRUE, full_name='Egon', game_nick='Cro_Baby_Shark', alliance='WHO' WHERE email='tipicoegon@gmail.com'",
        [hash]
      );
    } else {
      await query(
        "INSERT INTO users (email, password_hash, full_name, game_nick, alliance, role, verified) VALUES ('tipicoegon@gmail.com',$1,'Egon','Cro_Baby_Shark','WHO','admin',TRUE)",
        [hash]
      );
    }

    // Verify it worked
    const check = await query("SELECT id, email, role, game_nick, alliance FROM users WHERE email='tipicoegon@gmail.com'");

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: 'DB schema created + admin account ready. DELETE this function file now.',
        admin: check.rows[0],
        login_url: 'https://1079kingsim.netlify.app/login.html',
        credentials: {
          email: 'tipicoegon@gmail.com',
          password: 'Kingsim1079!',
        },
      }, null, 2),
    };

  } catch (e) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: e.message, stack: e.stack }),
    };
  }
};
