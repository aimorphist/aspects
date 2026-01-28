import { mkdir, writeFile, readFile, stat, access } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { ofetch } from 'ofetch';
import type { InstallSpec, Aspect } from './types';
import { parseAspectJson, parseAspectFile } from './parser';
import { getRegistryAspect, fetchAspectVersion, fetchAspectByHash } from './registry';
import { addInstalledAspect, getInstalledAspect } from './config';
import { getAspectPath, ensureAspectsDir } from '../utils/paths';
import { blake3Hash } from '../utils/hash';
import { log } from '../utils/logger';

const ASPECT_FILENAME = 'aspect.json';
const LEGACY_FILENAME = 'aspect.yaml';

export type InstallResult =
  | {
      success: true;
      aspect: Aspect;
      source: 'registry' | 'github' | 'local';
      alreadyInstalled?: boolean;
    }
  | {
      success: false;
      error: string;
    };

/**
 * Install an aspect from a parsed spec.
 */
export async function installAspect(
  spec: InstallSpec,
  options?: { force?: boolean },
): Promise<InstallResult> {
  switch (spec.type) {
    case 'registry':
      return installFromRegistry(spec.name, spec.version, options);
    case 'local':
      return installFromLocal(spec.path, options);
    case 'github':
      return installFromGitHub(spec.owner, spec.repo, spec.ref, options);
    case 'hash':
      return installFromHash(spec.hash, options);
  }
}

/**
 * Install from the registry API.
 */
async function installFromRegistry(
  name: string,
  version?: string,
  options?: { force?: boolean },
): Promise<InstallResult> {
  // Try API-based install first
  try {
    return await installFromRegistryApi(name, version, options);
  } catch {
    // Fallback to legacy index-based install
    return installFromRegistryLegacy(name, version, options);
  }
}

/**
 * Install via REST API (primary path).
 */
async function installFromRegistryApi(
  name: string,
  version?: string,
  options?: { force?: boolean },
): Promise<InstallResult> {
  const targetVersion = version ?? 'latest';

  // Check if already installed (unless force)
  if (!options?.force) {
    const existing = await getInstalledAspect(name);
    if (existing && (version ? existing.version === version : true)) {
      const aspect = await loadAspectFromPath(getAspectPath(name));
      if (aspect) {
        return { success: true, aspect, source: 'registry', alreadyInstalled: true };
      }
    }
  }

  log.start(`Fetching ${name}@${targetVersion}...`);

  let versionData;
  try {
    versionData = await fetchAspectVersion(name, targetVersion);
  } catch (err) {
    const message = (err as Error).message;
    if (message.includes('not_found') || message.includes('404') || message.includes('not found')) {
      return { success: false, error: `Aspect "${name}@${targetVersion}" not found in registry` };
    }
    throw err; // Let caller handle for fallback
  }

  const aspect = versionData.content;

  // Verify name matches
  if (aspect.name !== name) {
    return {
      success: false,
      error: `Aspect name mismatch: expected "${name}", got "${aspect.name}"`,
    };
  }

  // Store to ~/.aspects/aspects/<name>/
  await ensureAspectsDir();
  const aspectDir = getAspectPath(name);
  await mkdir(aspectDir, { recursive: true });
  const content = JSON.stringify(aspect, null, 2);
  await writeFile(join(aspectDir, ASPECT_FILENAME), content);

  // Update config
  const hash = versionData.blake3 || await blake3Hash(content);
  await addInstalledAspect(name, {
    version: aspect.version,
    source: 'registry',
    installedAt: new Date().toISOString(),
    blake3: hash,
  });

  return { success: true, aspect, source: 'registry' };
}

/**
 * Install via legacy registry index (fallback).
 */
