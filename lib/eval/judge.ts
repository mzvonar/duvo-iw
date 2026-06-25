import Anthropic from "@anthropic-ai/sdk";
import type { EvalResult } from "@/lib/types";

export interface JudgeInput {
  instruction: string;
  artifactName: string;
  artifactText: string;
}

const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 1500;
const MAX_ARTIFACT_CHARS = 12_000;

// JSON schema mirroring EvalResult from @/lib/types. Used to constrain the
// model output via output_config.format.
const EVAL_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    verdict: { type: "string", enum: ["pass", "fail"] },
    score: { type: "integer", minimum: 0, maximum: 100 },
    summary: { type: "string" },
    criteria: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string" },
          passed: { type: "boolean" },
          note: { type: "string" },
        },
        required: ["name", "passed", "note"],
      },
    },
  },
  required: ["verdict", "score", "summary", "criteria"],
} as const;

export async function judgeArtifact(input: JudgeInput): Promise<EvalResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set — cannot run the LLM judge. " +
        "Set the key, or fall back to the mock producer.",
    );
  }

  const client = new Anthropic();

  const artifact =
    input.artifactText.length > MAX_ARTIFACT_CHARS
      ? input.artifactText.slice(0, MAX_ARTIFACT_CHARS) +
        "\n\n[...truncated for evaluation...]"
      : input.artifactText;

  const system =
    "You are a meticulous evaluator (LLM-as-judge). You are given a user's " +
    "instruction and an artifact produced in response to it. Judge whether the " +
    "artifact satisfies the request and return a structured evaluation. Score " +
    "from 0 to 100. Set verdict to \"pass\" only if the artifact genuinely meets " +
    "the instruction. Provide 3 to 6 criteria such as well-formedness, " +
    "completeness, relevance, and faithfulness to the instruction; each criterion " +
    "must have a short name, a boolean passed flag, and a concise note. Keep the " +
    "summary to a single paragraph.";

  const userPrompt =
    `<instruction>\n${input.instruction}\n</instruction>\n\n` +
    `<artifact name="${input.artifactName}">\n${artifact}\n</artifact>\n\n` +
    "Evaluate the artifact against the instruction and return the structured result.";

  const message = await client.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system,
    messages: [{ role: "user", content: userPrompt }],
    output_config: {
      format: { type: "json_schema", schema: EVAL_SCHEMA },
    },
  });

  const text = message.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("");

  if (!text.trim()) {
    throw new Error(
      `Judge returned no text output (stop_reason: ${message.stop_reason}).`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`Judge returned non-JSON output: ${text.slice(0, 500)}`);
  }

  return validateEvalResult(parsed);
}

function validateEvalResult(value: unknown): EvalResult {
  if (typeof value !== "object" || value === null) {
    throw new Error("Judge output is not an object.");
  }
  const v = value as Record<string, unknown>;

  if (v.verdict !== "pass" && v.verdict !== "fail") {
    throw new Error(`Judge output has invalid verdict: ${String(v.verdict)}`);
  }

  const rawScore = typeof v.score === "number" ? v.score : Number(v.score);
  if (!Number.isFinite(rawScore)) {
    throw new Error(`Judge output has invalid score: ${String(v.score)}`);
  }
  const score = Math.max(0, Math.min(100, Math.round(rawScore)));

  if (typeof v.summary !== "string") {
    throw new Error("Judge output is missing a summary.");
  }

  if (!Array.isArray(v.criteria)) {
    throw new Error("Judge output is missing criteria.");
  }
  const criteria = v.criteria.map((c, i) => {
    if (typeof c !== "object" || c === null) {
      throw new Error(`Judge criterion #${i} is not an object.`);
    }
    const crit = c as Record<string, unknown>;
    return {
      name: typeof crit.name === "string" ? crit.name : `criterion_${i + 1}`,
      passed: Boolean(crit.passed),
      note: typeof crit.note === "string" ? crit.note : "",
    };
  });

  return {
    verdict: v.verdict,
    score,
    summary: v.summary,
    criteria,
  };
}
