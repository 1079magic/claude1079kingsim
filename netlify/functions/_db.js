'use strict';
const { Pool } = require('pg');

let _pool = null;
function getPool() {
  if (!_pool) {
    _pool = new Pool({
      connectionString: process.env.NETLIFY_DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      max: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });
  }
  return _pool;
}

async function query(sql, params) {
  const pool = getPool();
  const client = await pool.connect();
  try {
    const res = await client.query(sql, params);
    return res;
  } finally {
    client.release();
  }
}

// Ensure all tables exist on cold start
async function ensureSchema() {
  await query(`
    CREATE TABLE IF NOT EXISTS users (
      id            SERIAL PRIMARY KEY,
      email         TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      full_name     TEXT,
      game_nick     TEXT,
      alliance      TEXT CHECK (alliance IN ('WHO','HRD','404','UNT')),
      role          TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin','user')),
      verified      BOOLEAN NOT NULL DEFAULT FALSE,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_login    TIMESTAMPTZ,
      login_count   INT NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS verification_codes (
      id         SERIAL PRIMARY KEY,
      user_id    INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      code       TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      used       BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id         SERIAL PRIMARY KEY,
      user_id    INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token      TEXT UNIQUE NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      ip         TEXT,
      user_agent TEXT
    );

    CREATE TABLE IF NOT EXISTS user_stats (
      id              SERIAL PRIMARY KEY,
      user_id         INT UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      troop_tier      TEXT,
      inf_atk         NUMERIC, inf_def NUMERIC, inf_let NUMERIC, inf_hp NUMERIC,
      cav_atk         NUMERIC, cav_def NUMERIC, cav_let NUMERIC, cav_hp NUMERIC,
      arc_atk         NUMERIC, arc_def NUMERIC, arc_let NUMERIC, arc_hp NUMERIC,
      stock_inf       BIGINT,  stock_cav BIGINT,  stock_arc BIGINT,
      march_size      INT,     rally_size INT,
      raw_payload     JSONB,
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS user_heroes (
      id          SERIAL PRIMARY KEY,
      user_id     INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      hero_name   TEXT NOT NULL,
      skill_level INT,
      context     TEXT,
      raw_payload JSONB,
      saved_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(user_id, hero_name, context)
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_token   ON sessions(token);
    CREATE INDEX IF NOT EXISTS idx_sessions_user    ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_ver_codes_user   ON verification_codes(user_id);
  `);
}

module.exports = { query, ensureSchema };
