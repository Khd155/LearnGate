// One-off importer for a quiz-skills level's question bank (10 skills × 5
// questions = 50 questions per level), authored under scripts/seed-data/.
// Mirrors the admin bulk-import pattern already used for general-tests.
//
// Usage:
//   API_BASE=https://learngate.khormi.site/api DEV_KEY=xxxx node scripts/seed-quiz-level.mjs seed-data/quiz-easy-level.json
//
// Safe to re-run: uses action:'append' and the server skips any qnum that
// already exists for that skill, so it will never duplicate questions.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const API_BASE = process.env.API_BASE || 'http://localhost:8788/api';
const DEV_KEY = process.env.DEV_KEY;
const seedFile = process.argv[2];

if (!DEV_KEY) {
  console.error('Set DEV_KEY env var (the same DEV_KEY configured on the server).');
  process.exit(1);
}
if (!seedFile) {
  console.error('Usage: node scripts/seed-quiz-level.mjs <path-to-seed-json>');
  process.exit(1);
}

const seed = JSON.parse(readFileSync(join(__dirname, seedFile), 'utf8'));

async function main() {
  const devRes = await fetch(`${API_BASE}/auth/dev`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: DEV_KEY }),
  });
  if (!devRes.ok) throw new Error(`Dev auth failed: ${devRes.status} ${await devRes.text()}`);
  const { token } = await devRes.json();

  let totalAdded = 0, totalSkipped = 0;
  for (const [quizSkillId, questions] of Object.entries(seed)) {
    const res = await fetch(`${API_BASE}/quiz-skills/${quizSkillId}/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ action: 'append', questions }),
    });
    const data = await res.json();
    if (!res.ok) {
      console.error(`✗ ${quizSkillId}: ${res.status} ${JSON.stringify(data)}`);
      continue;
    }
    console.log(`✓ ${quizSkillId}: added ${data.added}, skipped ${data.skipped}`);
    totalAdded += data.added;
    totalSkipped += data.skipped;
  }
  console.log(`\nDone. Added ${totalAdded}, skipped ${totalSkipped} (already existed).`);
}

main().catch(e => { console.error(e); process.exit(1); });