async function installFromRegistryLegacy(
  name: string,
  version?: string,
  options?: { force?: boolean },
): Promise<InstallResult> {
  let registryAspect;
  try {
    registryAspect = await getRegistryAspect(name);
  } catch (err) {
    return {
      success: false,
      error: `Unable to reach registry: ${(err as Error).message}. Make sure you have network connectivity or try installing from a local path.`,
    };
  }

  if (!registryAspect) {
    return { success: false, error: `Aspect "${name}" not found in registry` };
  }

  const targetVersion = version ?? registryAspect.latest;
  const versionInfo = registryAspect.versions[targetVersion];
  if (!versionInfo) {
    const available = Object.keys(registryAspect.versions).join(', ');
    return {
      success: false,
      error: `Version "${targetVersion}" not found. Available: ${available}`,
    };
  }

  // Check if already installed at same version (unless force)
  if (!options?.force) {
    const existing = await getInstalledAspect(name);
    if (existing && existing.version === targetVersion) {
      const aspect = await loadAspectFromPath(getAspectPath(name));
      if (aspect) {
        return { success: true, aspect, source: 'registry', alreadyInstalled: true };
      }
    }
  }

  // Fetch aspect content from URL
  if (!versionInfo.url) {
    return { success: false, error: `No download URL for ${name}@${targetVersion}` };
  }

  log.start(`Fetching ${name}@${targetVersion}...`);
  let content: string;
  try {
    content = await ofetch(versionInfo.url, { responseType: 'text' });
  } catch (err) {
    return { success: false, error: `Failed to fetch aspect: ${(err as Error).message}` };
  }

  // Parse and validate
  const parseResult = parseAspectJson(content);
  if (!parseResult.success) {
    return { success: false, error: `Invalid aspect data: ${parseResult.errors.join(', ')}` };
  }

  if (parseResult.warnings.length > 0) {
    parseResult.warnings.forEach(w => log.warn(w));
  }

  const aspect = parseResult.aspect;

  if (aspect.name !== name) {
    return {
      success: false,
      error: `Aspect name mismatch: expected "${name}", got "${aspect.name}"`,
    };
  }

  // Store to ~/.aspects/aspects/<name>/
  await ensureAspectsDir();
  const aspectDir = getAspectPath(name);
  await mkdir(aspectDir, { recursive: true });
  await writeFile(join(aspectDir, ASPECT_FILENAME), content);

  // Update config
  const hash = await blake3Hash(content);
  await addInstalledAspect(name, {
    version: aspect.version,
    source: 'registry',
    installedAt: new Date().toISOString(),
    blake3: hash,
  });

  return { success: true, aspect, source: 'registry' };
}

const DEFAULT_GITHUB_REF = 'main';

/**
 * Install from a GitHub repository.
 * Tries aspect.json first, falls back to aspect.yaml.
 */
async function installFromGitHub(
  owner: string,
  repo: string,
  ref?: string,
  options?: { force?: boolean },
): Promise<InstallResult> {
  const targetRef = ref ?? DEFAULT_GITHUB_REF;

  // Try aspect.json first, then aspect.yaml
  let content: string | null = null;
  for (const filename of [ASPECT_FILENAME, LEGACY_FILENAME]) {
    const url = `https://raw.githubusercontent.com/${owner}/${repo}/${targetRef}/${filename}`;
    log.start(`Fetching from github:${owner}/${repo}@${targetRef}...`);
    try {
      content = await ofetch(url, { responseType: 'text' });
      break;
    } catch (err) {
      const message = (err as Error).message;
      if (!message.includes('404')) {
        return { success: false, error: `Failed to fetch from GitHub: ${message}` };
      }
    }
  }

  if (!content) {
    return {
      success: false,
      error: `No aspect.json found at github:${owner}/${repo}@${targetRef}. Make sure the repo exists and has an aspect.json in the root.`,
    };
  }

  // Parse and validate
  const parseResult = parseAspectJson(content);
  if (!parseResult.success) {
    return { success: false, error: `Invalid aspect data: ${parseResult.errors.join(', ')}` };
  }

  if (parseResult.warnings.length > 0) {
    parseResult.warnings.forEach(w => log.warn(w));
  }

  const aspect = parseResult.aspect;

  // Check if already installed at same ref (unless force)
  if (!options?.force) {
    const existing = await getInstalledAspect(aspect.name);
    if (existing && existing.source === 'github' && existing.githubRef === targetRef) {
      const existingAspect = await loadAspectFromPath(getAspectPath(aspect.name));
      if (existingAspect && existing.blake3 === await blake3Hash(content)) {
        return { success: true, aspect: existingAspect, source: 'github', alreadyInstalled: true };
      }
    }
  }

  // Store to ~/.aspects/aspects/<name>/
  await ensureAspectsDir();
  const aspectDir = getAspectPath(aspect.name);
  await mkdir(aspectDir, { recursive: true });
  await writeFile(join(aspectDir, ASPECT_FILENAME), content);

  // Update config
  const hash = await blake3Hash(content);
  await addInstalledAspect(aspect.name, {
    version: aspect.version,
    source: 'github',
    installedAt: new Date().toISOString(),
    blake3: hash,
    githubRef: targetRef,
  });

  return { success: true, aspect, source: 'github' };
}

