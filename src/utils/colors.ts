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
  wizard: '🧙',
};
