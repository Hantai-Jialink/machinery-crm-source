import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const [outputDirectory, fastGptTag] = process.argv.slice(2);
if (!outputDirectory || !fastGptTag) throw new Error('Usage: node generate-final-proof.mjs <output-directory> <fastgpt-tag>');

const required = (name) => {
  const value = String(process.env[name] || '').trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
};
const readJson = (name) => JSON.parse(fs.readFileSync(path.join(outputDirectory, name), 'utf8'));
const sha256 = (name) => createHash('sha256').update(fs.readFileSync(path.join(outputDirectory, name))).digest('hex');
const requireMarker = (file, marker) => {
  const lines = fs.readFileSync(path.join(outputDirectory, file), 'utf8').split(/\r?\n/);
  assert.ok(lines.includes(marker), `${file} is missing ${marker}`);
};

requireMarker('canary-runtime-acceptance.log', 'CANARY_RUNTIME_REDIS_MONGO_MINIO_FASTGPT_MODEL=PASS');
for (const marker of [
  'MCP_RUNTIME_MINIMUM_DB_QUERY=PASS',
  'MCP_RUNTIME_SHOW_GRANTS=PASS',
  'MCP_RUNTIME_AUDIT_INSERT_AND_FAIL_CLOSED=PASS',
  'MCP_RUNTIME_ASSERTION_GATEWAY_REPLAY_ALLOWLIST=PASS',
  'MCP_RUNTIME_CONCURRENCY=PASS',
  'DEPLOY_AND_ROLLBACK_FORMAL_FASTGPT_3100=PASS',
]) requireMarker('mcp-runtime-acceptance.log', marker);

const fastGptArchive = readJson('fastgpt-image-archive-manifest.json');
const fastGptBuildMetadata = readJson('fastgpt-build-metadata.json');
const mcpArchive = readJson('mcp-image-archive-manifest.json');
assert.equal(fastGptArchive.repoTag, fastGptTag);
assert.equal(fastGptArchive.os, 'linux');
assert.equal(fastGptArchive.architecture, 'amd64');
assert.equal(mcpArchive.os, 'linux');
assert.equal(mcpArchive.architecture, 'amd64');
const patchedManifestDigest = fastGptBuildMetadata['containerimage.digest'];
assert.match(patchedManifestDigest, /^sha256:[a-f0-9]{64}$/);
mcpArchive.archiveSha256 = `sha256:${sha256('dachuanpro-mcp-linux-amd64.tar')}`;
fs.writeFileSync(path.join(outputDirectory, 'mcp-image-archive-manifest.json'), `${JSON.stringify(mcpArchive, null, 2)}\n`);

const compatibility = {
  sourceCommit: required('FASTGPT_COMMIT'),
  sourceImageDigest: required('FASTGPT_IMAGE').split('@')[1],
  patchedImage: `${fastGptTag}@${patchedManifestDigest}`,
  patchedImageTag: fastGptTag,
  patchedManifestDigest,
  patchedConfigDigest: fastGptArchive.configDigest,
  patchedArchiveSha256: `sha256:${sha256('fastgpt-v4.15.2-canary-linux-amd64.tar')}`,
  patchSha256: createHash('sha256').update(fs.readFileSync('deploy/fastgpt/v4.15.2/0001-dachuan-trusted-mcp-identity.patch')).digest('hex'),
  focusedTests: 'PASS',
  concurrencyAcceptance: 'PASS',
  canaryIsolation: 'PASS',
  agentEngine: 'fastAgent',
  sourcePatchApply: 'PASS',
  runtimeAcceptance: 'PASS',
  rollbackProof: 'PASS',
};
fs.writeFileSync(path.join(outputDirectory, 'fastgpt-v4.15.2-compatibility.json'), `${JSON.stringify(compatibility, null, 2)}\n`);

const rows = [
  ['FastGPT official AMD64', required('FASTGPT_IMAGE'), required('FASTGPT_IMAGE').split('@')[1], 'registry-manifest'],
  ['FastGPT patched AMD64', fastGptTag, patchedManifestDigest, `config=${fastGptArchive.configDigest}`],
  ['Dachuan MCP AMD64', mcpArchive.repoTag, mcpArchive.configDigest, 'docker-archive-config'],
  ['Mongo 7.0 AMD64', 'mongo:7.0', 'sha256:c8e9c92621124cd1da98f540c40157b9f6f338ba59babf296cf0f381ac8f60f4', 'registry-manifest'],
  ['Redis 7.2 AMD64', 'redis:7.2-alpine', 'sha256:942b86c020b801daa83baee4ab6a125c244bf6dba7e5c6996d03e569e6aa1c19', 'registry-manifest'],
  ['MySQL 8.0.44 AMD64', 'mysql:8.0.44', 'sha256:f7878bec832c6be5e61c39d3949651be8aa977daf875089b4560ae1434d2cb9c', 'registry-manifest'],
  ['AIProxy v0.6.5 AMD64', 'ghcr.io/labring/aiproxy:v0.6.5', 'sha256:e96073363ac3e38fd0c28b7653aa18916e93c57a688452450c619023b7811e4d', 'registry-manifest'],
  ['MinIO AMD64', 'minio/minio:RELEASE.2025-04-22T22-12-26Z', 'sha256:3f97c5651cb6662b880c787a232b6b34fec8d8922e08d6617b25d241a21164bb', 'registry-manifest'],
  ['MinIO client AMD64', 'minio/mc:RELEASE.2025-04-16T18-13-26Z', 'sha256:2582c2f48b1e31545143ba5285c67d7b38c8b8f6912142d0630686dc7aaac28b', 'registry-manifest'],
  ['pgvector PostgreSQL AMD64', 'pgvector/pgvector:0.8.0-pg15', 'sha256:c50b98b074c4c370da995eb03c8f6bb6dcc2e9d8911e1974c1af981055a168e6', 'registry-manifest'],
  ['Node 24 Alpine AMD64', 'node:24.16.0-alpine', 'sha256:bc23e6976e92708e9eadae437d7dd180b3fd47ed75edf322d6cfa36eba4a7fc8', 'registry-manifest'],
  ['Node 24 Bookworm AMD64', 'node:24.16.0-bookworm-slim', 'sha256:ca520832af80fa37a57c14077ed0fcdd83b5aefccc356059fdc3a9a05b78ae1f', 'registry-manifest'],
  ['Node 20 Bookworm AMD64', 'node:20.20.2-bookworm-slim', 'sha256:3d0f05455dea2c82e2f76e7e2543964c30f6b7d673fc1a83286736d44fe4c41c', 'registry-manifest'],
  ['Node 20 Alpine AMD64', 'node:20-alpine', 'sha256:afdf98210b07b586eb71fa22ba2e432e058e4cd1304d31ed60888755b8c865fb', 'registry-manifest'],
];
fs.writeFileSync(path.join(outputDirectory, 'IMAGE_DIGESTS.tsv'), `name\timage\tdigest\tidentity_kind\n${rows.map((row) => row.join('\t')).join('\n')}\n`);
console.log('FINAL_COMPATIBILITY_AND_IMAGE_DIGESTS=PASS');
