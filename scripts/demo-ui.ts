#!/usr/bin/env bun
/**
 * Demo script to preview CLI UI components.
 *
 * Usage:
 *   bun run scripts/demo-ui.ts spinner    - Show the Morphist lines spinner
 *   bun run scripts/demo-ui.ts progress   - Show the gradient progress bar
 *   bun run scripts/demo-ui.ts banner     - Show the Morphist banner
 *   bun run scripts/demo-ui.ts all        - Show all components
 */

import {
  Spinner,
  ProgressBar,
  morphistBanner,
  header,
  fileHeader,
  result,
  detail,
  successSummary,
  failSummary,
  warnSummary,
  icons,
  colors,
  blank,
} from "./lib/output";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function demoSpinner() {
  header("MORPHIST LINES SPINNER", "cyan");
  blank();

  const spinner = new Spinner("Processing...").start();
  await sleep(4000);
  spinner.succeed("Done!");
  blank();
}

async function demoProgress() {
  header("GRADIENT PROGRESS BAR", "teal");
  blank();

  const bar = new ProgressBar("Validating aspects", 20);
  for (let i = 0; i <= 20; i++) {
    bar.update(i);
    await sleep(100);
  }
  bar.complete("All aspects validated");
  blank();
}

async function demoBanner() {
  morphistBanner();
  console.log(colors.bold(colors.white("  ASPECTS CLI")));
  console.log(colors.dim("  Package manager for AI personalities"));
  blank();
}

async function demoResults() {
  header("VALIDATION RESULTS", "orange");

  fileHeader("alaric");
  result(true, "Schema");
  result(true, "Registry entry");

  fileHeader("broken-aspect");
  result(false, "Schema");
  detail("displayName: required field missing");
  detail("prompt: must be at least 1 character");
  result(false, "Registry entry");
  detail("No entry in index.json");

  fileHeader("suspicious-aspect");
  console.log(
    `    ${icons.warn} ${colors.orange("Attempts to override instructions")}`,
  );
  detail(`"ignore all previous instructions"`);

  successSummary("2 passed", "(3 aspects)");

  blank();
  failSummary("1 failed", "2 passed");

  blank();
  warnSummary("Warnings detected", "1 warning, 2 clean");
}

async function main() {
  const arg = process.argv[2] || "all";

  switch (arg) {
    case "spinner":
      await demoSpinner();
      break;
    case "progress":
      await demoProgress();
      break;
    case "banner":
      await demoBanner();
      break;
    case "results":
      await demoResults();
      break;
    case "all":
      await demoBanner();
      await demoSpinner();
      await demoProgress();
      await demoResults();
      break;
    default:
      console.log(
        "Usage: bun run scripts/demo-ui.ts [spinner|progress|banner|results|all]",
      );
  }
}

main();