/**
 * Install from a local path.
 */
async function installFromLocal(
  path: string,
  options?: { force?: boolean },
): Promise<InstallResult> {
  let filePath: string;
  let aspectDir: string;

  try {
    const stats = await stat(path);
    if (stats.isDirectory()) {
      aspectDir = path;
      // Try aspect.json first, fall back to aspect.yaml
      const jsonPath = join(path, ASPECT_FILENAME);
      const yamlPath = join(path, LEGACY_FILENAME);
      try {
        await access(jsonPath);
        filePath = jsonPath;
      } catch {
        filePath = yamlPath;
      }
    } else {
      filePath = path;
      aspectDir = dirname(path);
    }
  } catch {
    return { success: false, error: `Path not found: ${path}` };
  }

  // Parse and validate
  const parseResult = await parseAspectFile(filePath);
  if (!parseResult.success) {
    return { success: false, error: parseResult.errors.join(', ') };
  }

  if (parseResult.warnings.length > 0) {
    parseResult.warnings.forEach(w => log.warn(w));
  }

  const aspect = parseResult.aspect;

  // Read content for hash
  const content = await readFile(filePath, 'utf-8');
  const hash = await blake3Hash(content);

  // Check if already installed from same path (unless force)
  if (!options?.force) {
    const existing = await getInstalledAspect(aspect.name);
    if (existing && existing.path === aspectDir && existing.blake3 === hash) {
      return { success: true, aspect, source: 'local', alreadyInstalled: true };
    }
  }

  // Register in config (don't copy files)
  await addInstalledAspect(aspect.name, {
    version: aspect.version,
    source: 'local',
    installedAt: new Date().toISOString(),
    blake3: hash,
    path: aspectDir,
  });

  return { success: true, aspect, source: 'local' };
}

/**
 * Install from a blake3 hash (content-addressed).
 */
async function installFromHash(
  hash: string,
  options?: { force?: boolean },
): Promise<InstallResult> {
  log.start(`Fetching aspect by hash ${hash.slice(0, 12)}...`);

  let versionData;
  try {
    versionData = await fetchAspectByHash(hash);
  } catch (err) {
    const message = (err as Error).message;
    if (message.includes('not_found') || message.includes('404') || message.includes('not found')) {
      return { success: false, error: `No aspect found for hash "${hash}"` };
    }
    return { success: false, error: `Failed to fetch aspect by hash: ${message}` };
  }

  const aspect = versionData.content;

  // Check if already installed (unless force)
  if (!options?.force) {
    const existing = await getInstalledAspect(aspect.name);
    if (existing && existing.blake3 === hash) {
      const existingAspect = await loadAspectFromPath(getAspectPath(aspect.name));
      if (existingAspect) {
        return { success: true, aspect: existingAspect, source: 'registry', alreadyInstalled: true };
      }
    }
  }

  // Store to ~/.aspects/aspects/<name>/
  await ensureAspectsDir();
  const aspectDir = getAspectPath(aspect.name);
  await mkdir(aspectDir, { recursive: true });
  const content = JSON.stringify(aspect, null, 2);
  await writeFile(join(aspectDir, ASPECT_FILENAME), content);

  await addInstalledAspect(aspect.name, {
    version: aspect.version,
    source: 'registry',
    installedAt: new Date().toISOString(),
    blake3: versionData.blake3 || await blake3Hash(content),
  });

  return { success: true, aspect, source: 'registry' };
}

/**
 * Helper to load aspect from a path.
 * Tries aspect.json first, falls back to aspect.yaml for backwards compat.
 */
async function loadAspectFromPath(aspectDir: string): Promise<Aspect | null> {
  // Try aspect.json first
  const jsonResult = await parseAspectFile(join(aspectDir, ASPECT_FILENAME));
  if (jsonResult.success) return jsonResult.aspect;

  // Fall back to aspect.yaml
  const yamlResult = await parseAspectFile(join(aspectDir, LEGACY_FILENAME));
  return yamlResult.success ? yamlResult.aspect : null;
}
