import { defineCommand } from 'citty';
import { exec } from 'node:child_process';
import * as readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { log } from '../utils/logger';
import { c, icons } from '../utils/colors';
import { getAuth, setAuthTokens, isLoggedIn, getDefaultHandle } from '../lib/config';
import { initiateDeviceAuth, pollDeviceAuth, claimHandle, ApiClientError } from '../lib/api-client';

export default defineCommand({
  meta: {
    name: 'login',
    description: `Authenticate with the aspects registry.

Uses device authorization flow (like GitHub CLI):
  1. CLI requests a device code
  2. Browser opens to verification URL
  3. Enter the code and authorize
  4. CLI receives and stores access token

Benefits of logging in:
  - Name ownership: Claim aspect names under your publisher ID
  - Versioning: Publish updates to your aspects
  - Edit metadata: Update tagline, tags, category

Credentials stored in ~/.aspects/config.json

Don't want an account? Use 'aspects share' to publish anonymously.`,
  },
  async run() {
    // Check if already logged in
    const auth = await getAuth();
    if (auth && await isLoggedIn()) {
      const defaultHandle = await getDefaultHandle();
      console.log();
      if (defaultHandle) {
        console.log(`${icons.info} Already logged in as ${c.bold(`@${defaultHandle}`)}`);
      } else {
        console.log(`${icons.info} Already logged in`);
      }
      console.log(c.muted('  Run "aspects logout" to sign out first.'));
      console.log();
      return;
    }

    console.log();
    log.start('Requesting authorization...');

    let deviceCode;
    try {
      deviceCode = await initiateDeviceAuth();
    } catch (err) {
      const error = err as Error & { statusCode?: number; errorCode?: string };
      log.error(`Failed to initiate login: ${error.message}`);
      if (error.statusCode) {
        console.log(c.muted(`  Status: ${error.statusCode}`));
      }
      if (error.errorCode) {
        console.log(c.muted(`  Code: ${error.errorCode}`));
      }
      process.exit(1);
    }

    // Display instructions
    console.log();
    console.log(`  ${c.bold('Please visit this URL and enter the code:')}`);
    console.log(`  ${c.highlight(deviceCode.verification_uri_complete)}`);
    console.log();
    console.log(`  Code: ${c.bold(deviceCode.user_code)}`);
    console.log();

    // Try to open browser
    try {
      const platform = process.platform;
      const openCmd = platform === 'darwin' ? 'open'
        : platform === 'win32' ? 'start'
        : 'xdg-open';
      exec(`${openCmd} "${deviceCode.verification_uri_complete}"`);
    } catch {
      // Browser open is best-effort
    }

    console.log(c.muted('  Waiting for authorization... (Press Ctrl+C to cancel)'));
    console.log();

    // Poll for authorization
    let interval = deviceCode.interval * 1000;
    const expiresAt = Date.now() + deviceCode.expires_in * 1000;

    while (Date.now() < expiresAt) {
      await new Promise(r => setTimeout(r, interval));

      try {
        const result = await pollDeviceAuth(deviceCode.device_code, deviceCode.code_verifier);

        if (result.ok && result.access_token) {
          // Calculate expiry
          const expiresIn = result.expires_in ?? 3600;
          const expiresAtDate = new Date(Date.now() + expiresIn * 1000).toISOString();

          // Get account info from response
          const account = result.account;
          if (!account) {
            // Fallback for API that doesn't return account yet
            log.error('API did not return account info. Please update the registry.');
            process.exit(1);
          }

          // Check if user needs to claim a handle
          if (account.needs_handle) {
            console.log(`${icons.success} Authenticated!`);
            console.log();

            // Get suggested handle from JWT
            const suggested = extractUsernameFromToken(result.access_token);

            // Prompt user to claim a handle
            const handle = await promptForHandle(suggested, result.access_token);

            // Store auth with the claimed handle
            await setAuthTokens({
              accessToken: result.access_token,
              refreshToken: result.refresh_token,
              expiresAt: expiresAtDate,
              accountId: account.id,
              handles: [{ name: handle, role: 'owner', default: true }],
              defaultHandle: handle,
            });

            console.log();
            console.log(`${icons.success} Logged in as ${c.bold(`@${handle}`)}`);
            console.log(c.muted('  Credentials stored in ~/.aspects/config.json'));
            console.log();
            return;
          }

          // User already has handles
          const defaultHandle = account.handles.find(h => h.default)?.name
                             ?? account.handles[0]?.name
                             ?? '';

          await setAuthTokens({
            accessToken: result.access_token,
            refreshToken: result.refresh_token,
            expiresAt: expiresAtDate,
            accountId: account.id,
            handles: account.handles,
            defaultHandle,
          });

          console.log(`${icons.success} Logged in as ${c.bold(`@${defaultHandle}`)}`);
          if (account.handles.length > 1) {
            console.log(c.muted(`  Also: ${account.handles.filter(h => h.name !== defaultHandle).map(h => `@${h.name}`).join(', ')}`));
          }
          console.log(c.muted('  Credentials stored in ~/.aspects/config.json'));
          console.log();
          return;
        }

        if (!result.ok) {
          switch (result.status) {
            case 'pending':
              // Keep polling
              continue;
            case 'slow_down':
              interval *= 2;
              continue;
            case 'expired':
              log.error('Authorization code expired. Please run "aspects login" again.');
              process.exit(1);
              break;
            case 'denied':
              log.error('Authorization denied.');
              process.exit(1);
              break;
            default:
              log.error(`Unexpected status: ${result.status}`);
              process.exit(1);
          }
        }
      } catch (err) {
        // Network errors during polling - keep trying
        continue;
      }
    }

    log.error('Authorization timed out. Please run "aspects login" again.');
    process.exit(1);
  },
});

