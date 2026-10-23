import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createGroq } from "@ai-sdk/groq";
import { generateText, Output, type LanguageModel } from "ai";
import { llmOutputSchema, type LlmOutput } from "./schema";

/** One step in the fallback chain. Throws on any failure (HTTP error, timeout, invalid JSON). */
export type ParseProvider = {
  name: string;
  generate: (input: { system: string; prompt: string }) => Promise<LlmOutput>;
};

const TIMEOUT_MS = 60_000;

function fromModel(name: string, model: LanguageModel): ParseProvider {
  return {
    name,
    async generate({ system, prompt }) {
      const { output } = await generateText({
        model,
        system,
        prompt,
        temperature: 0,
        // Fail fast and move to the next provider instead of retrying a rate-limited one.
        maxRetries: 0,
        timeout: TIMEOUT_MS,
        output: Output.object({ schema: llmOutputSchema }),
      });
      return output;
    },
  };
}

/**
 * Builds the fallback chain from env: Gemini first, then Groq. Providers without an API key are skipped.
 * Model IDs are env-configurable because free-tier model names change (see .env.example).
 */
export function providersFromEnv(env: NodeJS.ProcessEnv = process.env): ParseProvider[] {
  const chain: ParseProvider[] = [];
  if (env.GOOGLE_GENERATIVE_AI_API_KEY) {
    const google = createGoogleGenerativeAI({ apiKey: env.GOOGLE_GENERATIVE_AI_API_KEY });
    const id = env.LLM_PRIMARY_MODEL || "gemini-3.8-flash";
    chain.push(fromModel(`google:${id}`, google(id)));
  }
  if (env.GROQ_API_KEY) {
    const groq = createGroq({ apiKey: env.GROQ_API_KEY });
    const id = env.LLM_FALLBACK_MODEL || "llama-3.3-70b-versatile";
    chain.push(fromModel(`groq:${id}`, groq(id)));
  }
  return chain;
}
