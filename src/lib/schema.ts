import { z } from "zod";

/**
 * Official categories - suggestions for UI, not validation constraints.
 * Custom categories are allowed (2-20 chars, alphanumeric + hyphens, any case).
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
 * Field length limits (min/max) for validation
 */
export const FIELD_LIMITS = {
  nameMin: 2,
  name: 50,
  displayNameMin: 2,
  displayName: 100,
  taglineMin: 10,
  tagline: 200,
  categoryMin: 2,
  category: 20,
  tagMin: 2,
  tag: 30,
  maxTags: 10,
  promptMin: 10,
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
  directiveId: 50,
  directiveRule: 500,
  instructionId: 50,
  instructionRule: 500,
  maxDirectives: 25,
  maxInstructions: 25,
} as const;

/**
 * Zod schema for aspect.json validation.
 * Includes field length limits and category/tags validation.
 */
export const aspectSchema = z.object({
  schemaVersion: z.literal(1),
  name: z
    .string()
    .min(FIELD_LIMITS.nameMin, `name must be at least ${FIELD_LIMITS.nameMin} chars`)
    .max(FIELD_LIMITS.name, `name must be ${FIELD_LIMITS.name} chars or less`),
  publisher: z
    .string()
    .min(1, 'publisher is required')
    .max(
      FIELD_LIMITS.publisher,
      `publisher must be ${FIELD_LIMITS.publisher} chars or less`,
    )
    .default('anon-user'),
  version: z.string().default("0.0.0"),
  displayName: z
    .string()
    .min(FIELD_LIMITS.displayNameMin, `displayName must be at least ${FIELD_LIMITS.displayNameMin} chars`)
    .max(
      FIELD_LIMITS.displayName,
      `displayName must be ${FIELD_LIMITS.displayName} chars or less`,
    ),
  tagline: z
    .string()
    .min(FIELD_LIMITS.taglineMin, `tagline must be at least ${FIELD_LIMITS.taglineMin} chars`)
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

  // Category: required, can be official or custom (2-20 chars, alphanumeric + hyphens)
  category: z
    .string()
    .min(FIELD_LIMITS.categoryMin, `Category must be at least ${FIELD_LIMITS.categoryMin} characters`)
    .max(FIELD_LIMITS.category, `Category must be at most ${FIELD_LIMITS.category} characters`)
    .regex(/^[a-zA-Z0-9-]+$/, "Category must be alphanumeric with hyphens only"),

  // Tags: optional, open-ended for discovery/search
  tags: z
    .array(
      z
        .string()
        .min(FIELD_LIMITS.tagMin, `each tag must be at least ${FIELD_LIMITS.tagMin} chars`)
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

  directives: z
    .array(
      z.object({
        id: z
          .string()
          .max(
            FIELD_LIMITS.directiveId,
            `directive id must be ${FIELD_LIMITS.directiveId} chars or less`,
          ),
        rule: z
          .string()
          .max(
            FIELD_LIMITS.directiveRule,
            `directive rule must be ${FIELD_LIMITS.directiveRule} chars or less`,
          ),
        priority: z.enum(["high", "medium", "low"]),
      }),
    )
    .max(
      FIELD_LIMITS.maxDirectives,
      `maximum ${FIELD_LIMITS.maxDirectives} directives allowed`,
    )
    .optional(),

  instructions: z
    .array(
      z.object({
        id: z
          .string()
          .max(
            FIELD_LIMITS.instructionId,
            `instruction id must be ${FIELD_LIMITS.instructionId} chars or less`,
          ),
        rule: z
          .string()
          .max(
            FIELD_LIMITS.instructionRule,
            `instruction rule must be ${FIELD_LIMITS.instructionRule} chars or less`,
          ),
      }),
    )
    .max(
      FIELD_LIMITS.maxInstructions,
      `maximum ${FIELD_LIMITS.maxInstructions} instructions allowed`,
    )
    .optional(),

  prompt: z
    .string()
    .min(FIELD_LIMITS.promptMin, `prompt must be at least ${FIELD_LIMITS.promptMin} chars`)
    .max(
      FIELD_LIMITS.prompt,
      `prompt must be ${FIELD_LIMITS.prompt} chars or less`,
    ),
});

export type AspectFromSchema = z.infer<typeof aspectSchema>;
