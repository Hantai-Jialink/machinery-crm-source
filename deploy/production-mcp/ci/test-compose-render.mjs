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
  /http:\/\/localhost:3000\//,
  'FastGPT v4.15.2 liveness check must use the public root endpoint; authenticated readiness is verified separately',
);
assert.equal(
  services['fastgpt-canary'].environment.INVOKE_TOKEN_SECRET,
  'REPLACE_WITH_CANARY_INVOKE_TOKEN_SECRET',
  'FastGPT v4.15.2 must receive a dedicated Canary invoke-token secret',
);
assert.equal(
  services['fastgpt-canary'].environment.PG_URL,
  'postgresql://postgres:REPLACE_WITH_CANARY_AIPROXY_POSTGRES_PASSWORD@fastgpt-canary-aiproxy-postgres:5432/fastgpt',
  'FastGPT must use the isolated fastgpt vector database instead of localhost PostgreSQL',
);
assert.equal(
  services['fastgpt-canary'].environment.PLUGIN_BASE_URL,
  'http://fastgpt-canary-plugin:3000',
  'FastGPT v4.15.2 must use the isolated plugin service instead of localhost:3004',
);
assert.equal(
  services['fastgpt-canary'].environment.PLUGIN_TOKEN,
  'REPLACE_WITH_CANARY_FASTGPT_PLUGIN_TOKEN',
  'FastGPT must receive a dedicated Canary plugin token',
);
assert.equal(
  services['fastgpt-canary'].depends_on['fastgpt-canary-plugin'].condition,
  'service_healthy',
  'FastGPT must wait for plugin startup before instrumentation checks',
);
assert.equal(
  services['fastgpt-canary-plugin'].image,
  'ghcr.io/labring/fastgpt-plugin:v1.0.2@sha256:a1a63eeef3d49c2a81db466243cf3ac88d9156b158076d4eece13e892dcd007f',
  'Plugin image must pin the approved v1.0.2 AMD64 digest',
);
assert.equal(
  services['fastgpt-canary-plugin'].environment.MONGODB_URI,
  'mongodb://REPLACE_WITH_CANARY_MONGO_USER:REPLACE_WITH_CANARY_MONGO_PASSWORD@fastgpt-canary-mongo:27017/fastgpt-plugin?authSource=admin&replicaSet=rs0',
  'Plugin must use its own Mongo database',
);
assert.deepEqual(
  Object.keys(services['fastgpt-canary-plugin'].networks).sort(),
  ['fastgpt-canary-ai-egress', 'fastgpt-canary-data'],
  'Plugin must use only the Canary data and controlled egress networks',
);
assert.equal(
  services['fastgpt-canary'].depends_on['fastgpt-canary-pg-init'].condition,
  'service_completed_successfully',
  'FastGPT must wait for its vector database initialization',
);
assert.equal(
  services['fastgpt-canary-pg-init'].depends_on['fastgpt-canary-aiproxy-postgres'].condition,
  'service_healthy',
  'The vector database initializer must wait for PostgreSQL health',
);
assert.deepEqual(
  Object.keys(services['fastgpt-canary-pg-init'].networks),
  ['fastgpt-canary-data'],
  'The vector database initializer must remain on the internal data network only',
);
assert.match(
  JSON.stringify(services['fastgpt-canary-pg-init'].command),
  /CREATE DATABASE fastgpt/,
  'The vector database initializer must create the isolated fastgpt database idempotently',
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
