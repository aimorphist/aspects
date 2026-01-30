#!/usr/bin/env node
import { defineCommand, runMain, type CommandDef } from "citty";
import pc from "picocolors";
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

// Alias map: short/alternate names -> canonical command
const ALIASES: Record<string, string> = {
  c: "create",
  new: "create",
  n: "create",
  install: "add",
  get: "add",
  a: "add",
  i: "add",
  g: "add",
};

// Reverse map: canonical -> list of aliases
const ALIAS_HINTS: Record<string, string[]> = {};
for (const [alias, canonical] of Object.entries(ALIASES)) {
  (ALIAS_HINTS[canonical] ??= []).push(alias);
}

// Rewrite aliases in argv before citty parses
const cmdArg = process.argv[2];
if (cmdArg && ALIASES[cmdArg]) {
  process.argv[2] = ALIASES[cmdArg];
}

// Command registry with descriptions
const COMMANDS: Array<{
  name: string;
  cmd: CommandDef<any>;
  desc: string;
  aliases?: string[];
}> = [
  { name: "create", cmd: create, desc: "Create a new aspect interactively", aliases: ["c", "new", "n"] },
  { name: "add", cmd: add, desc: "Install aspect(s) to your local library", aliases: ["install", "get", "a", "i", "g"] },
  { name: "list", cmd: list, desc: "List installed aspects" },
  { name: "search", cmd: search, desc: "Search the aspect registry" },
  { name: "find", cmd: find, desc: "Search aspects with filters and operators" },
  { name: "info", cmd: info, desc: "Show details about an aspect" },
  { name: "remove", cmd: remove, desc: "Remove an installed aspect" },
  { name: "update", cmd: update, desc: "Update installed aspect(s) to latest version" },
  { name: "validate", cmd: validate, desc: "Validate an aspect.json file" },
  { name: "compile", cmd: compile, desc: "Compile an aspect's prompt for a model" },
  { name: "publish", cmd: publish, desc: "Publish an aspect to the registry" },
  { name: "set", cmd: set, desc: "Manage aspect sets (collections)" },
  { name: "edit", cmd: edit, desc: "Edit an existing aspect" },
  { name: "bundle", cmd: bundle, desc: "Bundle multiple aspects into one file" },
  { name: "share", cmd: share, desc: "Share an aspect via content hash" },
  { name: "unpublish", cmd: unpublish, desc: "Unpublish a version from the registry" },
  { name: "login", cmd: login, desc: "Authenticate with the registry" },
  { name: "logout", cmd: logout, desc: "Clear stored authentication tokens" },
];

// Custom help renderer
function showCustomHelp() {
  morphistBanner();
  console.log(pc.dim(`Package manager for AI personality aspects (v0.1.0)`));
  console.log();
  console.log(`${pc.bold(pc.underline("USAGE"))} ${pc.cyan("aspects")} ${pc.dim("<command>")} ${pc.dim("[options]")}`);
  console.log();
  console.log(pc.bold(pc.underline("COMMANDS")));
  console.log();

  const maxNameLen = Math.max(...COMMANDS.map((c) => c.name.length));

  for (const { name, desc, aliases } of COMMANDS) {
    const paddedName = name.padStart(maxNameLen);
    const aliasPart = aliases?.length
      ? `  ${pc.dim("also:")} ${aliases.map((a) => pc.cyan(a)).join(pc.dim(", "))}`
      : "";
    console.log(`  ${pc.cyan(paddedName)}  ${desc}${aliasPart}`);
  }

  console.log();
  console.log(`Use ${pc.cyan("aspects <command> --help")} for more info.`);
  console.log();
}

// Check if showing main help
const showingHelp = process.argv.length === 2 || 
  (process.argv.length === 3 && (process.argv[2] === "--help" || process.argv[2] === "-h"));

if (showingHelp) {
  showCustomHelp();
  process.exit(0);
}

// Build subCommands object for citty
const subCommands: Record<string, CommandDef<any>> = {};
for (const { name, cmd } of COMMANDS) {
  subCommands[name] = cmd;
}

const main = defineCommand({
  meta: {
    name: "aspects",
    version: "0.1.0",
    description: "Package manager for AI personality aspects",
  },
  subCommands,
});

// Show banner
morphistBanner();

runMain(main);
