require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');
const multer = require('multer');

const app = express();
const port = process.env.PORT || 3000;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

const anthropic = process.env.ANTHROPIC_API_KEY ? new Anthropic() : null;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

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
  // Create artists table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS artists (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      slug TEXT NOT NULL UNIQUE,
      color TEXT DEFAULT '#ff6b35',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS shows (
      id SERIAL PRIMARY KEY,
      artist_id INTEGER REFERENCES artists(id) ON DELETE CASCADE,
      date DATE NOT NULL,
      city TEXT NOT NULL,
      venue TEXT NOT NULL,
      capacity INTEGER,
      notes TEXT
    );

    CREATE TABLE IF NOT EXISTS fans (
      id SERIAL PRIMARY KEY,
      artist_id INTEGER REFERENCES artists(id) ON DELETE CASCADE,
      handle TEXT NOT NULL,
      platform TEXT NOT NULL DEFAULT 'instagram',
      real_name TEXT,
      city TEXT,
      fan_type TEXT,
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(handle, platform, artist_id)
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

  // Seed default artists if none exist
  const { rows: artistRows } = await pool.query('SELECT COUNT(*) FROM artists');
  if (parseInt(artistRows[0].count) === 0) {
    await pool.query(`INSERT INTO artists (name, slug, color) VALUES ('Two Feet', 'two-feet', '#ff6b35')`);
    await pool.query(`INSERT INTO artists (name, slug, color) VALUES ('Brothel', 'brothel', '#a855f7')`);
  }

  // Migrate: if shows exist without artist_id, assign them to Two Feet
  try {
    await pool.query(`ALTER TABLE shows ADD COLUMN IF NOT EXISTS artist_id INTEGER REFERENCES artists(id) ON DELETE CASCADE`);
    await pool.query(`ALTER TABLE fans ADD COLUMN IF NOT EXISTS artist_id INTEGER REFERENCES artists(id) ON DELETE CASCADE`);
    const tf = await pool.query(`SELECT id FROM artists WHERE slug = 'two-feet'`);
    if (tf.rows.length > 0) {
      await pool.query(`UPDATE shows SET artist_id = $1 WHERE artist_id IS NULL`, [tf.rows[0].id]);
      await pool.query(`UPDATE fans SET artist_id = $1 WHERE artist_id IS NULL`, [tf.rows[0].id]);
    }
    // Update unique constraint on fans to include artist_id
    await pool.query(`ALTER TABLE fans DROP CONSTRAINT IF EXISTS fans_handle_platform_key`);
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS fans_handle_platform_artist ON fans(handle, platform, artist_id)`);
  } catch (e) {
    // Columns/constraints may already exist
  }

  // Seed shows if empty
  const { rows } = await pool.query('SELECT COUNT(*) FROM shows');
  if (parseInt(rows[0].count) === 0) {
    await seedShows();
  }
}

async function seedShows() {
  const tf = await pool.query(`SELECT id FROM artists WHERE slug = 'two-feet'`);
  const artistId = tf.rows[0]?.id;
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
      'INSERT INTO shows (artist_id, date, city, venue, capacity) VALUES ($1, $2, $3, $4, $5)',
      [artistId, date, city, venue, capacity]
    );
  }
}

// ---------- SEED FROM XLSX (accurate data) ----------

app.post('/api/reseed-xlsx', requireAuth, async (req, res) => {
  // Get Two Feet artist ID for seeding
  const tfResult = await pool.query(`SELECT id FROM artists WHERE slug = 'two-feet'`);
  const seedArtistId = tfResult.rows[0]?.id;
  const fans = [
    // --- Original 20 fans (updated from latest spreadsheet) ---
    { handle: 'rachel_erin_80', platform: 'instagram', real_name: 'Rachel Erin', city: 'Chicago', fan_type: 'evangelist', commented_repeatedly: true, shared_reposted: true, bought_merch: true, attended_show: true, attended_multiple: true, runs_fan_page: false, creates_content: true, frequent_dms: true },
    { handle: 'carolcartwright19', platform: 'instagram', real_name: 'carol cartwright', city: 'unknown', fan_type: 'hyper', commented_repeatedly: true, shared_reposted: true, bought_merch: false, attended_show: true, attended_multiple: true, runs_fan_page: false, creates_content: false, frequent_dms: true },
    { handle: 'mechitgal80', platform: 'instagram', real_name: 'Mechita', city: 'unknown', fan_type: 'standard', commented_repeatedly: true, shared_reposted: true, bought_merch: false, attended_show: false, attended_multiple: false, runs_fan_page: false, creates_content: true, frequent_dms: true },
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
    { handle: 'joscelynnmills', platform: 'instagram', real_name: 'Joscelyn mills', city: 'Montana', fan_type: null, commented_repeatedly: true, shared_reposted: true, bought_merch: false, attended_show: true, attended_multiple: false, runs_fan_page: false, creates_content: true, frequent_dms: true },
    // --- 31 new fans from updated spreadsheet (Mar 2026) ---
    { handle: 'something.about.cami', platform: 'instagram', real_name: 'Cameron', city: 'Denver', fan_type: null, commented_repeatedly: false, shared_reposted: true, bought_merch: false, attended_show: true, attended_multiple: false, runs_fan_page: false, creates_content: true, frequent_dms: false, notes: null },
    { handle: 'bjones1514', platform: 'instagram', real_name: null, city: 'Denver', fan_type: null, commented_repeatedly: false, shared_reposted: true, bought_merch: false, attended_show: true, attended_multiple: true, runs_fan_page: false, creates_content: false, frequent_dms: true, notes: null },
    { handle: 'im.diego.loblondoo', platform: 'instagram', real_name: 'Diego', city: 'Denver', fan_type: null, commented_repeatedly: true, shared_reposted: true, bought_merch: false, attended_show: true, attended_multiple: true, runs_fan_page: false, creates_content: false, frequent_dms: true, notes: null },
    { handle: 'zachfigurski', platform: 'instagram', real_name: 'Zachariah Figurski', city: 'Denver', fan_type: null, commented_repeatedly: false, shared_reposted: true, bought_merch: false, attended_show: true, attended_multiple: true, runs_fan_page: false, creates_content: false, frequent_dms: false, notes: null },
    { handle: 'garrey.81', platform: 'instagram', real_name: null, city: 'Mexico City', fan_type: null, commented_repeatedly: true, shared_reposted: true, bought_merch: true, attended_show: true, attended_multiple: true, runs_fan_page: false, creates_content: true, frequent_dms: true, notes: null },
    { handle: 'ca1danxe', platform: 'instagram', real_name: null, city: 'Denver', fan_type: null, commented_repeatedly: false, shared_reposted: true, bought_merch: false, attended_show: true, attended_multiple: false, runs_fan_page: false, creates_content: true, frequent_dms: true, notes: null },
    { handle: 'itsjess.nicole', platform: 'instagram', real_name: 'Jessica Owen', city: 'Denver', fan_type: null, commented_repeatedly: false, shared_reposted: true, bought_merch: false, attended_show: true, attended_multiple: false, runs_fan_page: false, creates_content: false, frequent_dms: false, notes: null },
    { handle: 'destanitrujillo', platform: 'instagram', real_name: null, city: 'Denver', fan_type: null, commented_repeatedly: false, shared_reposted: true, bought_merch: false, attended_show: true, attended_multiple: false, runs_fan_page: false, creates_content: false, frequent_dms: true, notes: null },
    { handle: 'leah.campau', platform: 'instagram', real_name: 'Leah Campau', city: 'Denver', fan_type: null, commented_repeatedly: false, shared_reposted: true, bought_merch: false, attended_show: true, attended_multiple: false, runs_fan_page: false, creates_content: false, frequent_dms: false, notes: null },
    { handle: 'elise._.lillian', platform: 'instagram', real_name: 'Elsie Clark', city: 'Denver', fan_type: null, commented_repeatedly: false, shared_reposted: true, bought_merch: false, attended_show: true, attended_multiple: false, runs_fan_page: false, creates_content: false, frequent_dms: false, notes: null },
    { handle: 'lxfitz21', platform: 'instagram', real_name: 'Alex Fitzsimons', city: 'Denver', fan_type: null, commented_repeatedly: false, shared_reposted: true, bought_merch: false, attended_show: true, attended_multiple: false, runs_fan_page: false, creates_content: false, frequent_dms: false, notes: null },
    { handle: 'danilouisef', platform: 'instagram', real_name: 'Dani', city: 'Denver', fan_type: null, commented_repeatedly: false, shared_reposted: true, bought_merch: false, attended_show: true, attended_multiple: false, runs_fan_page: false, creates_content: false, frequent_dms: false, notes: null },
    { handle: 'matt_lafka', platform: 'instagram', real_name: 'Matt Hlavka', city: 'Denver', fan_type: null, commented_repeatedly: false, shared_reposted: true, bought_merch: false, attended_show: true, attended_multiple: false, runs_fan_page: false, creates_content: false, frequent_dms: false, notes: null },
    { handle: 'emo.scrubs', platform: 'instagram', real_name: 'MIC', city: 'Denver', fan_type: null, commented_repeatedly: true, shared_reposted: true, bought_merch: true, attended_show: true, attended_multiple: true, runs_fan_page: false, creates_content: false, frequent_dms: false, notes: null },
    { handle: 'tlevvaa', platform: 'instagram', real_name: 'Taylor Leanne Evans', city: 'Denver', fan_type: null, commented_repeatedly: true, shared_reposted: true, bought_merch: true, attended_show: true, attended_multiple: true, runs_fan_page: false, creates_content: false, frequent_dms: false, notes: null },
    { handle: 'jay__robins', platform: 'instagram', real_name: 'Jay Robins', city: 'Denver', fan_type: null, commented_repeatedly: false, shared_reposted: true, bought_merch: false, attended_show: true, attended_multiple: true, runs_fan_page: false, creates_content: false, frequent_dms: false, notes: null },
    { handle: 'jessieeeeee.miller', platform: 'instagram', real_name: 'Jessica Miller', city: 'Denver', fan_type: null, commented_repeatedly: false, shared_reposted: true, bought_merch: false, attended_show: true, attended_multiple: true, runs_fan_page: false, creates_content: false, frequent_dms: false, notes: null },
    { handle: 'sk8ter_bbgrl__', platform: 'instagram', real_name: null, city: 'Denver', fan_type: null, commented_repeatedly: true, shared_reposted: true, bought_merch: true, attended_show: true, attended_multiple: true, runs_fan_page: false, creates_content: false, frequent_dms: false, notes: null },
    { handle: 'colinphotos1', platform: 'instagram', real_name: null, city: 'Denver', fan_type: null, commented_repeatedly: false, shared_reposted: true, bought_merch: true, attended_show: true, attended_multiple: true, runs_fan_page: false, creates_content: false, frequent_dms: false, notes: null },
    { handle: 'zeeequeee4', platform: 'instagram', real_name: 'Jen Staples', city: 'Denver', fan_type: null, commented_repeatedly: false, shared_reposted: true, bought_merch: true, attended_show: true, attended_multiple: false, runs_fan_page: false, creates_content: false, frequent_dms: false, notes: 'many shows' },
    { handle: 'sophia.swensonn', platform: 'instagram', real_name: 'Sophia Swenson', city: 'Denver', fan_type: null, commented_repeatedly: true, shared_reposted: true, bought_merch: true, attended_show: true, attended_multiple: true, runs_fan_page: false, creates_content: true, frequent_dms: false, notes: 'doesnt follow' },
    { handle: 'h4rt.coco', platform: 'instagram', real_name: null, city: 'Denver', fan_type: null, commented_repeatedly: false, shared_reposted: true, bought_merch: false, attended_show: true, attended_multiple: true, runs_fan_page: false, creates_content: false, frequent_dms: false, notes: 'doesnt follow, attended multiple shows' },
    { handle: '_justnoodlen_', platform: 'instagram', real_name: 'Adyn Elizabeth', city: 'Denver', fan_type: null, commented_repeatedly: false, shared_reposted: true, bought_merch: false, attended_show: true, attended_multiple: false, runs_fan_page: false, creates_content: false, frequent_dms: false, notes: 'doesnt follow' },
    { handle: 'jeanmap0', platform: 'tiktok', real_name: 'Maggie', city: 'Denver', fan_type: null, commented_repeatedly: false, shared_reposted: true, bought_merch: false, attended_show: true, attended_multiple: true, runs_fan_page: false, creates_content: false, frequent_dms: false, notes: 'doesnt follow' },
    { handle: 'oregonhottie', platform: 'tiktok', real_name: null, city: 'Denver', fan_type: null, commented_repeatedly: false, shared_reposted: true, bought_merch: false, attended_show: true, attended_multiple: false, runs_fan_page: false, creates_content: false, frequent_dms: false, notes: 'follows me' },
    { handle: 'aidyrae', platform: 'tiktok', real_name: null, city: 'Denver', fan_type: null, commented_repeatedly: false, shared_reposted: true, bought_merch: true, attended_show: true, attended_multiple: false, runs_fan_page: false, creates_content: false, frequent_dms: false, notes: 'follows me' },
    { handle: '_0alara0_', platform: 'tiktok', real_name: null, city: 'Denver', fan_type: null, commented_repeatedly: false, shared_reposted: true, bought_merch: true, attended_show: true, attended_multiple: false, runs_fan_page: false, creates_content: false, frequent_dms: false, notes: 'follows me' },
    { handle: 'rando56787', platform: 'tiktok', real_name: null, city: 'Denver', fan_type: null, commented_repeatedly: true, shared_reposted: true, bought_merch: true, attended_show: true, attended_multiple: false, runs_fan_page: true, creates_content: true, frequent_dms: false, notes: 'fan page' },
    { handle: 'holy.misfit', platform: 'tiktok', real_name: null, city: 'Denver', fan_type: null, commented_repeatedly: true, shared_reposted: true, bought_merch: true, attended_show: true, attended_multiple: false, runs_fan_page: false, creates_content: false, frequent_dms: false, notes: 'doesnt follow me' },
    { handle: 'babyasian0891', platform: 'tiktok', real_name: null, city: 'Seattle', fan_type: null, commented_repeatedly: true, shared_reposted: true, bought_merch: true, attended_show: true, attended_multiple: false, runs_fan_page: false, creates_content: false, frequent_dms: false, notes: 'follows me' },
    { handle: 'brooklynmariesmith', platform: 'tiktok', real_name: 'Brooklyn Smith', city: 'Spokane', fan_type: null, commented_repeatedly: true, shared_reposted: true, bought_merch: true, attended_show: true, attended_multiple: false, runs_fan_page: false, creates_content: false, frequent_dms: false, notes: null },
    { handle: 'artistanomaly_', platform: 'instagram', real_name: null, city: 'Omaha', fan_type: 'evangelist', commented_repeatedly: true, shared_reposted: true, bought_merch: true, attended_show: true, attended_multiple: true, runs_fan_page: false, creates_content: true, frequent_dms: true, notes: 'met at meet & greet, non-binary artist, crossover brothel fan, 725 followers' },
  ];

  try {
    // Delete old spreadsheet-imported sightings and orphaned fans
    await pool.query("DELETE FROM sightings WHERE entered_by = 'spreadsheet-import'");
    // Delete fans that have no sightings left (orphaned from old import)
    await pool.query("DELETE FROM fans WHERE id NOT IN (SELECT DISTINCT fan_id FROM sightings)");

    // Get or create pre-tour show
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
        `INSERT INTO fans (handle, platform, real_name, city, fan_type, notes, artist_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (handle, platform, artist_id) DO UPDATE SET
           real_name = COALESCE(EXCLUDED.real_name, fans.real_name),
           city = COALESCE(EXCLUDED.city, fans.city),
           fan_type = COALESCE(EXCLUDED.fan_type, fans.fan_type),
           notes = COALESCE(EXCLUDED.notes, fans.notes)
         RETURNING id`,
        [f.handle.toLowerCase().trim(), f.platform.toLowerCase().trim(), f.real_name, f.city, f.fan_type, f.notes || null, seedArtistId]
      );

      await pool.query(
        `INSERT INTO sightings (fan_id, show_id, entered_by, commented_repeatedly, shared_reposted, bought_merch, attended_show, attended_multiple, runs_fan_page, creates_content, frequent_dms, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [fanRes.rows[0].id, showId, 'spreadsheet-import', f.commented_repeatedly, f.shared_reposted, f.bought_merch, f.attended_show, f.attended_multiple, f.runs_fan_page, f.creates_content, f.frequent_dms, f.notes || 'Imported from xlsx']
      );
      count++;
    }

    res.json({ success: true, imported: count });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------- RESEED BROTHEL SIGHTINGS (varied scores) ----------

app.post('/api/reseed-brothel', requireAuth, async (req, res) => {
  try {
    const brothelResult = await pool.query(`SELECT id FROM artists WHERE slug = 'brothel'`);
    if (brothelResult.rows.length === 0) return res.status(400).json({ error: 'Brothel artist not found' });
    const artistId = brothelResult.rows[0].id;

    // Get the screenshot import show
    const showResult = await pool.query("SELECT id FROM shows WHERE venue = 'Screenshot Import' AND artist_id = $1", [artistId]);
    if (showResult.rows.length === 0) return res.status(400).json({ error: 'No import show found' });
    const showId = showResult.rows[0].id;

    // Delete ALL sightings for Brothel fans
    await pool.query(`DELETE FROM sightings WHERE fan_id IN (SELECT id FROM fans WHERE artist_id = $1)`, [artistId]);

    // Get all Brothel fans
    const { rows: fans } = await pool.query('SELECT id FROM fans WHERE artist_id = $1 ORDER BY id', [artistId]);

    // Behavior point values:
    // shared_reposted=5, bought_merch=8, attended_show=6, attended_multiple=10,
    // runs_fan_page=7, creates_content=7, frequent_dms=4, commented_repeatedly=0 (not in score)
    // Target range: 6 to 40

    const behaviorSets = [
      // score ~6: just attended_show(6)
      { attended_show: true },
      // score ~9: shared_reposted(5) + frequent_dms(4)
      { shared_reposted: true, frequent_dms: true },
      // score ~10: attended_show(6) + frequent_dms(4)
      { attended_show: true, frequent_dms: true },
      // score ~11: attended_show(6) + shared_reposted(5)
      { attended_show: true, shared_reposted: true },
      // score ~13: creates_content(7) + attended_show(6)
      { creates_content: true, attended_show: true },
      // score ~14: bought_merch(8) + attended_show(6)
      { bought_merch: true, attended_show: true },
      // score ~16: attended_show(6) + shared_reposted(5) + frequent_dms(4) + commented
      { attended_show: true, shared_reposted: true, frequent_dms: true, commented_repeatedly: true },
      // score ~18: creates_content(7) + attended_show(6) + shared_reposted(5)
      { creates_content: true, attended_show: true, shared_reposted: true },
      // score ~19: bought_merch(8) + attended_show(6) + shared_reposted(5)
      { bought_merch: true, attended_show: true, shared_reposted: true },
      // score ~21: creates_content(7) + bought_merch(8) + attended_show(6)
      { creates_content: true, bought_merch: true, attended_show: true },
      // score ~24: creates_content(7) + attended_show(6) + shared_reposted(5) + frequent_dms(4) + commented
      { creates_content: true, attended_show: true, shared_reposted: true, frequent_dms: true, commented_repeatedly: true },
      // score ~25: creates_content(7) + bought_merch(8) + attended_show(6) + frequent_dms(4)
      { creates_content: true, bought_merch: true, attended_show: true, frequent_dms: true },
      // score ~30: creates_content(7) + bought_merch(8) + attended_show(6) + shared_reposted(5) + frequent_dms(4)
      { creates_content: true, bought_merch: true, attended_show: true, shared_reposted: true, frequent_dms: true },
      // score ~33: creates_content(7) + runs_fan_page(7) + bought_merch(8) + attended_show(6) + shared_reposted(5)
      { creates_content: true, runs_fan_page: true, bought_merch: true, attended_show: true, shared_reposted: true },
      // score ~37: all minus attended_multiple
      { creates_content: true, runs_fan_page: true, bought_merch: true, attended_show: true, shared_reposted: true, frequent_dms: true },
      // score ~40: big combo with multiple shows
      { creates_content: true, bought_merch: true, attended_show: true, attended_multiple: true, shared_reposted: true, frequent_dms: true },
    ];

    // Distribute: more fans at low scores, fewer at high (pyramid)
    // weights: heavier at the bottom
    const weights = [5, 4, 4, 4, 4, 3, 3, 3, 3, 2, 2, 2, 2, 2, 1, 1];
    const pool2 = [];
    for (let i = 0; i < weights.length; i++) {
      for (let j = 0; j < weights[i]; j++) pool2.push(behaviorSets[i]);
    }

    let count = 0;
    for (const fan of fans) {
      const behaviors = pool2[count % pool2.length];
      await pool.query(
        `INSERT INTO sightings (fan_id, show_id, entered_by,
          commented_repeatedly, shared_reposted, bought_merch,
          attended_show, attended_multiple, runs_fan_page,
          creates_content, frequent_dms)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [fan.id, showId, 'score-seed',
         behaviors.commented_repeatedly || false,
         behaviors.shared_reposted || false,
         behaviors.bought_merch || false,
         behaviors.attended_show || false,
         behaviors.attended_multiple || false,
         behaviors.runs_fan_page || false,
         behaviors.creates_content || false,
         behaviors.frequent_dms || false]
      );
      count++;
    }

    res.json({ success: true, reseeded: count });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------- IMPORT BROTHEL FANS ----------

app.post('/api/import-brothel-fans', requireAuth, async (req, res) => {
  try {
    const brothelResult = await pool.query(`SELECT id FROM artists WHERE slug = 'brothel'`);
    if (brothelResult.rows.length === 0) {
      return res.status(400).json({ error: 'Brothel artist not found' });
    }
    const artistId = brothelResult.rows[0].id;

    // Get or create a placeholder show for screenshot imports
    let showId;
    const existing = await pool.query("SELECT id FROM shows WHERE venue = 'Screenshot Import' AND artist_id = $1", [artistId]);
    if (existing.rows.length > 0) {
      showId = existing.rows[0].id;
    } else {
      const r = await pool.query("INSERT INTO shows (artist_id, date, city, venue, capacity) VALUES ($1, '2026-03-16', 'Pre-Tour', 'Screenshot Import', 0) RETURNING id", [artistId]);
      showId = r.rows[0].id;
    }

    const fans = require('./brothel-fans-extracted.json');
    let count = 0;

    for (const f of fans) {
      const fanRes = await pool.query(
        `INSERT INTO fans (handle, platform, real_name, city, artist_id, notes)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (handle, platform, artist_id) DO UPDATE SET
           real_name = COALESCE(EXCLUDED.real_name, fans.real_name),
           city = COALESCE(EXCLUDED.city, fans.city),
           notes = COALESCE(EXCLUDED.notes, fans.notes)
         RETURNING id`,
        [f.handle.toLowerCase().trim(), f.platform, f.real_name, f.city, artistId, f.context]
      );

      // Check if sighting already exists
      const existingSighting = await pool.query(
        'SELECT id FROM sightings WHERE fan_id = $1 AND show_id = $2',
        [fanRes.rows[0].id, showId]
      );

      if (existingSighting.rows.length === 0) {
        await pool.query(
          `INSERT INTO sightings (fan_id, show_id, entered_by, shared_reposted, creates_content, notes)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [fanRes.rows[0].id, showId, 'screenshot-import', true, true, f.context]
        );
      }
      count++;
    }

    res.json({ success: true, imported: count, artist: 'brothel' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------- SCREENSHOT SCAN ----------

app.post('/api/scan-screenshot', requireAuth, upload.single('screenshot'), async (req, res) => {
  if (!anthropic) return res.status(500).json({ error: 'AI not configured' });
  if (!req.file) return res.status(400).json({ error: 'No image uploaded' });

  try {
    const base64 = req.file.buffer.toString('base64');
    const mediaType = req.file.mimetype || 'image/jpeg';

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 500,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: mediaType, data: base64 }
          },
          {
            type: 'text',
            text: `Extract fan profile info from this social media screenshot. Return ONLY valid JSON with these fields:
{
  "handle": "username without @",
  "platform": "instagram" or "tiktok" or "other",
  "real_name": "display name or null",
  "city": "city from bio or null"
}
If you can't determine a field, use null. Only return the JSON object, nothing else.`
          }
        ]
      }]
    });

    const text = response.content[0].text.trim();
    // Extract JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return res.status(500).json({ error: 'Could not parse AI response' });

    const data = JSON.parse(jsonMatch[0]);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------- ARTIST ROUTES ----------

app.get('/api/artists', requireAuth, async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM artists ORDER BY name');
  res.json(rows);
});

app.post('/api/artists', requireAuth, async (req, res) => {
  const { name, color } = req.body;
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  try {
    const { rows } = await pool.query(
      'INSERT INTO artists (name, slug, color) VALUES ($1, $2, $3) RETURNING *',
      [name, slug, color || '#ff6b35']
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------- ARTIST SHOWS ----------

app.post('/api/artists/:artistId/shows', requireAuth, async (req, res) => {
  const { date, city, venue, capacity, notes } = req.body;
  try {
    const { rows } = await pool.query(
      'INSERT INTO shows (artist_id, date, city, venue, capacity, notes) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [req.params.artistId, date, city, venue, capacity, notes]
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------- API ROUTES ----------

// Get all shows (filtered by artist)
app.get('/api/shows', requireAuth, async (req, res) => {
  const artistId = req.query.artist_id;
  if (!artistId) {
    const { rows } = await pool.query('SELECT * FROM shows ORDER BY date');
    return res.json(rows);
  }
  const { rows } = await pool.query('SELECT * FROM shows WHERE artist_id = $1 ORDER BY date', [artistId]);
  res.json(rows);
});

// Get tonight's show (closest to today, filtered by artist)
app.get('/api/shows/tonight', requireAuth, async (req, res) => {
  const artistId = req.query.artist_id;
  if (artistId) {
    const { rows } = await pool.query(`
      SELECT * FROM shows WHERE artist_id = $1
      ORDER BY ABS(date - CURRENT_DATE)
      LIMIT 1
    `, [artistId]);
    res.json(rows[0] || null);
  } else {
    const { rows } = await pool.query(`
      SELECT * FROM shows
      ORDER BY ABS(date - CURRENT_DATE)
      LIMIT 1
    `);
    res.json(rows[0] || null);
  }
});

// Add a fan
app.post('/api/fans', requireAuth, async (req, res) => {
  const { handle, platform, real_name, city, fan_type, notes, artist_id } = req.body;
  try {
    const { rows } = await pool.query(
      `INSERT INTO fans (handle, platform, real_name, city, fan_type, notes, artist_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (handle, platform, artist_id) DO UPDATE SET
         real_name = COALESCE(EXCLUDED.real_name, fans.real_name),
         city = COALESCE(EXCLUDED.city, fans.city),
         fan_type = COALESCE(EXCLUDED.fan_type, fans.fan_type),
         notes = COALESCE(EXCLUDED.notes, fans.notes)
       RETURNING *`,
      [handle.toLowerCase().trim(), platform, real_name, city, fan_type, notes, artist_id]
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Search fans (for autocomplete)
app.get('/api/fans/search', requireAuth, async (req, res) => {
  const q = `%${(req.query.q || '').toLowerCase()}%`;
  const artistId = req.query.artist_id;
  if (artistId) {
    const { rows } = await pool.query(
      `SELECT * FROM fans WHERE artist_id = $1 AND (LOWER(handle) LIKE $2 OR LOWER(real_name) LIKE $2) ORDER BY handle LIMIT 10`,
      [artistId, q]
    );
    return res.json(rows);
  }
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
  const artistId = req.query.artist_id;
  const whereClause = artistId ? 'WHERE f.artist_id = $1' : '';
  const params = artistId ? [artistId] : [];
  const { rows } = await pool.query(`
    SELECT
      f.id, f.handle, f.platform, f.real_name, f.city, f.fan_type, f.notes,
      COUNT(DISTINCT s.show_id) AS shows_attended,
      CASE WHEN BOOL_OR(s.shared_reposted) THEN 5 ELSE 0 END +
      CASE WHEN BOOL_OR(s.bought_merch) THEN 8 ELSE 0 END +
      CASE WHEN BOOL_OR(s.attended_show) THEN 6 ELSE 0 END +
      CASE WHEN COUNT(DISTINCT s.show_id) > 1 OR BOOL_OR(s.attended_multiple) THEN 10 ELSE 0 END +
      CASE WHEN BOOL_OR(s.runs_fan_page) THEN 7 ELSE 0 END +
      CASE WHEN BOOL_OR(s.creates_content) THEN 7 ELSE 0 END +
      CASE WHEN BOOL_OR(s.frequent_dms) THEN 4 ELSE 0 END +
      GREATEST(COUNT(DISTINCT s.show_id) - 1, 0) * 3 AS score,
      MAX(s.created_at) AS last_seen
    FROM fans f
    LEFT JOIN sightings s ON s.fan_id = f.id
    ${whereClause}
    GROUP BY f.id
    ORDER BY score DESC
  `, params);
  res.json(rows);
});

// CSV Export (matches original spreadsheet format)
app.get('/api/export.csv', requireAuth, async (req, res) => {
  const artistId = req.query.artist_id;
  const whereClause = artistId ? 'WHERE f.artist_id = $1' : '';
  const params = artistId ? [artistId] : [];
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
      CASE WHEN BOOL_OR(s.shared_reposted) THEN 5 ELSE 0 END +
      CASE WHEN BOOL_OR(s.bought_merch) THEN 8 ELSE 0 END +
      CASE WHEN BOOL_OR(s.attended_show) THEN 6 ELSE 0 END +
      CASE WHEN COUNT(DISTINCT s.show_id) > 1 OR BOOL_OR(s.attended_multiple) THEN 10 ELSE 0 END +
      CASE WHEN BOOL_OR(s.runs_fan_page) THEN 7 ELSE 0 END +
      CASE WHEN BOOL_OR(s.creates_content) THEN 7 ELSE 0 END +
      CASE WHEN BOOL_OR(s.frequent_dms) THEN 4 ELSE 0 END +
      GREATEST(COUNT(DISTINCT s.show_id) - 1, 0) * 3 AS "Score"
    FROM fans f
    LEFT JOIN sightings s ON s.fan_id = f.id
    ${whereClause}
    GROUP BY f.id
    ORDER BY "Score" DESC
  `, params);

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
  const artistId = req.query.artist_id;
  if (artistId) {
    const fans = await pool.query('SELECT COUNT(*) FROM fans WHERE artist_id = $1', [artistId]);
    const sightings = await pool.query('SELECT COUNT(*) FROM sightings WHERE fan_id IN (SELECT id FROM fans WHERE artist_id = $1)', [artistId]);
    const shows = await pool.query('SELECT COUNT(DISTINCT show_id) FROM sightings WHERE fan_id IN (SELECT id FROM fans WHERE artist_id = $1)', [artistId]);
    const topCity = await pool.query(`
      SELECT city, COUNT(*) as cnt FROM fans WHERE artist_id = $1 AND city IS NOT NULL
      GROUP BY city ORDER BY cnt DESC LIMIT 5
    `, [artistId]);
    return res.json({
      total_fans: parseInt(fans.rows[0].count),
      total_sightings: parseInt(sightings.rows[0].count),
      shows_logged: parseInt(shows.rows[0].count),
      top_cities: topCity.rows
    });
  }
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

// ---------- INSIGHTS ----------

// Crossover fans (appear in multiple artist profiles)
app.get('/api/insights/crossover', requireAuth, async (req, res) => {
  const { rows } = await pool.query(`
    SELECT f.handle, f.platform, array_agg(DISTINCT a.name) AS artists,
           array_agg(DISTINCT a.id) AS artist_ids,
           COUNT(DISTINCT f.artist_id) AS artist_count
    FROM fans f
    JOIN artists a ON a.id = f.artist_id
    GROUP BY f.handle, f.platform
    HAVING COUNT(DISTINCT f.artist_id) > 1
    ORDER BY artist_count DESC, f.handle
  `);
  res.json(rows);
});

// Insights for a specific artist
app.get('/api/insights', requireAuth, async (req, res) => {
  try {
  const artistId = req.query.artist_id;
  if (!artistId) return res.status(400).json({ error: 'artist_id required' });

  // City breakdown
  const cities = await pool.query(`
    SELECT city, COUNT(*) as count FROM fans
    WHERE artist_id = $1 AND city IS NOT NULL AND LOWER(city) != 'unknown'
    GROUP BY city ORDER BY count DESC LIMIT 15
  `, [artistId]);

  // Platform breakdown
  const platforms = await pool.query(`
    SELECT platform, COUNT(*) as count FROM fans
    WHERE artist_id = $1
    GROUP BY platform ORDER BY count DESC
  `, [artistId]);

  // Behavior breakdown — per-fan aggregation then count
  const behaviors = await pool.query(`
    SELECT
      BOOL_OR(s.bought_merch) as bought_merch,
      BOOL_OR(s.attended_show) as attended_show,
      BOOL_OR(s.creates_content) as creates_content,
      BOOL_OR(s.shared_reposted) as shared_reposted,
      BOOL_OR(s.frequent_dms) as frequent_dms,
      BOOL_OR(s.runs_fan_page) as runs_fan_page,
      BOOL_OR(s.commented_repeatedly) as commented_repeatedly,
      CASE WHEN COUNT(DISTINCT s.show_id) > 1 OR BOOL_OR(s.attended_multiple) THEN true ELSE false END as multi_show
    FROM fans f
    LEFT JOIN sightings s ON s.fan_id = f.id
    WHERE f.artist_id = $1
    GROUP BY f.id
  `, [artistId]);

  const beh = { total_fans: 0, merch_buyers: 0, show_attendees: 0, content_creators: 0, sharers: 0, dms: 0, fan_pages: 0, commenters: 0, multi_show: 0 };
  for (const row of behaviors.rows) {
    beh.total_fans++;
    if (row.bought_merch) beh.merch_buyers++;
    if (row.attended_show) beh.show_attendees++;
    if (row.creates_content) beh.content_creators++;
    if (row.shared_reposted) beh.sharers++;
    if (row.frequent_dms) beh.dms++;
    if (row.runs_fan_page) beh.fan_pages++;
    if (row.commented_repeatedly) beh.commenters++;
    if (row.multi_show) beh.multi_show++;
  }

  // Score distribution (buckets)
  const scoreDist = await pool.query(`
    SELECT tier, COUNT(*) as count FROM (
      SELECT
        CASE
          WHEN score <= 10 THEN 'casual'
          WHEN score <= 20 THEN 'engaged'
          WHEN score <= 30 THEN 'super'
          ELSE 'evangelist'
        END AS tier
      FROM (
        SELECT f.id,
          CASE WHEN BOOL_OR(s.shared_reposted) THEN 5 ELSE 0 END +
          CASE WHEN BOOL_OR(s.bought_merch) THEN 8 ELSE 0 END +
          CASE WHEN BOOL_OR(s.attended_show) THEN 6 ELSE 0 END +
          CASE WHEN COUNT(DISTINCT s.show_id) > 1 OR BOOL_OR(s.attended_multiple) THEN 10 ELSE 0 END +
          CASE WHEN BOOL_OR(s.runs_fan_page) THEN 7 ELSE 0 END +
          CASE WHEN BOOL_OR(s.creates_content) THEN 7 ELSE 0 END +
          CASE WHEN BOOL_OR(s.frequent_dms) THEN 4 ELSE 0 END +
          GREATEST(COUNT(DISTINCT s.show_id) - 1, 0) * 3 AS score
        FROM fans f
        LEFT JOIN sightings s ON s.fan_id = f.id
        WHERE f.artist_id = $1
        GROUP BY f.id
      ) scored
    ) tiered
    GROUP BY tier
    ORDER BY CASE tier WHEN 'casual' THEN 1 WHEN 'engaged' THEN 2 WHEN 'super' THEN 3 ELSE 4 END
  `, [artistId]);

  // Top amplifiers (content creators + sharers with highest scores)
  const amplifiers = await pool.query(`
    SELECT f.id, f.handle, f.platform, f.real_name, f.city, f.notes,
      CASE WHEN BOOL_OR(s.shared_reposted) THEN 5 ELSE 0 END +
      CASE WHEN BOOL_OR(s.bought_merch) THEN 8 ELSE 0 END +
      CASE WHEN BOOL_OR(s.attended_show) THEN 6 ELSE 0 END +
      CASE WHEN COUNT(DISTINCT s.show_id) > 1 OR BOOL_OR(s.attended_multiple) THEN 10 ELSE 0 END +
      CASE WHEN BOOL_OR(s.runs_fan_page) THEN 7 ELSE 0 END +
      CASE WHEN BOOL_OR(s.creates_content) THEN 7 ELSE 0 END +
      CASE WHEN BOOL_OR(s.frequent_dms) THEN 4 ELSE 0 END +
      GREATEST(COUNT(DISTINCT s.show_id) - 1, 0) * 3 AS score
    FROM fans f
    LEFT JOIN sightings s ON s.fan_id = f.id
    WHERE f.artist_id = $1 AND (
      EXISTS (SELECT 1 FROM sightings s2 WHERE s2.fan_id = f.id AND s2.creates_content = true)
      OR EXISTS (SELECT 1 FROM sightings s2 WHERE s2.fan_id = f.id AND s2.shared_reposted = true)
    )
    GROUP BY f.id
    ORDER BY score DESC
    LIMIT 10
  `, [artistId]);

  res.json({
    cities: cities.rows,
    platforms: platforms.rows,
    behaviors: beh,
    score_tiers: scoreDist.rows,
    top_amplifiers: amplifiers.rows
  });
  } catch (err) {
    console.error('Insights error:', err);
    res.status(500).json({ error: err.message });
  }
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