/**
 * Attempt to extract username from a JWT token payload.
 * Prefers human-readable identifiers over UUIDs.
 * Used as a suggestion for handle claiming.
 */
function extractUsernameFromToken(token: string): string | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(Buffer.from(parts[1]!, 'base64url').toString());
    // Prefer email/username over UUID (sub)
    const raw = payload.preferred_username
      ?? payload.email
      ?? payload.username
      ?? payload.name
      ?? null;

    if (!raw) return null;

    // Clean up: extract username from email, lowercase, remove invalid chars
    let clean = raw.split('@')[0] ?? raw;
    clean = clean.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/--+/g, '-').replace(/^-|-$/g, '');

    // Validate length
    if (clean.length < 2 || clean.length > 39) return null;

    return clean;
  } catch {
    return null;
  }
}

/**
 * Prompt user to claim a handle during first login.
 */
async function promptForHandle(suggested: string | null, accessToken: string): Promise<string> {
  const rl = readline.createInterface({ input, output });

  const HANDLE_REGEX = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;

  console.log(`  ${c.bold('Claim your handle')}`);
  console.log(`  This will be your publisher identity (e.g., @${suggested ?? 'yourname'})`);
  console.log();

  while (true) {
    const prompt = suggested
      ? `  Handle [${suggested}]: `
      : '  Handle: ';

    let answer = await rl.question(prompt);
    answer = answer.trim().toLowerCase().replace(/^@/, '');

    // Use suggestion if empty
    if (!answer && suggested) {
      answer = suggested;
    }

    if (!answer) {
      console.log(c.warn('  Please enter a handle'));
      continue;
    }

    // Validate format
    if (answer.length < 2) {
      console.log(c.warn('  Handle must be at least 2 characters'));
      continue;
    }
    if (answer.length > 39) {
      console.log(c.warn('  Handle must be at most 39 characters'));
      continue;
    }
    if (!HANDLE_REGEX.test(answer)) {
      console.log(c.warn('  Handle must be lowercase alphanumeric with hyphens'));
      continue;
    }
    if (answer.includes('--')) {
      console.log(c.warn('  Handle cannot contain consecutive hyphens'));
      continue;
    }

    // Try to claim
    try {
      console.log(`  ${icons.working} Claiming @${answer}...`);
      await claimHandle(answer);
      rl.close();
      return answer;
    } catch (err) {
      if (err instanceof ApiClientError) {
        switch (err.errorCode) {
          case 'handle_taken':
            console.log(c.warn(`  @${answer} is already taken. Try another.`));
            break;
          case 'handle_reserved':
            console.log(c.warn(`  @${answer} is reserved. Try another.`));
            break;
          default:
            console.log(c.warn(`  ${err.message}`));
        }
        continue;
      }
      rl.close();
      throw err;
    }
  }
}
