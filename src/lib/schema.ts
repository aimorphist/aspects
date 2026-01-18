import { z } from 'zod';

/**
 * Zod schema for aspect.yaml validation.
 * Lenient: schemaVersion and version have defaults.
 */
export const aspectSchema = z.object({
  schemaVersion: z.number().default(1),
  name: z.string().min(1, 'name is required'),
  publisher: z.string().optional(),
  version: z.string().default('0.0.0'),
  displayName: z.string().min(1, 'displayName is required'),
  tagline: z.string().min(1, 'tagline is required'),
  icon: z.string().optional(),
  author: z.string().optional(),
  license: z.string().optional(),

  voiceHints: z
    .object({
      speed: z.enum(['slow', 'normal', 'fast']).optional(),
      emotions: z.array(z.string()).optional(),
      styleHints: z.string().optional(),
    })
    .optional(),

  modes: z
    .record(
      z.string(),
      z.object({
        description: z.string(),
        autoNarration: z.boolean().optional(),
      })
    )
    .optional(),

  resources: z
    .object({
      voice: z
        .object({
          recommended: z
            .object({
              provider: z.string(),
              voiceId: z.string(),
            })
            .optional(),
        })
        .optional(),
      model: z
        .object({
          recommended: z
            .object({
              provider: z.string(),
              modelId: z.string(),
            })
            .optional(),
        })
        .optional(),
      skills: z.array(z.string()).optional(),
    })
    .optional(),

  prompt: z.string().min(1, 'prompt is required'),
});

export type AspectFromSchema = z.infer<typeof aspectSchema>;
