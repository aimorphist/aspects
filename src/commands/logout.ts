import { defineCommand } from 'citty';
import { c, icons } from '../utils/colors';
import { getAuth, clearAuth } from '../lib/config';

export default defineCommand({
  meta: {
    name: 'logout',
    description: 'Clear stored authentication tokens',
  },
  async run() {
    const auth = await getAuth();

    if (!auth) {
      console.log();
      console.log(`${icons.info} Not logged in.`);
      console.log();
      return;
    }

    const handle = auth.defaultHandle;
    await clearAuth();

    console.log();
    console.log(`${icons.success} Logged out${handle ? ` from @${handle}` : ''}`);
    console.log(c.muted('  Auth tokens removed from ~/.aspects/config.json'));
    console.log();
  },
});
