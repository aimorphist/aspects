# Multi-LLM Prompting Reference

A comprehensive guide for writing prompts that work across multiple LLM providers (OpenAI GPT, Anthropic Claude, Google Gemini). This document covers model-specific behaviors, best practices, and patterns for Morphist aspects.

> **Note**: This document is maintained in both `morphist/docs/` and `aspects/docs/`. Keep them in sync when updating.

---

## Table of Contents

1. [Universal Best Practices](#universal-best-practices)
2. [Model-Specific Behaviors](#model-specific-behaviors)
   - [OpenAI GPT](#openai-gpt)
   - [Anthropic Claude](#anthropic-claude)
   - [Google Gemini](#google-gemini)
3. [Command Aliases & Triggers](#command-aliases--triggers)
4. [Instruction Positioning](#instruction-positioning)
5. [Formatting & Delimiters](#formatting--delimiters)
6. [Common Pitfalls](#common-pitfalls)
7. [Aspect Prompt Template](#aspect-prompt-template)

---

## Universal Best Practices

### Be Explicit, Not Implicit

All modern LLMs follow instructions more literally than older models. Don't rely on implicit understanding.

```
❌ Bad:  "Be helpful"
✅ Good: "Provide concise, actionable answers. Ask clarifying questions when the request is ambiguous."
```

### Separate Concerns

Don't mix multiple instructions in one sentence. Break them down:

```
❌ Bad:  "Be friendly, technical, and brief while also being thorough when needed."

✅ Good:
- Tone: Friendly and approachable
- Style: Technical accuracy with plain language explanations
- Length: Brief by default, detailed when explicitly requested
```

### Provide Context for Instructions

Explain WHY a behavior is important. All models respond better when they understand the reasoning.

```
❌ Bad:  "Never mention competitors."
✅ Good: "Never mention competitors. This maintains brand focus and avoids legal issues."
```

### Use Examples

Examples are the most reliable way to demonstrate desired behavior across all models.

```
### Example Interaction
User: "How do I center a div?"
Assistant: "Use flexbox: `display: flex; justify-content: center; align-items: center;` on the parent."
```

---

## Model-Specific Behaviors

### OpenAI GPT

#### Key Characteristics
- **Literal instruction following**: GPT-4.1+ follows instructions very literally
- **End-of-prompt priority**: Conflicting instructions favor the one closer to the end
- **ALL-CAPS sensitivity**: Can cause over-strict adherence; use sparingly

#### ALWAYS/NEVER Handling

⚠️ **Critical**: GPT takes absolute directives very seriously, sometimes to a fault.

```
❌ Problem: "You must ALWAYS call a tool before responding."
   Result: Model may hallucinate tool inputs or call with null values when lacking info.

✅ Solution: "Call a tool before responding. If you don't have enough information, 
   ask the user for what you need first."
```

**Best Practice**: Avoid absolute directives without escape clauses.

#### Recommended Prompt Structure

```markdown
# Role and Objective
[Who the assistant is and what it does]

# Instructions
[High-level guidance as bullet points]

## Sub-categories
[More detailed instructions for specific behaviors]

# Reasoning Steps
[Optional: step-by-step workflow]

# Output Format
[How responses should be structured]

# Examples
[Demonstrate desired behavior]

# Context
[Any relevant background information]

# Final Instructions
[Reminders, placed at end for priority]
```

#### GPT-Specific Tips
- Use markdown headers (`#`, `##`) for clear section hierarchy
- Place critical instructions at the END of the prompt
- Avoid mixing tone directives (e.g., "friendly AND formal")
- Sample phrases can cause repetition - instruct to "vary phrasing naturally"

---

### Anthropic Claude

#### Key Characteristics
- **Context-aware**: Excellent at maintaining context over long conversations
- **Instruction positioning matters**: Put key instructions at the START of system prompt
- **Explicit is better**: Claude 4.x requires more explicit requests for "above and beyond" behavior
- **Detail-oriented**: Pays close attention to examples - ensure they match desired behavior

#### Instruction Positioning & Weighting

Claude has a **recency bias** for long contexts - information at the very end of a long document may have slightly lower recall than the beginning or middle.

**For System Prompts**: Put critical instructions at the BEGINNING.

**For Long Context**: Put questions/instructions at the END (after the data).

```markdown
# System Prompt Structure for Claude

## Identity & Role (FIRST - highest priority)
You are [role]. Your purpose is [purpose].

## Core Rules (SECOND - critical behaviors)
- Rule 1
- Rule 2

## Guidelines (THIRD - preferences)
- Guideline 1
- Guideline 2

## Examples (FOURTH - demonstrations)
[Examples here]
```

#### Claude-Specific Tips
- Provide context/motivation for instructions ("This is important because...")
- Be vigilant with examples - Claude will follow them closely
- Request specific behaviors explicitly (animations, interactivity, etc.)
- Use modifiers: "Include as many relevant features as possible. Go beyond the basics."
- Claude 4.x is more concise by default - request elaboration if needed

#### XML Tags Work Well

Claude responds well to XML-style delimiters for structured data:

```xml
<examples>
  <example type="greeting">
    <input>Hello</input>
    <output>Hey there! What can I help you with?</output>
  </example>
</examples>
```

---

### Google Gemini

#### Key Characteristics
- **Multimodal strength**: Excels with mixed media (text + images + video)
- **Structured formatting**: Responds well to clear section headers
- **XML tags preferred**: For long context and structured data
- **Step-by-step reasoning**: Benefits from explicit reasoning instructions

#### Recommended Prompt Structure

Gemini 3 recommends this template:

```markdown
<role>
You are [Role], a specialized assistant for [Domain].
You are [traits: precise, analytical, persistent, etc.].
</role>

<instructions>
1. **Plan**: Analyze the task and create a step-by-step plan.
2. **Execute**: Carry out the plan.
3. **Validate**: Review your output against the user's task.
4. **Format**: Present the final answer in the requested structure.
</instructions>

<constraints>
- Verbosity: [Low/Medium/High]
- Tone: [Formal/Casual/Technical]
</constraints>

<output_format>
Structure your response as follows:
1. **Summary**: [Short overview]
2. **Details**: [Main content]
</output_format>
```

#### Gemini-Specific Tips
- Use XML tags for structure (`<role>`, `<instructions>`, `<context>`)
- Place data/context BEFORE the question
- End with `<final_instruction>Remember to think step-by-step.</final_instruction>`
- Leverage multimodal capabilities when applicable
- Use consistent formatting throughout

---

## Command Aliases & Triggers

### Pattern: Natural Language Triggers

Don't use rigid command syntax. Use semantic groupings with examples:

```markdown
### Actions

**Start Creation**
Triggered by: "create", "make", "build", "new", "design", "help me make", "I want to create"
→ Begin the guided creation flow

**Show Options**
Triggered by: "options", "what can you do", "help", "menu", "commands", "what are my choices"
→ List available actions

**Refine Current**
Triggered by: "change", "modify", "tweak", "adjust", "update", "improve", "make it more"
→ Iterate on current work

**Finalize**
Triggered by: "done", "finish", "complete", "that's it", "looks good", "ship it", "perfect"
→ Present final output
```

### Pattern: Conditional Triggers

```markdown
IF user asks to "save this" OR "export" OR "download" OR "keep this":
  → Trigger the save action

IF user says "switch to X" OR "change to X" OR "use X mode":
  → Activate mode X
```

### Best Practices for Aliases

1. **List 4-6 aliases per action** - enough variety without overwhelming
2. **Include conversational variants** - "ship it", "looks good", "that's it"
3. **Group semantically similar phrases** - "save/export/download/keep"
4. **Test across models** - what triggers reliably on GPT may need adjustment for Claude

---

## Instruction Positioning

### Summary Table

| Model | System Prompt Priority | Long Context Data | Final Instructions |
|-------|----------------------|-------------------|-------------------|
| **GPT** | End of prompt wins conflicts | N/A | Place at END |
| **Claude** | Beginning has highest weight | Put data first, question last | After data |
| **Gemini** | XML structure preferred | `<context>` before `<task>` | `<final_instruction>` tag |

### Universal Rule

**Critical instructions should appear TWICE**: once at the beginning (for Claude) and once at the end (for GPT).

```markdown
## Identity (Beginning)
You are X. NEVER do Y. ALWAYS do Z.

[... rest of prompt ...]

## Reminders (End)
Remember: NEVER do Y. ALWAYS do Z.
```

---

## Formatting & Delimiters

### Markdown (Recommended Default)

Works well across all models. Use for:
- Section headers (`#`, `##`, `###`)
- Bullet points and numbered lists
- Code blocks with language hints
- Bold/italic for emphasis

### XML Tags

Best for structured data, especially with Claude and Gemini:

```xml
<doc id="1" title="Example">Content here</doc>
```

### JSON

Use sparingly - verbose and requires escaping. GPT handles it well in coding contexts, but XML outperforms for long context.

### Model Preferences

| Format | GPT | Claude | Gemini |
|--------|-----|--------|--------|
| Markdown | ✅ Excellent | ✅ Excellent | ✅ Good |
| XML | ✅ Good | ✅ Excellent | ✅ Excellent |
| JSON | ✅ Good (code) | ⚠️ Okay | ⚠️ Poor (long ctx) |

---

## Common Pitfalls

### 1. Absolute Directives Without Escape Clauses

```
❌ "You must ALWAYS call a tool before responding."
✅ "Call a tool before responding. If you lack information, ask the user first."
```

### 2. Conflicting Instructions

```
❌ "Be brief. Also, be thorough and comprehensive."
✅ "Be brief by default. When the user asks for details, be thorough."
```

### 3. Sample Phrases Causing Repetition

```
❌ Providing exact phrases without variation instruction
✅ "Use phrases like these, but vary them naturally: [examples]"
```

### 4. Implicit Expectations

```
❌ "Be helpful" (too vague)
✅ "Provide actionable answers. Include code examples when relevant."
```

### 5. Over-Constraining

```
❌ "Always be super friendly, ultra-formal, and highly technical."
✅ Separate tone (friendly) from style (technical) from formality (professional)
```

---

## Aspect Prompt Template

A cross-model compatible template for Morphist aspects:

```markdown
## Aspect: [Display Name]

**YOU ARE [CHARACTER NAME].** [One-line identity statement.]

### Identity
[2-3 sentences about who this aspect is and their core purpose.]

### Personality
- [Trait 1]
- [Trait 2]
- [Trait 3]

### Expertise
- [Area 1]
- [Area 2]

### Speaking Style
[How they communicate - tone, pace, vocabulary, mannerisms]

### Actions

**[Action Name]**
Triggered by: "[phrase 1]", "[phrase 2]", "[phrase 3]", "[phrase 4]"
→ [What happens]

### Rules
- [Rule 1 with reasoning if helpful]
- [Rule 2]
- [Rule 3]

### Examples

**User**: [Example input]
**[Aspect Name]**: [Example response demonstrating personality and rules]

### Reminders
[Repeat critical rules here for GPT priority]
```

---

## References

- [OpenAI GPT-4.1 Prompting Guide](https://cookbook.openai.com/examples/gpt4-1_prompting_guide)
- [Anthropic Claude Prompting Best Practices](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-4-best-practices)
- [Anthropic Long Context Prompting](https://www.anthropic.com/news/prompting-long-context)
- [Google Gemini Prompt Design Strategies](https://ai.google.dev/gemini-api/docs/prompting-strategies)

---

*Last updated: January 2026*
