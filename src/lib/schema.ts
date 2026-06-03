import { z } from "zod";
import { Ajv2020 } from "ajv/dist/2020.js";

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
] as const;

export type OfficialCategory = (typeof OFFICIAL_CATEGORIES)[number];

export const KIND_VALUES = ["personality", "schema"] as const;
export type AspectKind = (typeof KIND_VALUES)[number];

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
  publisher: 100,
  icon: 50,
  license: 50,
  styleHints: 500,
  emotion: 30,
  maxEmotions: 10,
  // Schema-aspect body cap (stringified bytes). Schema documents can grow
  // — node/edge/action manifests for a real archiform — but keep them sane.
  schemaBodyBytes: 200_000,
} as const;

// Pointer format for `extendsSchema`: `<publisher>/<name>@<semver>` or `blake3:<base58>`.
const SCHEMA_REF_REGEX = /^(?:[a-z0-9-]+\/[a-z0-9-]+@\d+\.\d+\.\d+|blake3:[1-9A-HJ-NP-Za-km-z]+)$/;

// Single Ajv instance — JSON Schema draft 2020-12 meta-validation.
// `strict: false` because user schemas may use $id/$ref/keywords ajv otherwise warns on.
const ajv = new Ajv2020({ strict: false, validateFormats: false });
const META_SCHEMA_URI = "https://json-schema.org/draft/2020-12/schema";

function validateJsonSchemaBody(value: unknown, ctx: z.RefinementCtx): void {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "schema must be a JSON Schema object",
    });
    return;
  }
  // `validateSchema` checks the body against the draft 2020-12 meta-schema
  // without registering it under its $id, so we can re-validate the same
  // document repeatedly without Ajv complaining about duplicate ids.
  const ok = ajv.validateSchema(value);
  if (!ok) {
    const errors = ajv.errors ?? [];
    const detail = errors.length > 0 ? errors.map((e) => `${e.instancePath} ${e.message}`).join("; ") : "";
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `schema is not a valid JSON Schema (draft 2020-12)${detail ? `: ${detail}` : ""}`,
    });
  }
}

// Shared identity / metadata fields. Both kinds carry these.
const baseShape = {
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
  category: z
    .string()
    .min(FIELD_LIMITS.categoryMin, `Category must be at least ${FIELD_LIMITS.categoryMin} characters`)
    .max(FIELD_LIMITS.category, `Category must be at most ${FIELD_LIMITS.category} characters`)
    .regex(/^[a-zA-Z0-9-]+$/, "Category must be alphanumeric with hyphens only"),
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
};

export const personalityAspectSchema = z.object({
  ...baseShape,
  // Optional on personality so existing aspects authored before this discriminator
  // existed parse unchanged AND keep their original canonical hash. Newly authored
  // personality aspects MAY include `kind: "personality"` explicitly, but it is
  // redundant — absence is treated as the same kind everywhere.
  kind: z.literal("personality").optional(),
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
  prompt: z
    .string()
    .min(FIELD_LIMITS.promptMin, `prompt must be at least ${FIELD_LIMITS.promptMin} chars`)
    .max(
      FIELD_LIMITS.prompt,
      `prompt must be ${FIELD_LIMITS.prompt} chars or less`,
    ),
  // Optional pointer: this personality is a manifestation of a schema-aspect.
  extendsSchema: z
    .string()
    .regex(SCHEMA_REF_REGEX, 'extendsSchema must look like "publisher/name@x.y.z" or "blake3:<hash>"')
    .optional(),
});

export const schemaAspectSchema = z.object({
  ...baseShape,
  kind: z.literal("schema"),
  schema: z
    .record(z.string(), z.unknown())
    .superRefine((value, ctx) => {
      validateJsonSchemaBody(value, ctx);
      try {
        const size = new TextEncoder().encode(JSON.stringify(value)).byteLength;
        if (size > FIELD_LIMITS.schemaBodyBytes) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `schema body too large: ${size} bytes (limit ${FIELD_LIMITS.schemaBodyBytes})`,
          });
        }
      } catch {
        // JSON.stringify fail (cycles etc.) — already covered by meta-validation typically.
      }
    }),
});

/**
 * General-purpose aspect schema. Aspects declare which schema(s) they implement
 * via `implements` and carry their payload in `data`.
 */
export const generalAspectSchema = z.object({
  ...baseShape,
  implements: z.array(z.string().min(1)).min(1, 'at least one schema ref required'),
  data: z.unknown(),
});

/**
 * Aspect schema. The general schema is first so it matches before legacy schemas
 * when `implements` is present. Schema-aspects MUST declare `kind: "schema"`
 * explicitly; everything else without `implements` is treated as a personality
 * aspect. We deliberately do NOT inject a default `kind` value, so an aspect
 * authored before the discriminator existed parses to the exact same object —
 * preserving its canonical hash.
 *
 * Implemented as `z.union` (not `z.discriminatedUnion`) because the discriminator
 * is optional on the personality branch.
 */
export const aspectSchema = z.union([generalAspectSchema, schemaAspectSchema, personalityAspectSchema]);

export type AspectFromSchema = z.infer<typeof aspectSchema>;
export type PersonalityAspectFromSchema = z.infer<typeof personalityAspectSchema>;
export type SchemaAspectFromSchema = z.infer<typeof schemaAspectSchema>;
export type GeneralAspectFromSchema = z.infer<typeof generalAspectSchema>;
