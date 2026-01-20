import { mkdir, writeFile, readFile, stat } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { ofetch } from 'ofetch';
import type { InstallSpec, InstalledAspect, Aspect } from './types';
import { parseAspectJson, parseAspectFile } from './parser';
import { getRegistryAspect, fetchAspectYaml } from './registry';
import { addInstalledAspect, getInstalledAspect } from './config';
import { getAspectPath, ensureAspectsDir } from '../utils/paths';
import { sha256 } from '../utils/hash';
import { log } from '../utils/logger';

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
export async function installAspect(spec: InstallSpec): Promise<InstallResult> {
  switch (spec.type) {
    case 'registry':
      return installFromRegistry(spec.name, spec.version);
    case 'local':
      return installFromLocal(spec.path);
    case 'github':
      return installFromGitHub(spec.owner, spec.repo, spec.ref);
  }
}

/**
 * Install from the registry.
 */
async function installFromRegistry(name: string, version?: string): Promise<InstallResult> {
  // Fetch registry info
  let registryAspect;
  try {
    registryAspect = await getRegistryAspect(name);
  } catch (err) {
    return { 
      success: false, 
      error: `Unable to reach registry: ${(err as Error).message}. Make sure you have network connectivity or try installing from a local path.` 
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
      error: `Version "${targetVersion}" not found. Available: ${available}` 
    };
  }

  // Check if already installed at same version
  const existing = await getInstalledAspect(name);
  if (existing && existing.version === targetVersion) {
    const aspect = await loadAspectFromPath(getAspectPath(name));
    if (aspect) {
      return { success: true, aspect, source: 'registry', alreadyInstalled: true };
    }
  }

  // Fetch aspect.yaml
  log.start(`Fetching ${name}@${targetVersion}...`);
  let yamlContent: string;
  try {
    yamlContent = await fetchAspectYaml(versionInfo.url);
  } catch (err) {
    return { success: false, error: `Failed to fetch aspect: ${(err as Error).message}` };
  }

  // Parse and validate
  const parseResult = parseAspectJson(yamlContent);
  if (!parseResult.success) {
    return { success: false, error: `Invalid aspect.yaml: ${parseResult.errors.join(', ')}` };
  }

  // Log warnings
  if (parseResult.warnings.length > 0) {
    parseResult.warnings.forEach(w => log.warn(w));
  }

  const aspect = parseResult.aspect;

  // Verify name matches
  if (aspect.name !== name) {
    return { 
      success: false, 
      error: `Aspect name mismatch: expected "${name}", got "${aspect.name}"` 
    };
  }

  // Store to ~/.aspects/aspects/<name>/
  await ensureAspectsDir();
  const aspectDir = getAspectPath(name);
  await mkdir(aspectDir, { recursive: true });
  await writeFile(join(aspectDir, 'aspect.yaml'), yamlContent);

  // Update config
  const hash = sha256(yamlContent);
  await addInstalledAspect(name, {
    version: aspect.version,
    source: 'registry',
    installedAt: new Date().toISOString(),
    sha256: hash,
  });

  return { success: true, aspect, source: 'registry' };
}

const DEFAULT_GITHUB_REF = 'main';

/**
 * Install from a GitHub repository.
 * Fetches aspect.yaml from raw.githubusercontent.com
 */
async function installFromGitHub(
  owner: string, 
  repo: string, 
  ref?: string
): Promise<InstallResult> {
  const targetRef = ref ?? DEFAULT_GITHUB_REF;
  
  // Build raw GitHub URL
  const url = `https://raw.githubusercontent.com/${owner}/${repo}/${targetRef}/aspect.yaml`;
  
  // Fetch aspect.yaml
  log.start(`Fetching from github:${owner}/${repo}@${targetRef}...`);
  let yamlContent: string;
  try {
    yamlContent = await ofetch(url, { responseType: 'text' });
  } catch (err) {
    const message = (err as Error).message;
    if (message.includes('404')) {
      return { 
        success: false, 
        error: `No aspect.yaml found at github:${owner}/${repo}@${targetRef}. Make sure the repo exists and has an aspect.yaml in the root.` 
      };
    }
    return { success: false, error: `Failed to fetch from GitHub: ${message}` };
  }

  // Parse and validate
  const parseResult = parseAspectJson(yamlContent);
  if (!parseResult.success) {
    return { success: false, error: `Invalid aspect.yaml: ${parseResult.errors.join(', ')}` };
  }

  if (parseResult.warnings.length > 0) {
    parseResult.warnings.forEach(w => log.warn(w));
  }

  const aspect = parseResult.aspect;

  // Check if already installed at same ref
  const existing = await getInstalledAspect(aspect.name);
  if (existing && existing.source === 'github' && existing.githubRef === targetRef) {
    const existingAspect = await loadAspectFromPath(getAspectPath(aspect.name));
    if (existingAspect && existing.sha256 === sha256(yamlContent)) {
      return { success: true, aspect: existingAspect, source: 'github', alreadyInstalled: true };
    }
  }

  // Store to ~/.aspects/aspects/<name>/
  await ensureAspectsDir();
  const aspectDir = getAspectPath(aspect.name);
  await mkdir(aspectDir, { recursive: true });
  await writeFile(join(aspectDir, 'aspect.yaml'), yamlContent);

  // Update config
  const hash = sha256(yamlContent);
  await addInstalledAspect(aspect.name, {
    version: aspect.version,
    source: 'github',
    installedAt: new Date().toISOString(),
    sha256: hash,
    githubRef: targetRef,
  });

  return { success: true, aspect, source: 'github' };
}

/**
 * Install from a local path.
 */
async function installFromLocal(path: string): Promise<InstallResult> {
  // Determine if path is a directory or file
  let yamlPath: string;
  let aspectDir: string;
  
  try {
    const stats = await stat(path);
    if (stats.isDirectory()) {
      aspectDir = path;
      yamlPath = join(path, 'aspect.yaml');
    } else {
      yamlPath = path;
      aspectDir = dirname(path);
    }
  } catch {
    return { success: false, error: `Path not found: ${path}` };
  }

  // Parse and validate
  const parseResult = await parseAspectFile(yamlPath);
  if (!parseResult.success) {
    return { success: false, error: parseResult.errors.join(', ') };
  }

  if (parseResult.warnings.length > 0) {
    parseResult.warnings.forEach(w => log.warn(w));
  }

  const aspect = parseResult.aspect;

  // Read content for hash
  const yamlContent = await readFile(yamlPath, 'utf-8');
  const hash = sha256(yamlContent);

  // Check if already installed from same path
  const existing = await getInstalledAspect(aspect.name);
  if (existing && existing.path === aspectDir && existing.sha256 === hash) {
    return { success: true, aspect, source: 'local', alreadyInstalled: true };
  }

  // Register in config (don't copy files)
  await addInstalledAspect(aspect.name, {
    version: aspect.version,
    source: 'local',
    installedAt: new Date().toISOString(),
    sha256: hash,
    path: aspectDir,
  });

  return { success: true, aspect, source: 'local' };
}

/**
 * Helper to load aspect from a path.
 */
async function loadAspectFromPath(aspectDir: string): Promise<Aspect | null> {
  const result = await parseAspectFile(join(aspectDir, 'aspect.yaml'));
  return result.success ? result.aspect : null;
}
