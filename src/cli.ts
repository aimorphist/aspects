#!/usr/bin/env node
import { defineCommand, runMain } from "citty";
import { morphistBanner } from "../scripts/lib/output";

import create from "./commands/create";
import add from "./commands/add";
import list from "./commands/list";
import search from "./commands/search";
import find from "./commands/find";
import info from "./commands/info";
import remove from "./commands/remove";
import update from "./commands/update";
import validate from "./commands/validate";
import compile from "./commands/compile";
import publish from "./commands/publish";
import set from "./commands/set";
import edit from "./commands/edit";
import bundle from "./commands/bundle";
import login from "./commands/login";
import logout from "./commands/logout";
import share from "./commands/share";
import unpublish from "./commands/unpublish";

const main = defineCommand({
  meta: {
    name: "aspects",
    version: "0.1.0",
    description: "Package manager for AI personality aspects",
  },
  subCommands: {
    // Create a new aspect
    create,
    c: create,
    new: create,
    n: create,

    // Add/install aspects
    add,
    install: add,
    get: add,
    a: add,
    i: add,
    g: add,

    // Other commands
    list,
    search,
    find,
    info,
    remove,
    update,
    validate,
    compile,
    publish,
    set,
    edit,
    bundle,

    // Sharing
    share,
    unpublish,

    // Auth
    login,
    logout,
  },
});

// Show banner
morphistBanner();

// Default to 'create' if no command specified
const args = process.argv.slice(2);
if (args.length === 0 || (args[0] && args[0].startsWith('-') && args[0] !== '--help' && args[0] !== '-h')) {
  // No command or only flags (not --help), default to create
  process.argv.splice(2, 0, 'create');
}

runMain(main);
