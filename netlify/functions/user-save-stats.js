'use strict';
const { query } = require('./_db');
const { ok, err, optionsResp, requireAuth } = require('./_auth');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return optionsResp();
  if (event.httpMethod !== 'POST') return err('Method not allowed', 405);

  const user = await requireAuth(event);
  if (!user) return err('Unauthorized', 401);

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return err('Invalid JSON'); }

  const uid = user.user_id;

  // --- Save troop stats ---
  if (body.type === 'stats') {
    const s = body.stats || {};
    await query(`
      INSERT INTO user_stats
        (user_id, troop_tier,
         inf_atk, inf_def, inf_let, inf_hp,
         cav_atk, cav_def, cav_let, cav_hp,
         arc_atk, arc_def, arc_let, arc_hp,
         stock_inf, stock_cav, stock_arc,
         march_size, rally_size, raw_payload, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,NOW())
      ON CONFLICT (user_id) DO UPDATE SET
        troop_tier=$2, inf_atk=$3, inf_def=$4, inf_let=$5, inf_hp=$6,
        cav_atk=$7, cav_def=$8, cav_let=$9, cav_hp=$10,
        arc_atk=$11, arc_def=$12, arc_let=$13, arc_hp=$14,
        stock_inf=$15, stock_cav=$16, stock_arc=$17,
        march_size=$18, rally_size=$19, raw_payload=$20, updated_at=NOW()
    `, [
      uid, s.troop_tier || null,
      s.inf_atk||null, s.inf_def||null, s.inf_let||null, s.inf_hp||null,
      s.cav_atk||null, s.cav_def||null, s.cav_let||null, s.cav_hp||null,
      s.arc_atk||null, s.arc_def||null, s.arc_let||null, s.arc_hp||null,
      s.stock_inf||null, s.stock_cav||null, s.stock_arc||null,
      s.march_size||null, s.rally_size||null,
      JSON.stringify(s)
    ]);
    return ok({ message: 'Stats saved' });
  }

  // --- Save heroes ---
  if (body.type === 'heroes') {
    const heroes = body.heroes || [];
    if (!Array.isArray(heroes)) return err('heroes must be array');
    // Upsert each hero
    for (const h of heroes) {
      await query(`
        INSERT INTO user_heroes (user_id, hero_name, skill_level, context, raw_payload, saved_at)
        VALUES ($1,$2,$3,$4,$5,NOW())
        ON CONFLICT (user_id, hero_name, context) DO UPDATE SET
          skill_level=$3, raw_payload=$5, saved_at=NOW()
      `, [uid, h.name||'', h.skill_level||null, h.context||'general', JSON.stringify(h)]);
    }
    return ok({ message: `${heroes.length} heroes saved` });
  }

  return err('Unknown type. Use stats or heroes.');
};
