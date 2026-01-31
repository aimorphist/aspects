import { defineCommand } from 'citty';
import { getAuth, getHandles, getDefaultHandle } from '../lib/config';
import { c, icons } from '../utils/colors';

export default defineCommand({
  meta: {
    name: 'whoami',
    description: 'Show your current identity',
  },
  async run() {
    const auth = await getAuth();

    if (!auth) {
      console.log(`${icons.info} Not logged in`);
      console.log(`  Run ${c.cmd('aspects login')} to authenticate.`);
      return;
    }

    const defaultHandle = await getDefaultHandle();
    const handles = await getHandles();

    console.log();

    // Show default handle prominently
    if (defaultHandle) {
      console.log(`  ${c.bold(`@${defaultHandle}`)} ${c.dim('(default)')}`);
    } else if (handles.length === 0) {
      console.log(`  ${c.warn('No handles claimed')}`);
      console.log(`  Run ${c.cmd('aspects handle claim <name>')} to claim a handle.`);
      return;
    }

    // Show all handles with roles
    if (handles.length > 0) {
      console.log();
      console.log(`  ${c.bold('Handles')}`);
      for (const handle of handles) {
        const isDefault = handle.name === defaultHandle;
        const roleColor = handle.role === 'owner' ? c.success : c.dim;
        const defaultIndicator = isDefault ? c.success(' *') : '';
        console.log(`    @${handle.name}  ${roleColor(handle.role)}${defaultIndicator}`);
      }
    }

    // Show account stats
    const ownedCount = handles.filter(h => h.role === 'owner').length;
    console.log();
    console.log(`  ${c.dim(`${ownedCount}/5 owned handles`)}`);

    // Token status
    const expiresAt = new Date(auth.expiresAt);
    const isExpired = expiresAt < new Date();
    if (isExpired) {
      console.log(`  ${c.warn('Token expired')} - run ${c.cmd('aspects login')} to refresh`);
    }

    console.log();
  },
});
