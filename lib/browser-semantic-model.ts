import type { FeatureExtractionPipelineType } from "@huggingface/transformers";

export type SemanticIntent<T extends string> = {
  intent: T;
  examples: string;
};

let extractorPromise: Promise<FeatureExtractionPipelineType> | null = null;

async function getExtractor() {
  if (!extractorPromise) {
    extractorPromise = import("@huggingface/transformers")
      .then(({ pipeline }) =>
        pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2", {
          dtype: "q8",
        }),
      )
      .catch((error) => {
        extractorPromise = null;
        throw error;
      });
  }

  return extractorPromise;
}

function dotProduct(left: number[], right: number[]) {
  let total = 0;
  for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
    total += left[index] * right[index];
  }
  return total;
}

export async function rankBrowserSemanticIntent<T extends string>(
  query: string,
  intents: Array<SemanticIntent<T>>,
) {
  const extractor = await getExtractor();
  const embeddings = await extractor(
    [query, ...intents.map((item) => item.examples)],
    { pooling: "mean", normalize: true },
  );
  const vectors = embeddings.tolist() as number[][];
  const queryVector = vectors[0];

  if (!queryVector) {
    return null;
  }

  return intents.reduce<{ intent: T; score: number } | null>((best, item, index) => {
    const intentVector = vectors[index + 1];
    const score = intentVector ? dotProduct(queryVector, intentVector) : 0;
    return !best || score > best.score ? { intent: item.intent, score } : best;
  }, null);
}
