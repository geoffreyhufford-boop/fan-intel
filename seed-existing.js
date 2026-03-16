require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://fan_intel_db_user:PNAAEcqe2aSq21gLI76mjpv3ugdtHl6V@dpg-d6s81hv5r7bs738aeav0-a/fan_intel_db',
  ssl: { rejectUnauthorized: false }
});

const fans = [
  { handle: 'rachel_erin_80', platform: 'instagram', real_name: 'Rachel Erin', city: 'Chicago', fan_type: 'evangelist',
    commented_repeatedly: true, shared_reposted: true, bought_merch: true, attended_show: true, attended_multiple: false, runs_fan_page: false, creates_content: true, frequent_dms: true },
  { handle: 'carolcartwright19', platform: 'instagram', real_name: 'Carol Cartwright', city: null, fan_type: 'hyper',
    commented_repeatedly: true, shared_reposted: true, bought_merch: false, attended_show: true, attended_multiple: true, runs_fan_page: false, creates_content: false, frequent_dms: true },
  { handle: 'mechitgal80', platform: 'instagram', real_name: 'Mechita', city: null, fan_type: 'standard',
    commented_repeatedly: true, shared_reposted: true, bought_merch: false, attended_show: false, attended_multiple: false, runs_fan_page: false, creates_content: true, frequent_dms: true },
  { handle: 'cronkme', platform: 'instagram', real_name: 'Caitlin', city: 'Omaha', fan_type: 'standard',
    commented_repeatedly: true, shared_reposted: true, bought_merch: true, attended_show: true, attended_multiple: false, runs_fan_page: false, creates_content: false, frequent_dms: true },
  { handle: 'realtonyluu', platform: 'instagram', real_name: 'Tony Luu', city: 'Denver', fan_type: 'hyper',
    commented_repeatedly: true, shared_reposted: true, bought_merch: true, attended_show: true, attended_multiple: true, runs_fan_page: false, creates_content: true, frequent_dms: false },
  { handle: 'https_idkneverfound', platform: 'instagram', real_name: 'Chloey Chadwick', city: 'Denver', fan_type: 'hyper',
    commented_repeatedly: true, shared_reposted: true, bought_merch: true, attended_show: true, attended_multiple: true, runs_fan_page: false, creates_content: true, frequent_dms: false },
  { handle: 'pineapple.madness_666', platform: 'instagram', real_name: 'Katie Berrie', city: 'Denver', fan_type: 'hyper',
    commented_repeatedly: true, shared_reposted: true, bought_merch: true, attended_show: true, attended_multiple: true, runs_fan_page: false, creates_content: true, frequent_dms: false },
  { handle: 'punnkin', platform: 'tiktok', real_name: null, city: null, fan_type: null,
    commented_repeatedly: true, shared_reposted: true, bought_merch: false, attended_show: false, attended_multiple: false, runs_fan_page: false, creates_content: false, frequent_dms: true },
  { handle: 'radrachel892', platform: 'tiktok', real_name: 'Rachel Egle', city: 'Cleveland', fan_type: null,
    commented_repeatedly: true, shared_reposted: true, bought_merch: true, attended_show: true, attended_multiple: true, runs_fan_page: false, creates_content: false, frequent_dms: true },
  { handle: 'hucking_filarious', platform: 'tiktok', real_name: null, city: 'Denver', fan_type: null,
    commented_repeatedly: true, shared_reposted: true, bought_merch: true, attended_show: true, attended_multiple: false, runs_fan_page: false, creates_content: false, frequent_dms: true },
  { handle: 'inthevillage', platform: 'tiktok', real_name: 'Rachelle Dawn', city: null, fan_type: null,
    commented_repeatedly: true, shared_reposted: true, bought_merch: false, attended_show: false, attended_multiple: false, runs_fan_page: false, creates_content: false, frequent_dms: true },
  { handle: 'tonithepirate', platform: 'tiktok', real_name: 'Toni Rivera', city: 'San Luis Obispo', fan_type: null,
    commented_repeatedly: false, shared_reposted: true, bought_merch: true, attended_show: true, attended_multiple: false, runs_fan_page: false, creates_content: false, frequent_dms: true },
  { handle: 'luluanncustoms', platform: 'tiktok', real_name: 'LuLu Ann Customs', city: 'Cincinnati', fan_type: null,
    commented_repeatedly: true, shared_reposted: true, bought_merch: true, attended_show: true, attended_multiple: false, runs_fan_page: false, creates_content: false, frequent_dms: true },
  { handle: 'nicolekelly011', platform: 'tiktok', real_name: 'Nicole Kelly', city: null, fan_type: null,
    commented_repeatedly: true, shared_reposted: true, bought_merch: true, attended_show: true, attended_multiple: true, runs_fan_page: false, creates_content: false, frequent_dms: true },
  { handle: 'kel9210', platform: 'tiktok', real_name: 'Kelly', city: 'Portland', fan_type: null,
    commented_repeatedly: true, shared_reposted: false, bought_merch: true, attended_show: true, attended_multiple: true, runs_fan_page: false, creates_content: false, frequent_dms: false },
  { handle: 'candypantzzz24', platform: 'tiktok', real_name: null, city: null, fan_type: null,
    commented_repeatedly: true, shared_reposted: true, bought_merch: true, attended_show: true, attended_multiple: false, runs_fan_page: false, creates_content: false, frequent_dms: true },
  { handle: '_dar_333', platform: 'tiktok', real_name: null, city: null, fan_type: null,
    commented_repeatedly: true, shared_reposted: true, bought_merch: false, attended_show: false, attended_multiple: false, runs_fan_page: false, creates_content: false, frequent_dms: true },
  { handle: 'dwizzlebrother', platform: 'tiktok', real_name: null, city: 'Ohio', fan_type: null,
    commented_repeatedly: true, shared_reposted: true, bought_merch: true, attended_show: true, attended_multiple: false, runs_fan_page: false, creates_content: false, frequent_dms: true },
  { handle: 'cheesin_danish', platform: 'instagram', real_name: 'Dana', city: 'Denver', fan_type: null,
    commented_repeatedly: true, shared_reposted: true, bought_merch: true, attended_show: true, attended_multiple: false, runs_fan_page: false, creates_content: false, frequent_dms: false },
  { handle: 'joscelynnmills', platform: 'instagram', real_name: 'Joscelyn Mills', city: 'Montana', fan_type: null,
    commented_repeatedly: true, shared_reposted: true, bought_merch: false, attended_show: true, attended_multiple: false, runs_fan_page: false, creates_content: true, frequent_dms: true },
];

