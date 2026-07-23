import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const [archiveDirectory, expectedTag, outputFile] = process.argv.slice(2);
if (!archiveDirectory || !expectedTag || !outputFile) {
  throw new Error('Usage: node inspect-docker-archive.mjs <archive-directory> <expected-tag> <output-json>');
}

const manifest = JSON.parse(fs.readFileSync(path.join(archiveDirectory, 'manifest.json'), 'utf8'));
const entry = manifest.find((item) => item.RepoTags?.includes(expectedTag));
assert.ok(entry, 'Docker archive RepoTags do not contain the expected image tag');
const configFile = path.join(archiveDirectory, entry.Config);
const configDigest = `sha256:${createHash('sha256').update(fs.readFileSync(configFile)).digest('hex')}`;
assert.equal(path.basename(entry.Config), `${configDigest.slice('sha256:'.length)}.json`, 'Docker archive Config filename digest mismatch');
const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
assert.equal(config.os, 'linux');
assert.equal(config.architecture, 'amd64');

fs.writeFileSync(outputFile, `${JSON.stringify({
  format: 'docker-archive',
  repoTag: expectedTag,
  configDigest,
  os: config.os,
  architecture: config.architecture,
}, null, 2)}\n`);
console.log('MCP_DOCKER_ARCHIVE_IDENTITY=PASS');
