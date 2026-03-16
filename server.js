require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Simple PIN auth middleware
const AUTH_PIN = process.env.AUTH_PIN || '4770';
function requireAuth(req, res, next) {
  const pin = req.headers['x-pin'] || req.query.pin;
  if (pin === AUTH_PIN) return next();
  res.status(401).json({ error: 'Invalid PIN' });
}

// ---------- DB INIT ----------

async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS shows (
      id SERIAL PRIMARY KEY,
      date DATE NOT NULL,
      city TEXT NOT NULL,
      venue TEXT NOT NULL,
      capacity INTEGER,
      notes TEXT
    );

    CREATE TABLE IF NOT EXISTS fans (
      id SERIAL PRIMARY KEY,
      handle TEXT NOT NULL,
      platform TEXT NOT NULL DEFAULT 'instagram',
      real_name TEXT,
      city TEXT,
      fan_type TEXT,
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(handle, platform)
    );

    CREATE TABLE IF NOT EXISTS sightings (
      id SERIAL PRIMARY KEY,
      fan_id INTEGER REFERENCES fans(id) ON DELETE CASCADE,
      show_id INTEGER REFERENCES shows(id) ON DELETE CASCADE,
      entered_by TEXT,
      commented_repeatedly BOOLEAN DEFAULT FALSE,
      shared_reposted BOOLEAN DEFAULT FALSE,
      bought_merch BOOLEAN DEFAULT FALSE,
      attended_show BOOLEAN DEFAULT FALSE,
      attended_multiple BOOLEAN DEFAULT FALSE,
      runs_fan_page BOOLEAN DEFAULT FALSE,
      creates_content BOOLEAN DEFAULT FALSE,
      frequent_dms BOOLEAN DEFAULT FALSE,
      merch_items TEXT,
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // Seed shows if empty
  const { rows } = await pool.query('SELECT COUNT(*) FROM shows');
  if (parseInt(rows[0].count) === 0) {
    await seedShows();
  }
}

async function seedShows() {
  const shows = [
    ['2026-03-04', 'Santa Cruz, CA', 'The Catalyst', 1000],
    ['2026-03-05', 'San Luis Obispo, CA', 'Fremont Theater', 900],
    ['2026-03-06', 'Sacramento, CA', 'Channel 24', 2150],
    ['2026-03-08', 'Portland, OR', 'Crystal Ballroom', 1500],
    ['2026-03-09', 'Seattle, WA', 'The Neptune', 1000],
    ['2026-03-10', 'Spokane, WA', 'Knitting Factory', 1347],
    ['2026-03-13', 'Denver, CO', 'Summit Night 1', 1350],
    ['2026-03-14', 'Denver, CO', 'Summit Night 2', 1350],
    ['2026-03-17', 'Des Moines, IA', 'Woolys', 750],
    ['2026-03-18', 'Omaha, NE', 'Slowdown', 750],
    ['2026-03-19', 'Minneapolis, MN', 'Varsity', 900],
    ['2026-03-21', 'Chicago, IL', 'Park West', 1150],
    ['2026-03-22', 'Detroit, MI', 'St Andrews', 1000],
    ['2026-03-25', 'Indianapolis, IN', 'Deluxe', 910],
    ['2026-03-26', 'Louisville, KY', 'Mercury Ballroom', 920],
    ['2026-03-27', 'Cincinnati, OH', 'Bogarts', 1350],
    ['2026-03-29', 'Columbus, OH', 'The Bluestone', 1200],
    ['2026-03-30', 'Cleveland, OH', 'House of Blues', 1300],
    ['2026-03-31', 'Buffalo, NY', 'Electric City', 750],
    ['2026-04-03', 'Toronto, ON', 'The Opera House', 900],
    ['2026-04-04', 'Montreal, QC', 'Beanfield Night 1', 1100],
    ['2026-04-05', 'Montreal, QC', 'Beanfield Night 2', 1100],
    ['2026-04-07', 'Quebec City, QC', 'Imperial Bell', 950],
    ['2026-04-09', 'Boston, MA', 'Royale', 1200],
    ['2026-04-10', 'Providence, RI', 'The Strand', 1200],
    ['2026-04-11', 'New York, NY', 'Racket', 650],
    ['2026-04-13', 'Allentown, PA', 'Archer Music Hall', 1422],
    ['2026-04-14', 'Norwalk, CT', 'District Music Hall', 1121],
    ['2026-04-16', 'Wilmington, DE', 'The Queen', 1000],
    ['2026-04-17', 'Washington, DC', '930 Club', 1250],
    ['2026-04-18', 'Richmond, VA', 'The National', 1500],
    ['2026-04-20', 'Charleston, SC', 'Music Farm', 675],
    ['2026-04-22', 'Tampa, FL', 'The Ritz Ybor', 1500],
    ['2026-04-23', 'Fort Lauderdale, FL', 'Revolution', 1300],
    ['2026-04-24', 'Orlando, FL', 'The Plaza Live', 1330],
    ['2026-04-26', 'Atlanta, GA', 'Buckhead Theatre', 1330],
    ['2026-04-27', 'Nashville, TN', 'Marathon Music Works', 1000],
    ['2026-04-28', 'St. Louis, MO', 'The Hawthorn', 1300],
    ['2026-04-30', 'Kansas City, MO', 'The Truman', 1273],
    ['2026-05-01', 'Oklahoma City, OK', 'Tower Theatre', 1027],
    ['2026-05-03', 'Dallas, TX', 'The Echo Lounge', 1000],
    ['2026-05-04', 'Austin, TX', 'Emos', 900],
    ['2026-05-06', 'Albuquerque, NM', 'Sunshine', 1000],
    ['2026-05-08', 'Tucson, AZ', '191 Toole', 500],
    ['2026-05-09', 'Phoenix, AZ', 'Van Buren', 2040],
    ['2026-05-10', 'Las Vegas, NV', 'House of Blues', 1360],
    ['2026-05-13', 'Salt Lake City, UT', 'Rockwell at The Complex', 1600],
    ['2026-05-15', 'Santa Ana, CA', 'Observatory', 1200]
  ];

  for (const [date, city, venue, capacity] of shows) {
    await pool.query(
      'INSERT INTO shows (date, city, venue, capacity) VALUES ($1, $2, $3, $4)',
      [date, city, venue, capacity]
    );
  }
}

