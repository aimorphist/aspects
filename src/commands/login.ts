import { defineCommand } from 'citty';
import { exec } from 'node:child_process';
import { log } from '../utils/logger';
import { c, icons } from '../utils/colors';
import { getAuth, setAuthTokens, isLoggedIn } from '../lib/config';
import { initiateDeviceAuth, pollDeviceAuth } from '../lib/api-client';

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
      console.log();
      console.log(`${icons.info} Already logged in as ${c.bold(`@${auth.username}`)}`);
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

          // We need a username - decode from token or use a placeholder
          // The API should ideally return the username; for now extract from token
          const username = extractUsernameFromToken(result.access_token) ?? 'user';

          await setAuthTokens({
            accessToken: result.access_token,
            refreshToken: result.refresh_token,
            expiresAt: expiresAtDate,
            username,
          });

          console.log(`${icons.success} Authorized as ${c.bold(`@${username}`)}`);
          console.log(c.muted('  Access token stored in ~/.aspects/config.json'));
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
 */
function extractUsernameFromToken(token: string): string | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(Buffer.from(parts[1]!, 'base64url').toString());
    // Prefer email/username over UUID (sub)
    return payload.preferred_username 
      ?? payload.email 
      ?? payload.username 
      ?? payload.name
      ?? payload.sub 
      ?? null;
  } catch {
    return null;
  }
}
