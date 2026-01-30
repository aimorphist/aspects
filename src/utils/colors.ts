import pc from 'picocolors';

export const c = {
  // Semantic colors
  success: pc.green,
  error: pc.red,
  warn: pc.yellow,
  info: pc.blue,
  
  // UI elements
  dim: pc.dim,
  bold: pc.bold,
  italic: pc.italic,
  
  // Branding
  aspect: pc.magenta,
  version: pc.cyan,
  tag: pc.yellow,
  
  // Helpers
  label: (text: string) => pc.dim(text + ':'),
  value: (text: string) => pc.white(text),
  highlight: (text: string) => pc.bold(pc.cyan(text)),
  muted: (text: string) => pc.dim(text),
  cmd: (text: string) => pc.cyan(text),
};

export const icons = {
  success: pc.green('✓'),
  error: pc.red('✗'),
  warn: pc.yellow('⚠'),
  info: pc.blue('ℹ'),
  arrow: pc.dim('→'),
  bullet: pc.dim('•'),
  sparkle: '✨',
  package: '📦',
  search: '🔍',
  generator: '🧙',
  share: '🔗',
  // Trust level icons
  verified: pc.green('✓'),
  community: pc.blue('◆'),
  github: pc.dim('◎'),
  local: pc.yellow('▸'),
  anonymous: pc.dim('#'),
  modified: pc.yellow('*'),
};

import type { TrustLevel } from '../lib/types';

export interface AspectDisplayInfo {
  name: string;
  version: string;
  scopes: ('project' | 'global')[];
  trust: TrustLevel;
  publisher?: string;
  specifier?: string;  // May be undefined for legacy installs
  tagline?: string;
  isModified?: boolean;
}

/**
 * Format a single-line aspect display.
 * Example: alaric@1.0.0 [project,global] ✓morphist — Quirky wizard...
 */
export function formatAspectLine(info: AspectDisplayInfo): string {
  const name = c.aspect(info.name);
  const version = c.version(`@${info.version}`);
  const scopes = c.dim(`[${info.scopes.join(',')}]`);
  
  // Trust/source indicator
  let source: string;
  switch (info.trust) {
    case 'verified':
      source = icons.verified + c.dim(info.publisher ?? '');
      break;
    case 'community':
      source = icons.community + c.dim(info.publisher ?? '');
      break;
    case 'github':
      source = icons.github + c.dim('gh');
      break;
    case 'local':
      source = icons.local + c.dim('local');
      break;
    default: {
      // Anonymous/hash-based or legacy install - show truncated hash from specifier
      const spec = info.specifier ?? '';
      const hashPart = spec.startsWith('blake3:') 
        ? spec.slice(7, 13) 
        : spec.startsWith('hash:')
        ? spec.slice(5, 11)
        : '';
      source = hashPart ? icons.anonymous + c.dim(hashPart) : c.dim('registry');
    }
  }
  
  const modified = info.isModified ? ` ${icons.modified}` : '';
  const tagline = info.tagline ? c.muted(` — ${info.tagline}`) : '';
  
  return `  ${name}${version} ${scopes} ${source}${modified}${tagline}`;
}
