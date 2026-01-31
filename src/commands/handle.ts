import { defineCommand } from 'citty';
import {
  getAuth,
  getHandles,
  setDefaultHandle,
  updateHandles,
} from '../lib/config';
import {
  getAccount,
  claimHandle as claimHandleApi,
  checkHandleAvailability,
  setDefaultHandleApi,
  ApiClientError,
} from '../lib/api-client';
import { c, icons } from '../utils/colors';

// Handle format validation (matches server-side rules)
const HANDLE_REGEX = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;
const MIN_LENGTH = 2;
const MAX_LENGTH = 39;

function validateHandleFormat(name: string): string | null {
  if (name.length < MIN_LENGTH) {
    return `Handle must be at least ${MIN_LENGTH} characters`;
  }
  if (name.length > MAX_LENGTH) {
    return `Handle must be at most ${MAX_LENGTH} characters`;
  }
  if (!HANDLE_REGEX.test(name)) {
    return 'Handle must be lowercase alphanumeric with hyphens, cannot start or end with hyphen';
  }
  if (name.includes('--')) {
    return 'Handle cannot contain consecutive hyphens';
  }
  return null;
}

// Subcommand: handle claim
const claimCommand = defineCommand({
  meta: {
    name: 'claim',
    description: 'Claim a new handle',
  },
  args: {
    name: {
      type: 'positional',
      description: 'Handle name to claim (e.g., myhandle)',
      required: true,
    },
    'display-name': {
      type: 'string',
      description: 'Display name with preferred casing',
    },
  },
  async run({ args }) {
    const auth = await getAuth();
    if (!auth) {
      console.error(`${icons.error} Not logged in. Run ${c.cmd('aspects login')} first.`);
      process.exit(1);
    }

    const name = (args.name as string).toLowerCase();
    const displayName = args['display-name'] as string | undefined;

    // Validate format locally first
    const formatError = validateHandleFormat(name);
    if (formatError) {
      console.error(`${icons.error} ${formatError}`);
      process.exit(1);
    }

    try {
      console.log(`${icons.working} Claiming @${name}...`);
      const result = await claimHandleApi(name, displayName);

      // Refresh handles from API
      const account = await getAccount();
      await updateHandles(account.handles);

      console.log(`${icons.success} Claimed @${result.name}`);
      console.log();
      console.log(`  You can now publish aspects under this handle.`);
      console.log(`  Use ${c.cmd(`aspects handle default ${name}`)} to make it your default.`);
    } catch (err) {
      if (err instanceof ApiClientError) {
        switch (err.errorCode) {
          case 'invalid_format':
            console.error(`${icons.error} Invalid handle format: ${err.message}`);
            break;
          case 'handle_taken':
            console.error(`${icons.error} @${name} is already taken`);
            break;
          case 'handle_reserved':
            console.error(`${icons.error} @${name} is reserved`);
            break;
          case 'handle_limit':
            console.error(`${icons.error} You've reached the maximum of 5 owned handles`);
            console.log(`  You can be a member of unlimited handles owned by others.`);
            break;
          case 'rate_limit':
            console.error(`${icons.error} Rate limit: max 3 handle claims per 30 days`);
            break;
          default:
            console.error(`${icons.error} ${err.message}`);
        }
        process.exit(1);
      }
      throw err;
    }
  },
});

// Subcommand: handle list
const listCommand = defineCommand({
  meta: {
    name: 'list',
    description: 'List your handles',
  },
  args: {
    refresh: {
      type: 'boolean',
      description: 'Refresh from API',
      default: false,
    },
  },
  async run({ args }) {
    const auth = await getAuth();
    if (!auth) {
      console.error(`${icons.error} Not logged in. Run ${c.cmd('aspects login')} first.`);
      process.exit(1);
    }

    let handles = await getHandles();

    // Optionally refresh from API
    if (args.refresh) {
      try {
        const account = await getAccount();
        await updateHandles(account.handles);
        handles = account.handles;
      } catch (err) {
        console.error(`${icons.warn} Could not refresh from API: ${(err as Error).message}`);
      }
    }

    if (handles.length === 0) {
      console.log(`${icons.info} You don't have any handles yet.`);
      console.log(`  Run ${c.cmd('aspects handle claim <name>')} to claim one.`);
      return;
    }

    console.log();
    console.log(`${icons.info} Your Handles`);
    console.log();

    for (const handle of handles) {
      const defaultTag = handle.default ? c.success(' (default)') : '';
      const roleTag = c.dim(` ${handle.role}`);
      console.log(`  @${handle.name}${roleTag}${defaultTag}`);
    }

    // Show ownership limits
    const ownedCount = handles.filter(h => h.role === 'owner').length;
    console.log();
    console.log(`  ${c.dim(`${ownedCount}/5 owned handles`)}`);
    console.log();
  },
});

// Subcommand: handle default
const defaultCommand = defineCommand({
  meta: {
    name: 'default',
    description: 'Set your default publishing handle',
  },
  args: {
    name: {
      type: 'positional',
      description: 'Handle to set as default',
      required: true,
    },
  },
  async run({ args }) {
    const auth = await getAuth();
    if (!auth) {
      console.error(`${icons.error} Not logged in. Run ${c.cmd('aspects login')} first.`);
      process.exit(1);
    }

    const name = (args.name as string).toLowerCase().replace(/^@/, '');

    // Check if user has this handle
    const handles = await getHandles();
    const hasHandle = handles.some(h => h.name === name);
    if (!hasHandle) {
      console.error(`${icons.error} You don't have access to @${name}`);
      console.log();
      console.log('  Your handles:');
      for (const h of handles) {
        console.log(`    @${h.name}`);
      }
      process.exit(1);
    }

    try {
      // Update on server
      await setDefaultHandleApi(name);

      // Update locally
      await setDefaultHandle(name);

      console.log(`${icons.success} Default handle set to @${name}`);
    } catch (err) {
      if (err instanceof ApiClientError) {
        console.error(`${icons.error} ${err.message}`);
        process.exit(1);
      }
      throw err;
    }
  },
});

// Subcommand: handle check
const checkCommand = defineCommand({
  meta: {
    name: 'check',
    description: 'Check if a handle is available',
  },
  args: {
    name: {
      type: 'positional',
      description: 'Handle name to check',
      required: true,
    },
  },
  async run({ args }) {
    const name = (args.name as string).toLowerCase().replace(/^@/, '');

    // Validate format locally first
    const formatError = validateHandleFormat(name);
    if (formatError) {
      console.error(`${icons.error} ${formatError}`);
      process.exit(1);
    }

    try {
      const result = await checkHandleAvailability(name);

      if (result.available) {
        console.log(`${icons.success} @${name} is available`);
      } else {
        console.log(`${icons.error} @${name} is not available`);
        if (result.reason) {
          switch (result.reason) {
            case 'taken':
              console.log(`  This handle is already claimed.`);
              break;
            case 'reserved':
              console.log(`  This handle is reserved.`);
              break;
            case 'invalid':
              console.log(`  This handle format is not allowed.`);
              break;
            default:
              console.log(`  Reason: ${result.reason}`);
          }
        }
      }
    } catch (err) {
      if (err instanceof ApiClientError) {
        console.error(`${icons.error} ${err.message}`);
        process.exit(1);
      }
      throw err;
    }
  },
});

// Main handle command
export default defineCommand({
  meta: {
    name: 'handle',
    description: 'Manage your handles (namespaces for publishing)',
  },
  subCommands: {
    claim: claimCommand,
    list: listCommand,
    default: defaultCommand,
    check: checkCommand,
  },
});
