'use strict';
const { Pool } = require('./node_modules/pg');
const bcrypt = require('./node_modules/bcryptjs');

const DB = process.env.NETLIFY_DATABASE_URL;
if (!DB) { console.error('NETLIFY_DATABASE_URL not set'); process.exit(1); }

const pool = new Pool({ connectionString: DB, ssl: { rejectUnauthorized: false } });

async function main() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY, email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL, full_name TEXT, game_nick TEXT,
      alliance TEXT CHECK (alliance IN ('WHO','HRD','404','UNT')),
      role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin','user')),
      verified BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_login TIMESTAMPTZ, login_count INT NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS verification_codes (
      id SERIAL PRIMARY KEY,
      user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      code CHAR(6) NOT NULL, expires_at TIMESTAMPTZ NOT NULL,
      used BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS sessions (
      id SERIAL PRIMARY KEY,
      user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token TEXT UNIQUE NOT NULL, expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), ip TEXT, user_agent TEXT
    );
    CREATE TABLE IF NOT EXISTS user_stats (
      id SERIAL PRIMARY KEY,
      user_id INT UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      troop_tier TEXT,
      inf_atk NUMERIC, inf_def NUMERIC, inf_let NUMERIC, inf_hp NUMERIC,
      cav_atk NUMERIC, cav_def NUMERIC, cav_let NUMERIC, cav_hp NUMERIC,
      arc_atk NUMERIC, arc_def NUMERIC, arc_let NUMERIC, arc_hp NUMERIC,
      stock_inf BIGINT, stock_cav BIGINT, stock_arc BIGINT,
      march_size INT, rally_size INT, raw_payload JSONB,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS user_heroes (
      id SERIAL PRIMARY KEY,
      user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      hero_name TEXT NOT NULL, skill_level INT, context TEXT,
      raw_payload JSONB, saved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(user_id, hero_name, context)
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
    CREATE INDEX IF NOT EXISTS idx_sessions_user  ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_ver_codes_user ON verification_codes(user_id);
  `);
  console.log('✅ Schema ready');

  const hash = await bcrypt.hash('Kingsim1079!', 12);
  const existing = await pool.query("SELECT id FROM users WHERE email='tipicoegon@gmail.com'");

  if (existing.rows.length) {
    await pool.query(
      "UPDATE users SET password_hash=$1,role='admin',verified=TRUE,full_name='Egon',game_nick='Cro_Baby_Shark',alliance='WHO' WHERE email='tipicoegon@gmail.com'",
      [hash]
    );
    console.log('✅ Admin account updated');
  } else {
    await pool.query(
      "INSERT INTO users (email,password_hash,full_name,game_nick,alliance,role,verified) VALUES ('tipicoegon@gmail.com',$1,'Egon','Cro_Baby_Shark','WHO','admin',TRUE)",
      [hash]
    );
    console.log('✅ Admin account created');
  }

  console.log('\n--- Login credentials ---');
  console.log('Email   : tipicoegon@gmail.com');
  console.log('Password: Kingsim1079!');
  console.log('Nick    : Cro_Baby_Shark');
  console.log('Alliance: WHO');
  console.log('Role    : admin');
  await pool.end();
}

main().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
