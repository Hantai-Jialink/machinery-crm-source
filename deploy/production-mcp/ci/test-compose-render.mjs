import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ciDirectory = path.dirname(fileURLToPath(import.meta.url));
const deployDirectory = path.resolve(ciDirectory, '..');
const composeFile = path.join(deployDirectory, 'fastgpt-canary-compose.yml');
const envFile = path.join(deployDirectory, '.env.production.example');

const rendered = spawnSync('docker', [
  'compose',
  '--env-file', envFile,
  '-f', composeFile,
  'config',
  '--format', 'json',
], { encoding: 'utf8' });

assert.equal(rendered.status, 0, rendered.stderr || rendered.stdout);
const config = JSON.parse(rendered.stdout);
const services = config.services;

assert.deepEqual(
  services['fastgpt-canary-mongo-key-init'].entrypoint,
  ['/bin/bash', '/usr/local/bin/dachuan-mongo-key-init'],
  'Mongo key initializer must execute one mounted script instead of a shell-split command scalar',
);
assert.deepEqual(
  services['fastgpt-canary-minio-init'].entrypoint,
  ['/bin/sh', '/usr/local/bin/dachuan-minio-init'],
  'MinIO initializer must execute one mounted script instead of a shell-split command scalar',
);
assert.equal(services['fastgpt-canary-mongo-key-init'].command, null);
assert.equal(services['fastgpt-canary-minio-init'].command, null);

assert.match(
  JSON.stringify(services['fastgpt-canary'].healthcheck.test),
  /http:\/\/127\.0\.0\.1:3000\/health/,
  'FastGPT v4.15.2 healthcheck must use the upstream /health endpoint',
);
assert.equal(
  services['fastgpt-canary'].environment.INVOKE_TOKEN_SECRET,
  'REPLACE_WITH_CANARY_INVOKE_TOKEN_SECRET',
  'FastGPT v4.15.2 must receive a dedicated Canary invoke-token secret',
);
assert.ok(
  Object.hasOwn(services['fastgpt-canary'].networks, 'fastgpt-canary-ai-egress'),
  'FastGPT must be attached to the controlled egress network',
);
assert.deepEqual(
  Object.keys(services['fastgpt-canary-aiproxy-postgres'].networks),
  ['fastgpt-canary-data'],
  'AIProxy PostgreSQL must remain on the internal data network only',
);

console.log('PRODUCTION_COMPOSE_RENDER=PASS');
