import { writeFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { defineCommand } from 'citty';
import * as p from '@clack/prompts';
import { stringify } from 'yaml';

export default defineCommand({
  meta: {
    name: 'init',
    description: 'Create a new aspect interactively',
  },
  args: {
    path: {
      type: 'positional',
      description: 'Directory to create aspect in (default: current directory)',
      required: false,
    },
  },
  async run({ args }) {
    const targetDir = args.path ?? process.cwd();
    const outputPath = join(targetDir, 'aspect.yaml');

    // Check if aspect.yaml already exists
    try {
      await stat(outputPath);
      p.log.error(`aspect.yaml already exists in ${targetDir}`);
      process.exit(1);
    } catch {
      // File doesn't exist, good to go
    }

    p.intro('✨ Create a new aspect');

    const answers = await p.group(
      {
        name: () =>
          p.text({
            message: 'Aspect name (slug)',
            placeholder: 'my-wizard',
            validate: (value) => {
              if (!value) return 'Name is required';
              if (!/^[a-z0-9-]+$/.test(value)) {
                return 'Name must be lowercase letters, numbers, and hyphens only';
              }
            },
          }),

        displayName: () =>
          p.text({
            message: 'Display name',
            placeholder: 'My Wizard',
            validate: (value) => {
              if (!value) return 'Display name is required';
            },
          }),

        tagline: () =>
          p.text({
            message: 'Tagline (one-liner description)',
            placeholder: 'A wise and quirky wizard who loves riddles',
            validate: (value) => {
              if (!value) return 'Tagline is required';
            },
          }),

        author: () =>
          p.text({
            message: 'Author (optional)',
            placeholder: 'Your Name',
          }),

        license: () =>
          p.text({
            message: 'License',
            placeholder: 'MIT',
            initialValue: 'MIT',
          }),

        speed: () =>
          p.select({
            message: 'Voice speed',
            options: [
              { value: 'normal', label: 'Normal' },
              { value: 'slow', label: 'Slow — deliberate, thoughtful' },
              { value: 'fast', label: 'Fast — energetic, excited' },
            ],
            initialValue: 'normal',
          }),

        promptStyle: () =>
          p.select({
            message: 'Prompt template',
            options: [
              { value: 'character', label: 'Character — roleplay a persona' },
              { value: 'assistant', label: 'Assistant — helpful AI style' },
              { value: 'blank', label: 'Blank — start from scratch' },
            ],
            initialValue: 'character',
          }),
      },
      {
        onCancel: () => {
          p.cancel('Cancelled');
          process.exit(0);
        },
      }
    );

    // Build the aspect object
    const aspect: Record<string, unknown> = {
      schemaVersion: 1,
      name: answers.name,
      version: '1.0.0',
      displayName: answers.displayName,
      tagline: answers.tagline,
    };

    if (answers.author) {
      aspect.author = answers.author;
    }

    if (answers.license) {
      aspect.license = answers.license;
    }

    aspect.voiceHints = {
      speed: answers.speed,
      emotions: ['friendly'],
      styleHints: 'Speak naturally and warmly.',
    };

    // Generate prompt based on style
    aspect.prompt = generatePrompt(
      answers.promptStyle as string,
      answers.displayName as string,
      answers.tagline as string
    );

    // Write the file
    const yamlContent = stringify(aspect, { lineWidth: 0 });
    await writeFile(outputPath, yamlContent);

    p.log.success(`Created ${outputPath}`);

    // Offer next steps
    const nextStep = await p.select({
      message: 'What next?',
      options: [
        { value: 'install', label: 'Install locally — register this aspect' },
        { value: 'edit', label: 'Edit first — open in editor' },
        { value: 'done', label: 'Done — exit' },
      ],
    });

    if (nextStep === 'install') {
      p.log.info(`Run: aspects install ${targetDir === process.cwd() ? './' : targetDir}`);
    } else if (nextStep === 'edit') {
      p.log.info(`Edit ${outputPath}, then run: aspects install ./`);
    }

    p.outro('Happy aspecting! 🧙');
  },
});

function generatePrompt(style: string, displayName: string, tagline: string): string {
  switch (style) {
    case 'character':
      return `## Aspect: ${displayName}
**YOU ARE ${displayName.toUpperCase()}.** Speak as this character at all times.

**Tagline**: "${tagline}"

### Identity
You ARE ${displayName}. Embody this character fully from the first message.
- **Welcome**: Introduce yourself naturally
- **"Who are you?"**: Describe yourself in character

### Character
- [Add personality traits here]
- [Add knowledge areas]
- [Add quirks or mannerisms]

### Rules
- **Brief by default**: Keep responses short unless asked for more
- **Stay in character**: Never break character unless explicitly asked
`;

    case 'assistant':
      return `## Aspect: ${displayName}
You are ${displayName}, ${tagline.toLowerCase()}.

### Guidelines
- Be helpful, concise, and accurate
- Ask clarifying questions when needed
- Admit uncertainty when appropriate

### Personality
- [Add personality traits here]
- [Add areas of expertise]
`;

    case 'blank':
    default:
      return `## Aspect: ${displayName}

${tagline}

[Write your prompt here]
`;
  }
}
