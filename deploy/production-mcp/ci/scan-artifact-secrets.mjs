import fs from 'node:fs';
import path from 'node:path';

const roots = process.argv.slice(2);
if (roots.length === 0) throw new Error('Usage: node scan-artifact-secrets.mjs <file-or-directory>...');

const files = [];
function collect(target) {
  const stat = fs.statSync(target);
  if (stat.isDirectory()) {
    for (const entry of fs.readdirSync(target)) collect(path.join(target, entry));
  } else if (stat.isFile()) {
    files.push(target);
  }
}
for (const root of roots) collect(root);

const binaryExtensions = new Set(['.tar', '.gz', '.zip', '.png', '.jpg', '.jpeg', '.gif', '.mp3', '.mmdb']);
for (const file of files) {
  if (binaryExtensions.has(path.extname(file).toLowerCase())) continue;
  const content = fs.readFileSync(file, 'utf8');
  if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(content)) {
    throw new Error(`Private key material found in ${file}`);
  }
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    const apiKey = line.match(/^AGENT_GATEWAY_FASTGPT_API_KEY=(.*)$/);
    if (apiKey && apiKey[1] && !apiKey[1].startsWith('REPLACE_WITH')) {
      throw new Error(`Non-placeholder FastGPT API key found in ${file}`);
    }
    const databaseUrl = line.match(/^(?:DATABASE_URL|MCP_AUDIT_DATABASE_URL)=(.*)$/);
    if (databaseUrl && databaseUrl[1].includes('://') && !databaseUrl[1].startsWith('REPLACE_WITH')) {
      throw new Error(`Non-placeholder database URL found in ${file}`);
    }
  }
}

console.log('ARTIFACT_SECRET_SCAN=PASS');
