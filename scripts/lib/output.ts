/**
 * Beautiful CLI output helpers with Morphist brand colors and spinners.
 */

// ─────────────────────────────────────────────────────────────
// Morphist Brand Colors (from lines.svg)
// ─────────────────────────────────────────────────────────────

// RGB color helper
const rgb = (r: number, g: number, b: number) => (text: string) =>
  `\x1b[38;2;${r};${g};${b}m${text}\x1b[0m`;

// Morphist line colors
export const colors = {
  cyan: rgb(3, 138, 213), // #038AD5
  teal: rgb(80, 163, 171), // #50A3AB
  orange: rgb(246, 114, 58), // #F6723A
  red: rgb(196, 59, 57), // #C43B39

  // Utility colors
  dim: (text: string) => `\x1b[2m${text}\x1b[0m`,
  bold: (text: string) => `\x1b[1m${text}\x1b[0m`,
  green: rgb(34, 197, 94),
  yellow: rgb(234, 179, 8),
  white: rgb(255, 255, 255),
} as const;

// ─────────────────────────────────────────────────────────────
// Icons
// ─────────────────────────────────────────────────────────────

export const icons = {
  pass: colors.green("✓"),
  fail: colors.red("✗"),
  warn: colors.orange("!"),
  file: colors.cyan("◆"),
  arrow: colors.dim("→"),
  dot: colors.teal("●"),
} as const;

// ─────────────────────────────────────────────────────────────
// Morphist Line Progress Indicator (single line, colors roll through)
// ─────────────────────────────────────────────────────────────

const LINE_CHAR = "━";
const LINE_WIDTH = 60;
const LINE_COLORS = [colors.cyan, colors.teal, colors.orange, colors.red];

export class Spinner {
  private offset = 0;
  private interval: ReturnType<typeof setInterval> | null = null;
  private message: string;

  constructor(message: string) {
    this.message = message;
  }

  start() {
    process.stdout.write("\x1b[?25l"); // Hide cursor
    this.render();
    this.interval = setInterval(() => {
      this.offset = (this.offset + 1) % LINE_WIDTH;
      this.render();
    }, 50);
    return this;
  }

  private render() {
    // Single line with colors rolling through like a wave
    // Line is always LINE_WIDTH, message is appended after
    let line = "";
    for (let i = 0; i < LINE_WIDTH; i++) {
      // Color cycles based on position + offset
      const colorIndex = Math.floor(
        ((i + this.offset) % LINE_WIDTH) / (LINE_WIDTH / 4),
      );
      const colorFn = LINE_COLORS[colorIndex % 4]!;
      line += colorFn(LINE_CHAR);
    }

    process.stdout.write(`\r  ${line}  ${colors.dim(this.message)}`);
  }

  stop(finalMessage?: string) {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    process.stdout.write("\r\x1b[K"); // Clear line
    process.stdout.write("\x1b[?25h"); // Show cursor
    if (finalMessage) {
      console.log(finalMessage);
    }
  }

  succeed(message: string) {
    this.stop(`  ${icons.pass} ${colors.green(message)}`);
  }

  fail(message: string) {
    this.stop(`  ${icons.fail} ${colors.red(message)}`);
  }
}

// ─────────────────────────────────────────────────────────────
// Progress Bar (single line, fills up)
// ─────────────────────────────────────────────────────────────

export class ProgressBar {
  private current = 0;
  private total: number;
  private width = LINE_WIDTH;
  private label: string;

  constructor(label: string, total: number) {
    this.label = label;
    this.total = total;
  }

  update(current: number) {
    this.current = current;
    this.render();
  }

  increment() {
    this.current++;
    this.render();
  }

  private render() {
    const percent = this.current / this.total;
    const filled = Math.round(this.width * percent);

    // Build gradient progress bar using all 4 colors
    let bar = "";
    for (let i = 0; i < this.width; i++) {
      if (i < filled) {
        // Determine which color based on position
        const colorIndex = Math.floor((i / this.width) * 4);
        const colorFn = LINE_COLORS[Math.min(colorIndex, 3)]!;
        bar += colorFn("━");
      } else {
        bar += colors.dim("─");
      }
    }

    const percentStr = `${Math.round(percent * 100)}%`.padStart(4);
    process.stdout.write(
      `\r  ${bar} ${colors.dim(percentStr)} ${colors.dim(this.label)}`,
    );
  }

