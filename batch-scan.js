require('dotenv').config();
const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs');
const path = require('path');

const anthropic = new Anthropic();
const SCREENSHOT_DIR = '/Users/hufford/Downloads/brothel screenshots';

async function scanScreenshot(filePath) {
  const buffer = fs.readFileSync(filePath);
  const base64 = buffer.toString('base64');
  const ext = path.extname(filePath).toLowerCase();
  const mediaType = ext === '.png' ? 'image/png' : 'image/jpeg';

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1000,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
        {
          type: 'text',
          text: `This is a screenshot from Instagram related to the artist "Brothel" (@brothel.brothel).
Extract ALL fan/user profiles visible in this screenshot. This could be:
- A tagged post (the poster's handle is at the top)
- A profile page (the handle and bio are visible)
- A post with comments (extract commenter handles)
- Multiple users visible

For EACH user you can identify, return their info. Skip the artist's own account (brothel.brothel).
Skip any accounts that appear to be the artist's management or official accounts.

Return ONLY valid JSON array:
[{
  "handle": "username without @",
  "platform": "instagram",
  "real_name": "display name or null",
  "city": "city from bio/location or null",
  "context": "brief note: tagged brothel, profile page, commenter, etc."
}]
If multiple users are visible, include all of them. If no fan profiles are visible, return [].
Only return the JSON array, nothing else.`
        }
      ]
    }]
  });

  const text = response.content[0].text.trim();
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return [];
  try {
    return JSON.parse(jsonMatch[0]);
  } catch {
    console.error(`  Failed to parse JSON for ${path.basename(filePath)}`);
    return [];
  }
}

async function main() {
  const files = fs.readdirSync(SCREENSHOT_DIR)
    .filter(f => /\.(png|jpg|jpeg)$/i.test(f))
    .sort();

  console.log(`Found ${files.length} screenshots to process\n`);

  const allFans = new Map(); // handle -> fan data (dedup)

  // Process in batches of 5 to avoid rate limits
  for (let i = 0; i < files.length; i += 5) {
    const batch = files.slice(i, i + 5);
    const results = await Promise.all(
      batch.map(async (file) => {
        const filePath = path.join(SCREENSHOT_DIR, file);
        console.log(`Scanning ${file}...`);
        try {
          return await scanScreenshot(filePath);
        } catch (err) {
          console.error(`  Error: ${err.message}`);
          return [];
        }
      })
    );

    for (const fans of results) {
      for (const fan of fans) {
        if (!fan.handle) continue;
        const key = fan.handle.toLowerCase().replace(/^@/, '');
        if (key === 'brothel.brothel' || key === 'brothel') continue;
        if (!allFans.has(key)) {
          allFans.set(key, { ...fan, handle: key });
        } else {
          // Merge: keep non-null values
          const existing = allFans.get(key);
          if (!existing.real_name && fan.real_name) existing.real_name = fan.real_name;
          if (!existing.city && fan.city) existing.city = fan.city;
          if (fan.context) existing.context = (existing.context || '') + '; ' + fan.context;
        }
      }
    }

    console.log(`  Batch done. ${allFans.size} unique fans so far.\n`);

    // Small delay between batches
    if (i + 5 < files.length) await new Promise(r => setTimeout(r, 1000));
  }

  // Output results
  const fanList = [...allFans.values()];
  console.log(`\n===== RESULTS =====`);
  console.log(`Total unique fans extracted: ${fanList.length}\n`);

  for (const fan of fanList) {
    console.log(`  @${fan.handle} (${fan.platform})${fan.real_name ? ' - ' + fan.real_name : ''}${fan.city ? ' [' + fan.city + ']' : ''}`);
    if (fan.context) console.log(`    Context: ${fan.context}`);
  }

  // Save to JSON for importing
  const outputPath = path.join(__dirname, 'brothel-fans-extracted.json');
  fs.writeFileSync(outputPath, JSON.stringify(fanList, null, 2));
  console.log(`\nSaved to ${outputPath}`);
}

main().catch(console.error);
