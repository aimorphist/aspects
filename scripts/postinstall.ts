#!/usr/bin/env node
import { morphistBanner, colors } from "./lib/output";

morphistBanner();

console.log(colors.bold("  Quick Start"));
console.log();
console.log(colors.dim("  # Install an aspect"));
console.log("  npx @morphist/aspects add alaric");
console.log();
console.log(colors.dim("  # Search the registry"));
console.log("  npx @morphist/aspects search wizard");
console.log();
console.log(colors.dim("  # Create your own aspect"));
console.log("  npx @morphist/aspects create");
console.log();
console.log(colors.dim("  # List installed aspects"));
console.log("  npx @morphist/aspects list");
console.log();
console.log(colors.dim("  Docs: https://github.com/aimorphist/aspects"));
console.log();
