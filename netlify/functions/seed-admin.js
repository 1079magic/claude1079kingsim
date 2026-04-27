#!/usr/bin/env node
// Run once: node netlify/functions/seed-admin.js
// Creates the admin user for tipicoegon@gmail.com
// Set DATABASE_URL env var before running:
//   NETLIFY_DATABASE_URL="postgresql://..." node netlify/functions/seed-admin.js

'use strict';
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const readline = require('readline');

const pool = new Pool({
  connectionString: process.env.NETLIFY_DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = q => new Promise(res => rl.question(q, res));

async function main() {
  console.log('\n🛡️  KingSim Admin Seed Script\n');

  const password = await ask('Set admin password (min 8 chars): ');
  if (password.length < 8) { console.error('Too short.'); process.exit(1); }

  const hash = await bcrypt.hash(password, 12);

  // Create tables if not exist
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY, email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL, full_name TEXT, game_nick TEXT,
      alliance TEXT, role TEXT NOT NULL DEFAULT 'user',
      verified BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_login TIMESTAMPTZ, login_count INT NOT NULL DEFAULT 0
    );
  `);

  const existing = await pool.query("SELECT id FROM users WHERE email='tipicoegon@gmail.com'");
  if (existing.rows.length) {
    await pool.query(
      "UPDATE users SET password_hash=$1, role='admin', verified=TRUE, full_name='Egon', game_nick='Cro_Baby_Shark', alliance='WHO' WHERE email='tipicoegon@gmail.com'",
      [hash]
    );
    console.log('✅ Admin account updated.');
  } else {
    await pool.query(
      "INSERT INTO users (email, password_hash, full_name, game_nick, alliance, role, verified) VALUES ('tipicoegon@gmail.com',$1,'Egon','Cro_Baby_Shark','WHO','admin',TRUE)",
      [hash]
    );
    console.log('✅ Admin account created: tipicoegon@gmail.com / Cro_Baby_Shark / WHO');
  }

  console.log('\nDone. You can now log in at /login.html\n');
  rl.close();
  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
