import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = path.dirname(fileURLToPath(import.meta.url));
const read = (name) => fs.readFileSync(path.join(directory, name), 'utf8');

const validator = read('validate-production-env.mjs');
assert.match(validator, /b9b6e2305e70823c9706291de4b19c4dc3ae05f6/);
assert.match(validator, /8f09f9dd41c17aecec6bbe69a332432fdf4e686546f050d65e670bda60aa2033/);
assert.match(validator, /fastAgent/);
assert.doesNotMatch(validator, /\['default', 'pi'\]/);
for (const resource of ['MONGO', 'REDIS', 'OBJECT_STORAGE', 'APP', 'USER', 'SESSION', 'API_KEY']) {
  assert.match(validator, new RegExp(`FORMAL_FASTGPT_${resource}_FINGERPRINT`));
  assert.match(validator, new RegExp(`CANARY_FASTGPT_${resource}_FINGERPRINT`));
}

const compose = read('fastgpt-canary-compose.yml');
for (const required of ['dachuan-fastgpt-canary-data', 'dachuan-fastgpt-canary-mongo', 'dachuan-fastgpt-canary-redis', 'dachuan-fastgpt-canary-minio']) {
  assert.match(compose, new RegExp(required));
}
assert.match(compose, /AGENT_ENGINE: \$\{FASTGPT_CANARY_AGENT_ENGINE:-fastAgent\}/);
assert.doesNotMatch(compose, /fastgpt:3100|\/opt\/fastgpt|FORMAL_FASTGPT_/);

const deploy = read('deploy.sh');
const rollback = read('rollback.sh');
const health = read('healthcheck.sh');
assert.doesNotMatch(deploy, /systemctl|pm2|docker compose[^\n]*down/);
assert.match(rollback, /docker compose -p dachuan-mcp-prod/);
assert.doesNotMatch(rollback, /fastgpt-canary|fastgpt.*down|systemctl stop/);
assert.match(health, /FORMAL_FASTGPT_HEALTH_URL/);

const grants = read('mysql-grants.expected.sql');
assert.match(grants, /INSERT ON machinery_crm.`operation_logs`/);
assert.match(grants, /UPDATE、DELETE、CREATE、ALTER、DROP、FILE、PROCESS/);
assert.match(grants, /GRANT OPTION/);
console.log('PRODUCTION_PACKAGE_GUARDS=PASS');
