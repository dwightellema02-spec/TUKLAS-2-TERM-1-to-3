/**
 * Tuklas 2.0 — Picks the document chunks most relevant to what a student is asking (master plan §8, §6).
 *
 * Deterministic lexical retrieval: no embeddings, no external service. Score = how many distinct
 * query words appear in the chunk (rarer words count more), with a bonus for matches in the heading.
 * If nothing matches, nothing is returned: the tutor must not be handed unrelated material.
 */

export type RetrievableChunk = { id: string; heading: string; content: string; position: number };

const STOP_WORDS = new Set([
  'the', 'and', 'for', 'are', 'but', 'not', 'you', 'with', 'this', 'that', 'what', 'how', 'why', 'can', 'does', 'from',
  'have', 'has', 'was', 'were', 'will', 'would', 'could', 'should', 'your', 'about', 'when', 'where', 'which', 'who',
  'ang', 'ng', 'sa', 'na', 'ay', 'mga', 'ko', 'ba', 'po', 'yung', 'ito', 'dito', 'paano', 'bakit', 'ano',
  'help', 'hint', 'please', 'give', 'answer', 'question', 'understand', 'dont', 'don', 'know', 'still', 'get',
]);

export function tokenize(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9]+(?:'[a-z]+)?/g) ?? []).filter((word) => word.length > 2 && !STOP_WORDS.has(word));
}

export function findRelevantChunks<T extends RetrievableChunk>(query: string, chunks: T[], limit = 3): T[] {
  const queryWords = [...new Set(tokenize(query))];
  if (queryWords.length === 0 || chunks.length === 0) return [];

  const chunkWords = chunks.map((chunk) => new Set(tokenize(`${chunk.heading} ${chunk.content}`)));
  const headingWords = chunks.map((chunk) => new Set(tokenize(chunk.heading)));

  // Words found in fewer chunks are more telling (inverse document frequency).
  const weight = (word: string) => {
    const containing = chunkWords.filter((set) => set.has(word)).length;
    return containing === 0 ? 0 : Math.log(1 + chunks.length / containing);
  };

  return chunks
    .map((chunk, index) => {
      let score = 0;
      for (const word of queryWords) {
        if (chunkWords[index].has(word)) score += weight(word) * (headingWords[index].has(word) ? 2 : 1);
      }
      return { chunk, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.chunk.position - b.chunk.position)
    .slice(0, limit)
    .map((entry) => entry.chunk);
}
