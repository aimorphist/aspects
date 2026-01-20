import { z } from "zod";

/**
 * Official categories - all aspects must use exactly one
 */
export const OFFICIAL_CATEGORIES = [
  "assistant",
  "roleplay",
  "creative",
  "productivity",
  "education",
  "gaming",
  "spiritual",
  "pundit",
  "guide",
] as const;

export type OfficialCategory = (typeof OFFICIAL_CATEGORIES)[number];

/**
 * Field length limits to prevent abuse
 */
export const FIELD_LIMITS = {
  name: 50,
  displayName: 100,
  tagline: 200,
  tag: 30,
  maxTags: 10,
  prompt: 50000,
  author: 100,
  publisher: 50,
  icon: 50,
  license: 50,
  styleHints: 500,
  emotion: 50,
  maxEmotions: 10,
  maxModes: 10,
  modeDescription: 500,
  modeCritical: 1000,
} as const;

/**
 * Zod schema for aspect.json validation.
 * Includes field length limits and category/tags validation.
 */
export const aspectSchema = z.object({
  schemaVersion: z.number().default(1),
  name: z
    .string()
    .min(1, "name is required")
    .max(FIELD_LIMITS.name, `name must be ${FIELD_LIMITS.name} chars or less`),
  publisher: z
    .string()
    .max(
      FIELD_LIMITS.publisher,
      `publisher must be ${FIELD_LIMITS.publisher} chars or less`,
    )
    .optional(),
  version: z.string().default("0.0.0"),
  displayName: z
    .string()
    .min(1, "displayName is required")
    .max(
      FIELD_LIMITS.displayName,
      `displayName must be ${FIELD_LIMITS.displayName} chars or less`,
    ),
  tagline: z
    .string()
    .min(1, "tagline is required")
    .max(
      FIELD_LIMITS.tagline,
      `tagline must be ${FIELD_LIMITS.tagline} chars or less`,
    ),
  icon: z
    .string()
    .max(FIELD_LIMITS.icon, `icon must be ${FIELD_LIMITS.icon} chars or less`)
    .optional(),
  author: z
    .string()
    .max(
      FIELD_LIMITS.author,
      `author must be ${FIELD_LIMITS.author} chars or less`,
    )
    .optional(),
  license: z
    .string()
    .max(
      FIELD_LIMITS.license,
      `license must be ${FIELD_LIMITS.license} chars or less`,
    )
    .optional(),

  // Category: required, must be from official list
  category: z.enum(OFFICIAL_CATEGORIES, {
    message: `category must be one of: ${OFFICIAL_CATEGORIES.join(", ")}`,
  }),

  // Tags: optional, open-ended for discovery/search
  tags: z
    .array(
      z
        .string()
        .max(
          FIELD_LIMITS.tag,
          `each tag must be ${FIELD_LIMITS.tag} chars or less`,
        ),
    )
    .max(FIELD_LIMITS.maxTags, `maximum ${FIELD_LIMITS.maxTags} tags allowed`)
    .optional(),

  voiceHints: z
    .object({
      speed: z.enum(["slow", "normal", "fast"]).optional(),
      emotions: z
        .array(
          z
            .string()
            .max(
              FIELD_LIMITS.emotion,
              `each emotion must be ${FIELD_LIMITS.emotion} chars or less`,
            ),
        )
        .max(
          FIELD_LIMITS.maxEmotions,
          `maximum ${FIELD_LIMITS.maxEmotions} emotions allowed`,
        )
        .optional(),
      styleHints: z
        .string()
        .max(
          FIELD_LIMITS.styleHints,
          `styleHints must be ${FIELD_LIMITS.styleHints} chars or less`,
        )
        .optional(),
    })
    .optional(),

  modes: z
    .record(
      z.string(),
      z.object({
        description: z
          .string()
          .max(
            FIELD_LIMITS.modeDescription,
            `mode description must be ${FIELD_LIMITS.modeDescription} chars or less`,
          ),
        critical: z
          .string()
          .max(
            FIELD_LIMITS.modeCritical,
            `mode critical must be ${FIELD_LIMITS.modeCritical} chars or less`,
          )
          .optional(),
        autoNarration: z.boolean().optional(),
      }),
    )
    .refine((modes) => Object.keys(modes).length <= FIELD_LIMITS.maxModes, {
      message: `maximum ${FIELD_LIMITS.maxModes} modes allowed`,
    })
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

  prompt: z
    .string()
    .min(1, "prompt is required")
    .max(
      FIELD_LIMITS.prompt,
      `prompt must be ${FIELD_LIMITS.prompt} chars or less`,
    ),
});

export type AspectFromSchema = z.infer<typeof aspectSchema>;
