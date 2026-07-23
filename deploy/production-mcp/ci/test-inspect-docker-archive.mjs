import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const directory = path.dirname(fileURLToPath(import.meta.url));
const inspector = path.join(directory, 'inspect-docker-archive.mjs');
const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'docker-archive-inspector-'));
const expectedTag = 'dachuan-test:identity';
const configContents = Buffer.from(`${JSON.stringify({ os: 'linux', architecture: 'amd64' })}\n`);
const configHex = createHash('sha256').update(configContents).digest('hex');

const runFixture = (name, configPath) => {
  const archiveDirectory = path.join(temporaryRoot, name);
  const outputFile = path.join(temporaryRoot, `${name}.json`);
  fs.mkdirSync(path.dirname(path.join(archiveDirectory, configPath)), { recursive: true });
  fs.writeFileSync(path.join(archiveDirectory, configPath), configContents);
  fs.writeFileSync(path.join(archiveDirectory, 'manifest.json'), `${JSON.stringify([{
    Config: configPath,
    RepoTags: [expectedTag],
    Layers: [],
  }])}\n`);
  const result = spawnSync(process.execPath, [inspector, archiveDirectory, expectedTag, outputFile], { encoding: 'utf8' });
  return { outputFile, result };
};

try {
  const buildx = runFixture('buildx', `blobs/sha256/${configHex}`);
  assert.equal(buildx.result.status, 0, buildx.result.stderr);
  assert.deepEqual(JSON.parse(fs.readFileSync(buildx.outputFile, 'utf8')), {
    format: 'docker-archive',
    repoTag: expectedTag,
    configDigest: `sha256:${configHex}`,
    os: 'linux',
    architecture: 'amd64',
  });

  const dockerSave = runFixture('docker-save', `${configHex}.json`);
  assert.equal(dockerSave.result.status, 0, dockerSave.result.stderr);

  const mismatched = runFixture('mismatched', `${'0'.repeat(64)}.json`);
  assert.notEqual(mismatched.result.status, 0, 'Mismatched Config filename digest must be rejected');
} finally {
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
}

console.log('DOCKER_ARCHIVE_INSPECTOR_TEST=PASS');