// ---------- SEED EXISTING DATA ----------

app.post('/api/seed-spreadsheet', requireAuth, async (req, res) => {
  const fans = [
    { handle: 'rachel_erin_80', platform: 'instagram', real_name: 'Rachel Erin', city: 'Chicago', fan_type: 'evangelist', commented_repeatedly: true, shared_reposted: true, bought_merch: true, attended_show: true, attended_multiple: false, runs_fan_page: false, creates_content: true, frequent_dms: true },
    { handle: 'carolcartwright19', platform: 'instagram', real_name: 'Carol Cartwright', city: null, fan_type: 'hyper', commented_repeatedly: true, shared_reposted: true, bought_merch: false, attended_show: true, attended_multiple: true, runs_fan_page: false, creates_content: false, frequent_dms: true },
    { handle: 'mechitgal80', platform: 'instagram', real_name: 'Mechita', city: null, fan_type: 'standard', commented_repeatedly: true, shared_reposted: true, bought_merch: false, attended_show: false, attended_multiple: false, runs_fan_page: false, creates_content: true, frequent_dms: true },
    { handle: 'cronkme', platform: 'instagram', real_name: 'Caitlin', city: 'Omaha', fan_type: 'standard', commented_repeatedly: true, shared_reposted: true, bought_merch: true, attended_show: true, attended_multiple: false, runs_fan_page: false, creates_content: false, frequent_dms: true },
    { handle: 'realtonyluu', platform: 'instagram', real_name: 'Tony Luu', city: 'Denver', fan_type: 'hyper', commented_repeatedly: true, shared_reposted: true, bought_merch: true, attended_show: true, attended_multiple: true, runs_fan_page: false, creates_content: true, frequent_dms: false },
    { handle: 'https_idkneverfound', platform: 'instagram', real_name: 'Chloey Chadwick', city: 'Denver', fan_type: 'hyper', commented_repeatedly: true, shared_reposted: true, bought_merch: true, attended_show: true, attended_multiple: true, runs_fan_page: false, creates_content: true, frequent_dms: false },
    { handle: 'pineapple.madness_666', platform: 'instagram', real_name: 'Katie Berrie', city: 'Denver', fan_type: 'hyper', commented_repeatedly: true, shared_reposted: true, bought_merch: true, attended_show: true, attended_multiple: true, runs_fan_page: false, creates_content: true, frequent_dms: false },
    { handle: 'punnkin', platform: 'tiktok', real_name: null, city: null, fan_type: null, commented_repeatedly: true, shared_reposted: true, bought_merch: false, attended_show: false, attended_multiple: false, runs_fan_page: false, creates_content: false, frequent_dms: true },
    { handle: 'radrachel892', platform: 'tiktok', real_name: 'Rachel Egle', city: 'Cleveland', fan_type: null, commented_repeatedly: true, shared_reposted: true, bought_merch: true, attended_show: true, attended_multiple: true, runs_fan_page: false, creates_content: false, frequent_dms: true },
    { handle: 'hucking_filarious', platform: 'tiktok', real_name: null, city: 'Denver', fan_type: null, commented_repeatedly: true, shared_reposted: true, bought_merch: true, attended_show: true, attended_multiple: false, runs_fan_page: false, creates_content: false, frequent_dms: true },
    { handle: 'inthevillage', platform: 'tiktok', real_name: 'Rachelle Dawn', city: null, fan_type: null, commented_repeatedly: true, shared_reposted: true, bought_merch: false, attended_show: false, attended_multiple: false, runs_fan_page: false, creates_content: false, frequent_dms: true },
    { handle: 'tonithepirate', platform: 'tiktok', real_name: 'Toni Rivera', city: 'San Luis Obispo', fan_type: null, commented_repeatedly: false, shared_reposted: true, bought_merch: true, attended_show: true, attended_multiple: false, runs_fan_page: false, creates_content: false, frequent_dms: true },
    { handle: 'luluanncustoms', platform: 'tiktok', real_name: 'LuLu Ann Customs', city: 'Cincinnati', fan_type: null, commented_repeatedly: true, shared_reposted: true, bought_merch: true, attended_show: true, attended_multiple: false, runs_fan_page: false, creates_content: false, frequent_dms: true },
    { handle: 'nicolekelly011', platform: 'tiktok', real_name: 'Nicole Kelly', city: null, fan_type: null, commented_repeatedly: true, shared_reposted: true, bought_merch: true, attended_show: true, attended_multiple: true, runs_fan_page: false, creates_content: false, frequent_dms: true },
    { handle: 'kel9210', platform: 'tiktok', real_name: 'Kelly', city: 'Portland', fan_type: null, commented_repeatedly: true, shared_reposted: false, bought_merch: true, attended_show: true, attended_multiple: true, runs_fan_page: false, creates_content: false, frequent_dms: false },
    { handle: 'candypantzzz24', platform: 'tiktok', real_name: null, city: null, fan_type: null, commented_repeatedly: true, shared_reposted: true, bought_merch: true, attended_show: true, attended_multiple: false, runs_fan_page: false, creates_content: false, frequent_dms: true },
    { handle: '_dar_333', platform: 'tiktok', real_name: null, city: null, fan_type: null, commented_repeatedly: true, shared_reposted: true, bought_merch: false, attended_show: false, attended_multiple: false, runs_fan_page: false, creates_content: false, frequent_dms: true },
    { handle: 'dwizzlebrother', platform: 'tiktok', real_name: null, city: 'Ohio', fan_type: null, commented_repeatedly: true, shared_reposted: true, bought_merch: true, attended_show: true, attended_multiple: false, runs_fan_page: false, creates_content: false, frequent_dms: true },
    { handle: 'cheesin_danish', platform: 'instagram', real_name: 'Dana', city: 'Denver', fan_type: null, commented_repeatedly: true, shared_reposted: true, bought_merch: true, attended_show: true, attended_multiple: false, runs_fan_page: false, creates_content: false, frequent_dms: false },
    { handle: 'joscelynnmills', platform: 'instagram', real_name: 'Joscelyn Mills', city: 'Montana', fan_type: null, commented_repeatedly: true, shared_reposted: true, bought_merch: false, attended_show: true, attended_multiple: false, runs_fan_page: false, creates_content: true, frequent_dms: true },
  ];

  try {
    // Create a "pre-tour" show entry for imported data
    let showId;
    const existing = await pool.query("SELECT id FROM shows WHERE venue = 'Spreadsheet Import'");
    if (existing.rows.length > 0) {
      showId = existing.rows[0].id;
    } else {
      const r = await pool.query("INSERT INTO shows (date, city, venue, capacity) VALUES ('2026-03-01', 'Pre-Tour', 'Spreadsheet Import', 0) RETURNING id");
      showId = r.rows[0].id;
    }

    let count = 0;
    for (const f of fans) {
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

      await pool.query(
        `INSERT INTO sightings (fan_id, show_id, entered_by, commented_repeatedly, shared_reposted, bought_merch, attended_show, attended_multiple, runs_fan_page, creates_content, frequent_dms, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [fanRes.rows[0].id, showId, 'spreadsheet-import', f.commented_repeatedly, f.shared_reposted, f.bought_merch, f.attended_show, f.attended_multiple, f.runs_fan_page, f.creates_content, f.frequent_dms, 'Imported from pre-tour spreadsheet']
      );
      count++;
    }

    res.json({ success: true, imported: count });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------- API ROUTES ----------

// Get all shows
app.get('/api/shows', requireAuth, async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM shows ORDER BY date');
  res.json(rows);
});

// Get tonight's show (closest to today)
app.get('/api/shows/tonight', requireAuth, async (req, res) => {
  const { rows } = await pool.query(`
    SELECT * FROM shows
    ORDER BY ABS(date - CURRENT_DATE)
    LIMIT 1
  `);
  res.json(rows[0] || null);
});

// Add a fan
app.post('/api/fans', requireAuth, async (req, res) => {
  const { handle, platform, real_name, city, fan_type, notes } = req.body;
  try {
    const { rows } = await pool.query(
      `INSERT INTO fans (handle, platform, real_name, city, fan_type, notes)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (handle, platform) DO UPDATE SET
         real_name = COALESCE(EXCLUDED.real_name, fans.real_name),
         city = COALESCE(EXCLUDED.city, fans.city),
         fan_type = COALESCE(EXCLUDED.fan_type, fans.fan_type),
         notes = COALESCE(EXCLUDED.notes, fans.notes)
       RETURNING *`,
      [handle.toLowerCase().trim(), platform, real_name, city, fan_type, notes]
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Search fans (for autocomplete)
app.get('/api/fans/search', requireAuth, async (req, res) => {
  const q = `%${(req.query.q || '').toLowerCase()}%`;
  const { rows } = await pool.query(
    `SELECT * FROM fans WHERE LOWER(handle) LIKE $1 OR LOWER(real_name) LIKE $1 ORDER BY handle LIMIT 10`,
    [q]
  );
  res.json(rows);
});

// Log a sighting
app.post('/api/sightings', requireAuth, async (req, res) => {
  const {
    fan_id, show_id, entered_by,
    commented_repeatedly, shared_reposted, bought_merch,
    attended_show, attended_multiple, runs_fan_page,
    creates_content, frequent_dms, merch_items, notes
  } = req.body;
  try {
    const { rows } = await pool.query(
      `INSERT INTO sightings (fan_id, show_id, entered_by,
        commented_repeatedly, shared_reposted, bought_merch,
        attended_show, attended_multiple, runs_fan_page,
        creates_content, frequent_dms, merch_items, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       RETURNING *`,
      [fan_id, show_id, entered_by,
       commented_repeatedly || false, shared_reposted || false, bought_merch || false,
       attended_show || true, attended_multiple || false, runs_fan_page || false,
       creates_content || false, frequent_dms || false, merch_items, notes]
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Dashboard: top fans with scores
app.get('/api/dashboard', requireAuth, async (req, res) => {
  const { rows } = await pool.query(`
    SELECT
      f.id, f.handle, f.platform, f.real_name, f.city, f.fan_type, f.notes,
      COUNT(DISTINCT s.show_id) AS shows_attended,
      CASE WHEN BOOL_OR(s.commented_repeatedly) THEN 3 ELSE 0 END +
      CASE WHEN BOOL_OR(s.shared_reposted) THEN 4 ELSE 0 END +
      CASE WHEN BOOL_OR(s.bought_merch) THEN 5 ELSE 0 END +
      CASE WHEN BOOL_OR(s.attended_show) THEN 3 ELSE 0 END +
      CASE WHEN COUNT(DISTINCT s.show_id) > 1 THEN 10 ELSE 0 END +
      CASE WHEN BOOL_OR(s.runs_fan_page) THEN 8 ELSE 0 END +
      CASE WHEN BOOL_OR(s.creates_content) THEN 6 ELSE 0 END +
      CASE WHEN BOOL_OR(s.frequent_dms) THEN 2 ELSE 0 END +
      (COUNT(DISTINCT s.show_id) - 1) * 3 AS score,
      MAX(s.created_at) AS last_seen
    FROM fans f
    LEFT JOIN sightings s ON s.fan_id = f.id
    GROUP BY f.id
    ORDER BY score DESC
  `);
  res.json(rows);
});

// CSV Export (matches original spreadsheet format)
app.get('/api/export.csv', requireAuth, async (req, res) => {
  const { rows } = await pool.query(`
    SELECT
      f.handle AS "Fan Handle",
      f.platform AS "Platform",
      f.real_name AS "Real Name",
      f.city AS "City",
      CASE WHEN BOOL_OR(s.commented_repeatedly) THEN 'YES' ELSE 'NO' END AS "Commented Repeatedly",
      CASE WHEN BOOL_OR(s.shared_reposted) THEN 'YES' ELSE 'NO' END AS "Shared/Reposted",
      CASE WHEN BOOL_OR(s.bought_merch) THEN 'YES' ELSE 'NO' END AS "Bought Merch",
      CASE WHEN BOOL_OR(s.attended_show) THEN 'YES' ELSE 'NO' END AS "Attended Show",
      CASE WHEN COUNT(DISTINCT s.show_id) > 1 OR BOOL_OR(s.attended_multiple) THEN 'YES' ELSE 'NO' END AS "Attended Multiple Shows",
      CASE WHEN BOOL_OR(s.runs_fan_page) THEN 'YES' ELSE 'NO' END AS "Runs Fan Page",
      CASE WHEN BOOL_OR(s.creates_content) THEN 'YES' ELSE 'NO' END AS "Creates Content / Edits",
      CASE WHEN BOOL_OR(s.frequent_dms) THEN 'YES' ELSE 'NO' END AS "Frequent DMs / Replies",
      f.fan_type AS "Fan Type",
      f.notes AS "Notes",
      CASE WHEN BOOL_OR(s.commented_repeatedly) THEN 3 ELSE 0 END +
      CASE WHEN BOOL_OR(s.shared_reposted) THEN 4 ELSE 0 END +
      CASE WHEN BOOL_OR(s.bought_merch) THEN 5 ELSE 0 END +
      CASE WHEN BOOL_OR(s.attended_show) THEN 3 ELSE 0 END +
      CASE WHEN COUNT(DISTINCT s.show_id) > 1 OR BOOL_OR(s.attended_multiple) THEN 10 ELSE 0 END +
      CASE WHEN BOOL_OR(s.runs_fan_page) THEN 8 ELSE 0 END +
      CASE WHEN BOOL_OR(s.creates_content) THEN 6 ELSE 0 END +
      CASE WHEN BOOL_OR(s.frequent_dms) THEN 2 ELSE 0 END +
      GREATEST(COUNT(DISTINCT s.show_id) - 1, 0) * 3 AS "Score"
    FROM fans f
    LEFT JOIN sightings s ON s.fan_id = f.id
    GROUP BY f.id
    ORDER BY "Score" DESC
  `);

  const headers = ['Fan Handle','Platform','Real Name','City','Commented Repeatedly','Shared/Reposted','Bought Merch','Attended Show','Attended Multiple Shows','Runs Fan Page','Creates Content / Edits','Frequent DMs / Replies','Fan Type','Notes','Score'];
  const csvRows = [headers.join(',')];
  for (const r of rows) {
    csvRows.push(headers.map(h => {
      const val = r[h] ?? '';
      const str = String(val);
      return str.includes(',') || str.includes('"') || str.includes('\n') ? '"' + str.replace(/"/g, '""') + '"' : str;
    }).join(','));
  }

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="fan-intel-export.csv"');
  res.send(csvRows.join('\n'));
});

// Stats
app.get('/api/stats', requireAuth, async (req, res) => {
  const fans = await pool.query('SELECT COUNT(*) FROM fans');
  const sightings = await pool.query('SELECT COUNT(*) FROM sightings');
  const shows = await pool.query('SELECT COUNT(DISTINCT show_id) FROM sightings');
  const topCity = await pool.query(`
    SELECT city, COUNT(*) as cnt FROM fans WHERE city IS NOT NULL
    GROUP BY city ORDER BY cnt DESC LIMIT 5
  `);
  res.json({
    total_fans: parseInt(fans.rows[0].count),
    total_sightings: parseInt(sightings.rows[0].count),
    shows_logged: parseInt(shows.rows[0].count),
    top_cities: topCity.rows
  });
});

// Get all sightings for a fan
app.get('/api/fans/:id/sightings', requireAuth, async (req, res) => {
  const { rows } = await pool.query(`
    SELECT s.*, sh.city, sh.venue, sh.date
    FROM sightings s
    JOIN shows sh ON sh.id = s.show_id
    WHERE s.fan_id = $1
    ORDER BY sh.date DESC
  `, [req.params.id]);
  res.json(rows);
});

// ---------- START ----------

initDB().then(() => {
  app.listen(port, () => {
    console.log(`Fan Intel running on port ${port}`);
  });
}).catch(err => {
  console.error('DB init failed:', err);
  process.exit(1);
});