async function seed() {
  console.log('Seeding existing fan data...');

  // Use show_id = 1 (Santa Cruz, first show) as a generic "pre-tour" sighting
  // since we don't know exactly which shows these fans were at
  const preShowRes = await pool.query(`
    INSERT INTO shows (date, city, venue, capacity)
    VALUES ('2026-03-01', 'Pre-Tour', 'Spreadsheet Import', 0)
    ON CONFLICT DO NOTHING
    RETURNING id
  `);

  // Get the pre-tour show id, or find it if it already exists
  let showId;
  if (preShowRes.rows.length > 0) {
    showId = preShowRes.rows[0].id;
  } else {
    const existing = await pool.query("SELECT id FROM shows WHERE venue = 'Spreadsheet Import'");
    showId = existing.rows[0].id;
  }

  for (const f of fans) {
    // Insert fan
    const fanRes = await pool.query(
      `INSERT INTO fans (handle, platform, real_name, city, fan_type)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (handle, platform) DO UPDATE SET
         real_name = COALESCE(EXCLUDED.real_name, fans.real_name),
         city = COALESCE(EXCLUDED.city, fans.city),
         fan_type = COALESCE(EXCLUDED.fan_type, fans.fan_type)
       RETURNING id`,
      [f.handle, f.platform, f.real_name, f.city, f.fan_type]
    );
    const fanId = fanRes.rows[0].id;

    // Insert sighting
    await pool.query(
      `INSERT INTO sightings (fan_id, show_id, entered_by,
        commented_repeatedly, shared_reposted, bought_merch,
        attended_show, attended_multiple, runs_fan_page,
        creates_content, frequent_dms, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [fanId, showId, 'spreadsheet-import',
       f.commented_repeatedly, f.shared_reposted, f.bought_merch,
       f.attended_show, f.attended_multiple, f.runs_fan_page,
       f.creates_content, f.frequent_dms, 'Imported from pre-tour spreadsheet']
    );

    console.log(`  ✓ ${f.handle} (${f.platform})`);
  }

  console.log(`\nDone! ${fans.length} fans imported.`);
  await pool.end();
}

seed().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});
