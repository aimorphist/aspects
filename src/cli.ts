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
import config from "./commands/config";

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
  process.argv[2] = ALIASES[cmdArg]!;
}

// Default subcommand for commands that need one
if (process.argv[2] === 'config' && !process.argv[3]) {
  process.argv.splice(3, 0, 'list');
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
  { name: "config", cmd: config, desc: "View and modify configuration" },
];

// Custom help renderer
function showCustomHelp() {
  morphistBanner();
  console.log(pc.dim(`Package manager for AI personality aspects (v0.1.0)`));
  console.log();
  console.log(`${pc.bold(pc.underline("USAGE"))} ${pc.cyan("aspects")} ${pc.dim("<command>")} ${pc.dim("[options]")}`);
  console.log();

  // Quick Start
  console.log(pc.bold(pc.underline("QUICK START")));
  console.log();
  console.log(`  ${pc.cyan("aspects add alaric")}        Install an aspect from the registry`);
  console.log(`  ${pc.cyan("aspects create")}            Create a new aspect interactively`);
  console.log(`  ${pc.cyan("aspects search wizard")}     Search for aspects`);
  console.log();

  // Example workflow
  console.log(pc.bold(pc.underline("EXAMPLE: CREATE & SHARE (NO ACCOUNT)")));
  console.log();
  console.log(`  ${pc.dim("1.")} ${pc.cyan("aspects create my-aspect")}   Create aspect interactively`);
  console.log(`  ${pc.dim("2.")} ${pc.dim("Edit")} ./my-aspect/aspect.json  ${pc.dim("(customize prompt, add directives)")}`);
  console.log(`  ${pc.dim("3.")} ${pc.cyan("aspects share ./my-aspect")}  Share to registry, get hash`);
  console.log(`  ${pc.dim("4.")} ${pc.dim("Share hash with others:")} ${pc.cyan("aspects add blake3:<hash>")}`);
  console.log();

  // Account vs Anonymous
  console.log(pc.bold(pc.underline("PUBLISHING OPTIONS")));
  console.log();
  console.log(`  ${pc.cyan("aspects share")}             Share anonymously via hash (no account needed)`);
  console.log(`  ${pc.cyan("aspects login")}             Create account & authenticate`);
  console.log(`  ${pc.cyan("aspects publish")}           Publish with your name (requires login)`);
  console.log();
  console.log(pc.dim(`  Anonymous: Quick sharing, content-addressed by hash`));
  console.log(pc.dim(`  Logged in: Own names, version updates, edit metadata`));
  console.log();

  // Commands
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

  // Concepts
  console.log(pc.bold(pc.underline("CONCEPTS")));
  console.log();
  console.log(`  ${pc.bold("Directives")}    Strict MUST-follow rules with priority levels`);
  console.log(`                Emphasized across all LLM models (XML, bold, repetition)`);
  console.log();
  console.log(`  ${pc.bold("Instructions")}  Softer guidance and preferences`);
  console.log(`                General behavioral hints, not strictly enforced`);
  console.log();

  console.log(`Use ${pc.cyan("aspects <command> --help")} for detailed command help.`);
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
