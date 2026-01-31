import { homedir } from 'node:os';
import { defineCommand } from 'citty';
import { readConfig, writeConfig, getRegistryUrl, getAuth } from '../lib/config';
import { c, icons } from '../utils/colors';
import { ASPECTS_HOME, CONFIG_PATH } from '../utils/paths';

const DEFAULT_REGISTRY_URL = 'https://aspects.sh/api/v1';

/** Replace home directory with ~ for display */
function tildify(path: string): string {
  const home = homedir();
  return path.startsWith(home) ? path.replace(home, '~') : path;
}

// Known config keys with descriptions
const CONFIG_KEYS = {
  'registry.url': {
    path: ['settings', 'registryUrl'],
    description: 'API registry URL',
    default: DEFAULT_REGISTRY_URL,
  },
} as const;

type ConfigKey = keyof typeof CONFIG_KEYS;

function getNestedValue(obj: Record<string, unknown>, path: string[]): unknown {
  let current: unknown = obj;
  for (const key of path) {
    if (current && typeof current === 'object' && key in current) {
      current = (current as Record<string, unknown>)[key];
    } else {
      return undefined;
    }
  }
  return current;
}

function setNestedValue(obj: Record<string, unknown>, path: string[], value: unknown): void {
  let current = obj;
  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i]!;
    if (!(key in current) || typeof current[key] !== 'object') {
      current[key] = {};
    }
    current = current[key] as Record<string, unknown>;
  }
  const lastKey = path[path.length - 1]!;
  if (value === undefined) {
    delete current[lastKey];
  } else {
    current[lastKey] = value;
  }
}

// Subcommand: config list
const listCommand = defineCommand({
  meta: {
    name: 'list',
    description: 'Show all configuration values',
  },
  async run() {
    const config = await readConfig();
    const registryUrl = await getRegistryUrl();
    const auth = await getAuth();

    console.log();
    console.log(`${icons.info} Configuration`);
    console.log();
    console.log(`  ${c.label('Config file')} ${tildify(CONFIG_PATH)}`);
    console.log();

    // Registry settings
    console.log(c.bold('  Registry'));
    const envUrl = process.env.ASPECTS_REGISTRY_URL;
    if (envUrl) {
      console.log(`    ${c.label('url')} ${registryUrl} ${c.dim('(from ASPECTS_REGISTRY_URL)')}`);
    } else if (config.settings.registryUrl) {
      console.log(`    ${c.label('url')} ${registryUrl}`);
    } else {
      console.log(`    ${c.label('url')} ${registryUrl} ${c.dim('(default)')}`);
    }

    // Auth info
    console.log();
    console.log(c.bold('  Auth'));
    if (auth) {
      console.log(`    ${c.label('logged in as')} @${auth.defaultHandle}`);
      const expiresAt = new Date(auth.expiresAt);
      const isExpired = expiresAt < new Date();
      if (isExpired) {
        console.log(`    ${c.label('token')} ${c.warn('expired')} ${c.dim(`(${expiresAt.toLocaleString()})`)}`);
      } else {
        console.log(`    ${c.label('token')} valid until ${c.dim(expiresAt.toLocaleString())}`);
      }
    } else {
      console.log(`    ${c.muted('Not logged in')}`);
    }

    // Installed aspects count
    const installedCount = Object.keys(config.installed).length;
    console.log();
    console.log(c.bold('  Library'));
    console.log(`    ${c.label('aspects home')} ${tildify(ASPECTS_HOME)}`);
    console.log(`    ${c.label('installed')} ${installedCount} aspect${installedCount === 1 ? '' : 's'}`);

    console.log();
  },
});

// Subcommand: config get
const getCommand = defineCommand({
  meta: {
    name: 'get',
    description: 'Get a configuration value',
  },
  args: {
    key: {
      type: 'positional',
      description: 'Config key (e.g., registry.url)',
      required: true,
    },
  },
  async run({ args }) {
    const key = args.key as string;
    const config = await readConfig();

    // Check for known keys
    const knownKey = CONFIG_KEYS[key as ConfigKey];
    if (knownKey) {
      const value = getNestedValue(config as unknown as Record<string, unknown>, knownKey.path);
      const effectiveValue = value ?? knownKey.default;
      
      // Check for env override
      if (key === 'registry.url' && process.env.ASPECTS_REGISTRY_URL) {
        console.log(process.env.ASPECTS_REGISTRY_URL);
        return;
      }
      
      console.log(effectiveValue);
    } else {
      // Try to get arbitrary path
      const path = key.split('.');
      const value = getNestedValue(config as unknown as Record<string, unknown>, path);
      if (value !== undefined) {
        console.log(typeof value === 'object' ? JSON.stringify(value, null, 2) : value);
      } else {
        console.error(`Unknown config key: ${key}`);
        process.exit(1);
      }
    }
  },
});

// Subcommand: config set
const setCommand = defineCommand({
  meta: {
    name: 'set',
    description: 'Set a configuration value',
  },
  args: {
    key: {
      type: 'positional',
      description: 'Config key (e.g., registry.url)',
      required: true,
    },
    value: {
      type: 'positional',
      description: 'Value to set',
      required: true,
    },
  },
  async run({ args }) {
    const key = args.key as string;
    const value = args.value as string;
    const config = await readConfig();

    // Check for known keys
    const knownKey = CONFIG_KEYS[key as ConfigKey];
    if (knownKey) {
      setNestedValue(config as unknown as Record<string, unknown>, knownKey.path, value);
      await writeConfig(config);
      console.log(`${icons.success} Set ${key} = ${value}`);
    } else {
      // Allow setting arbitrary keys (for advanced users)
      const path = key.split('.');
      setNestedValue(config as unknown as Record<string, unknown>, path, value);
      await writeConfig(config);
      console.log(`${icons.success} Set ${key} = ${value}`);
    }
  },
});

// Subcommand: config unset
const unsetCommand = defineCommand({
  meta: {
    name: 'unset',
    description: 'Remove a configuration value (revert to default)',
  },
  args: {
    key: {
      type: 'positional',
      description: 'Config key to remove',
      required: true,
    },
  },
  async run({ args }) {
    const key = args.key as string;
    const config = await readConfig();

    const knownKey = CONFIG_KEYS[key as ConfigKey];
    const path = knownKey ? knownKey.path : key.split('.');

    const currentValue = getNestedValue(config as unknown as Record<string, unknown>, path);
    if (currentValue === undefined) {
      console.log(`${icons.info} ${key} is not set`);
      return;
    }

    setNestedValue(config as unknown as Record<string, unknown>, path, undefined);
    await writeConfig(config);

    if (knownKey) {
      console.log(`${icons.success} Unset ${key} (will use default: ${knownKey.default})`);
    } else {
      console.log(`${icons.success} Unset ${key}`);
    }
  },
});

// Subcommand: config path
const pathCommand = defineCommand({
  meta: {
    name: 'path',
    description: 'Show path to config file',
  },
  async run() {
    console.log(CONFIG_PATH);
  },
});

// Main config command
export default defineCommand({
  meta: {
    name: 'config',
    description: 'View and modify configuration',
  },
  subCommands: {
    list: listCommand,
    get: getCommand,
    set: setCommand,
    unset: unsetCommand,
    path: pathCommand,
  },
});
