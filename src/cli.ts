#!/usr/bin/env node
import { defineCommand, runMain } from 'citty';

import init from './commands/init';
import install from './commands/install';
import list from './commands/list';
import search from './commands/search';
import info from './commands/info';
import remove from './commands/remove';
import update from './commands/update';

const main = defineCommand({
  meta: {
    name: 'aspects',
    version: '0.1.0',
    description: 'Package manager for AI personality aspects',
  },
  subCommands: {
    init,
    install,
    list,
    search,
    info,
    remove,
    update,
  },
});

runMain(main);