  complete(message: string) {
    // Fill completely with gradient
    let bar = "";
    for (let i = 0; i < this.width; i++) {
      const colorIndex = Math.floor((i / this.width) * 4);
      const colorFn = LINE_COLORS[Math.min(colorIndex, 3)]!;
      bar += colorFn("━");
    }
    process.stdout.write(`\r  ${bar} ${icons.pass} ${colors.green(message)}\n`);
  }
}

// ─────────────────────────────────────────────────────────────
// Output helpers
// ─────────────────────────────────────────────────────────────

export function header(text: string, color: keyof typeof colors = "cyan") {
  const colorFn = colors[color] as (s: string) => string;
  console.log();
  console.log(colors.bold(colorFn(`  ${text}`)));
}

export function fileHeader(name: string) {
  console.log();
  console.log(`  ${icons.file} ${colors.bold(name)}`);
}

export function result(pass: boolean, label: string) {
  const icon = pass ? icons.pass : icons.fail;
  const text = pass ? colors.green(label) : colors.red(label);
  console.log(`    ${icon} ${text}`);
}

export function warn(label: string) {
  console.log(`    ${icons.warn} ${colors.orange(label)}`);
}

export function detail(msg: string) {
  console.log(`      ${icons.arrow} ${colors.dim(msg)}`);
}

export function divider() {
  console.log(colors.dim("  " + "─".repeat(LINE_WIDTH)));
}

export function blank() {
  console.log();
}

// ─────────────────────────────────────────────────────────────
// Summary boxes
// ─────────────────────────────────────────────────────────────

export function successSummary(message: string, detail?: string) {
  console.log();
  divider();
  console.log(
    `  ${icons.pass} ${colors.green(colors.bold(message))}${detail ? ` ${colors.dim(detail)}` : ""}`,
  );
  blank();
}

export function failSummary(message: string, detail?: string) {
  console.log();
  divider();
  console.log(
    `  ${icons.fail} ${colors.red(colors.bold(message))}${detail ? ` ${colors.dim(detail)}` : ""}`,
  );
  blank();
}

export function warnSummary(message: string, detail?: string) {
  console.log();
  divider();
  console.log(
    `  ${icons.warn} ${colors.orange(colors.bold(message))}${detail ? ` ${colors.dim(detail)}` : ""}`,
  );
  if (detail) {
    console.log(`    ${icons.arrow} ${colors.dim(detail)}`);
  }
  blank();
}

// ─────────────────────────────────────────────────────────────
// Morphist banner
// ─────────────────────────────────────────────────────────────

export function morphistBanner() {
  // Original 6-row ASCII ASPECTS with drop shadow effect
  const lines = [
    "   █████╗ ███████╗██████╗ ███████╗ ██████╗████████╗███████╗",
    "  ██╔══██╗██╔════╝██╔══██╗██╔════╝██╔════╝╚══██╔══╝██╔════╝",
    "  ███████║███████╗██████╔╝█████╗  ██║        ██║   ███████╗",
    "  ██╔══██║╚════██║██╔═══╝ ██╔══╝  ██║        ██║   ╚════██║",
    "  ██║  ██║███████║██║     ███████╗╚██████╗   ██║   ███████║",
    "  ╚═╝  ╚═╝╚══════╝╚═╝     ╚══════╝ ╚═════╝   ╚═╝   ╚══════╝",
  ];

  console.log();
  // 6 rows with all 4 colors: cyan(1), teal(2), orange(1), red(2)
  console.log(colors.cyan(lines[0]!));
  console.log(colors.teal(lines[1]!));
  console.log(colors.teal(lines[2]!));
  console.log(colors.orange(lines[3]!));
  console.log(colors.red(lines[4]!));
  console.log(colors.red(lines[5]!));
  console.log();
}

// Compact version - all 4 colors on single line with gradient
export function morphistLine() {
  const segmentWidth = LINE_WIDTH / 4;
  const line =
    colors.cyan("━".repeat(segmentWidth)) +
    colors.teal("━".repeat(segmentWidth)) +
    colors.orange("━".repeat(segmentWidth)) +
    colors.red("━".repeat(segmentWidth));
  console.log(`  ${line}`);
}
