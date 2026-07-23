import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'dachuan-secret-scan-'));
const scanner = path.join(path.dirname(fileURLToPath(import.meta.url)), 'scan-artifact-secrets.mjs');
const run = () => spawnSync(process.execPath, [scanner, directory], { encoding: 'utf8' });
try {
  fs.writeFileSync(path.join(directory, 'safe.env'), 'AGENT_GATEWAY_FASTGPT_API_KEY=REPLACE_WITH_DEDICATED_KEY\nDATABASE_URL=REPLACE_WITH_DATABASE_URL\n');
  const safe = run();
  assert.equal(safe.status, 0, safe.stderr);
  assert.match(safe.stdout, /ARTIFACT_SECRET_SCAN=PASS/);

  fs.writeFileSync(path.join(directory, 'unsafe.env'), 'DATABASE_URL=mysql://real-user:real-password@db/production\n');
  const unsafe = run();
  assert.notEqual(unsafe.status, 0);
  assert.match(unsafe.stderr, /Non-placeholder database URL/);
  fs.rmSync(path.join(directory, 'unsafe.env'));

  const privateKeyFixture = `${['-----BEGIN', 'PRIVATE KEY-----'].join(' ')}\nnot-a-real-key\n${['-----END', 'PRIVATE KEY-----'].join(' ')}\n`;
  fs.writeFileSync(path.join(directory, 'key.pem'), privateKeyFixture);
  const privateKey = run();
  assert.notEqual(privateKey.status, 0);
  assert.match(privateKey.stderr, /Private key material/);
  console.log('ARTIFACT_SECRET_SCAN_TEST=PASS');
} finally {
  fs.rmSync(directory, { recursive: true, force: true });
}
