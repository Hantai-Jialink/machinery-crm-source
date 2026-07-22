import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const usage = 'Usage: validate-prebuilt-image-archive.mjs [--config-digest] <archive.tar.gz> <expected-image> [expected-config-digest]';

function readTarMember(archive, member) {
  try {
    return execFileSync('tar', ['-xOzf', archive, '--', member], {
      encoding: null,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    const detail = error.stderr?.toString('utf8').trim();
    throw new Error(`Unable to read ${member} from ${archive}${detail ? `: ${detail}` : ''}`);
  }
}

function readMetadata(archive) {
  if (!fs.statSync(archive).isFile()) throw new Error(`Archive is not a regular file: ${archive}`);

  let manifest;
  try {
    manifest = JSON.parse(readTarMember(archive, 'manifest.json').toString('utf8'));
  } catch (error) {
    throw new Error(`Invalid docker-save manifest in ${archive}: ${error.message}`);
  }
  if (!Array.isArray(manifest) || manifest.length !== 1) {
    throw new Error(`Expected exactly one manifest entry in ${archive}`);
  }

  const entry = manifest[0];
  const configPath = entry?.Config;
  if (typeof configPath !== 'string' || !configPath || path.posix.isAbsolute(configPath) || configPath.split('/').includes('..')) {
    throw new Error(`Invalid Config path in ${archive}`);
  }
  if (!Array.isArray(entry.RepoTags) || entry.RepoTags.some((tag) => typeof tag !== 'string')) {
    throw new Error(`Invalid RepoTags in ${archive}`);
  }

  const config = readTarMember(archive, configPath);
  let configJson;
  try {
    configJson = JSON.parse(config.toString('utf8'));
  } catch {
    throw new Error(`Config JSON is invalid in ${archive}`);
  }

  return {
    repoTags: entry.RepoTags,
    configDigest: `sha256:${crypto.createHash('sha256').update(config).digest('hex')}`,
    os: configJson.os,
    architecture: configJson.architecture,
  };
}

function validate(archive, expectedImage, expectedConfigDigest) {
  const metadata = readMetadata(archive);
  if (metadata.repoTags.length !== 1 || metadata.repoTags[0] !== expectedImage) {
    throw new Error(`Archive RepoTags do not exactly match manifest image ${expectedImage}: ${archive}`);
  }
  if (metadata.os !== 'linux' || metadata.architecture !== 'amd64') {
    throw new Error(`Archive platform is not linux/amd64 for ${expectedImage}: ${metadata.os}/${metadata.architecture}`);
  }
  if (expectedConfigDigest && metadata.configDigest !== expectedConfigDigest) {
    throw new Error(`Archive Config SHA256 does not match immutable artifact manifest for ${expectedImage}`);
  }
  return metadata;
}

const args = process.argv.slice(2);
const printConfigDigest = args[0] === '--config-digest';
const values = printConfigDigest ? args.slice(1) : args;
if ((printConfigDigest && values.length !== 2) || (!printConfigDigest && values.length !== 3)) {
  throw new Error(usage);
}

const [archive, expectedImage, expectedConfigDigest] = values;
const metadata = validate(archive, expectedImage, expectedConfigDigest);
if (printConfigDigest) process.stdout.write(`${metadata.configDigest}\n`);
