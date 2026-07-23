import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const [envFile] = process.argv.slice(2);
if (!envFile) throw new Error('Usage: node verify-fastgpt-artifact.mjs <production-env-file>');

const values = Object.fromEntries(fs.readFileSync(envFile, 'utf8').split(/\r?\n/)
  .filter((line) => line && !line.trimStart().startsWith('#'))
  .map((line) => {
    const index = line.indexOf('=');
    if (index < 1) throw new Error(`Invalid environment line: ${line}`);
    return [line.slice(0, index), line.slice(index + 1)];
  }));
const deployDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const archive = values.FASTGPT_CANARY_ARCHIVE;
const expectedTag = values.FASTGPT_CANARY_IMAGE;
const proofPath = path.resolve(path.dirname(envFile), values.FASTGPT_CANARY_COMPATIBILITY_PROOF);
assert.ok(path.isAbsolute(archive) && fs.statSync(archive).isFile(), 'FastGPT Canary archive is missing');
const proof = JSON.parse(fs.readFileSync(proofPath, 'utf8'));
const archiveDigest = `sha256:${createHash('sha256').update(fs.readFileSync(archive)).digest('hex')}`;
assert.equal(archiveDigest, proof.patchedArchiveSha256, 'FastGPT Canary archive SHA256 mismatch');

const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'dachuan-fastgpt-archive-'));
try {
  const extract = spawnSync('tar', ['-xf', archive, '-C', temporaryDirectory], { encoding: 'utf8' });
  assert.equal(extract.status, 0, extract.stderr || extract.stdout);
  const resultFile = path.join(temporaryDirectory, 'identity.json');
  const inspect = spawnSync(process.execPath, [path.join(deployDirectory, 'ci', 'inspect-docker-archive.mjs'), temporaryDirectory, expectedTag, resultFile], { encoding: 'utf8' });
  assert.equal(inspect.status, 0, inspect.stderr || inspect.stdout);
  const identity = JSON.parse(fs.readFileSync(resultFile, 'utf8'));
  assert.equal(identity.repoTag, proof.patchedImageTag);
  assert.equal(identity.configDigest, proof.patchedConfigDigest);
  assert.equal(identity.os, 'linux');
  assert.equal(identity.architecture, 'amd64');
} finally {
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
}

console.log('FASTGPT_CANARY_ARCHIVE_IDENTITY=PASS');
