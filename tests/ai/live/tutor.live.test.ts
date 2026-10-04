/**
 * LIVE AI VERIFICATION HARNESS (Phase C). NOT part of normal CI.
 *
 *   RUN_LIVE_AI=true npm run test:live
 *
 * Runs only when RUN_LIVE_AI=true AND the selected provider (AI_PROVIDER) has a key (and, for Gemini, a model) in
 * the environment or .env.local. It makes a handful of real model calls (about 12) against the TEST database,
 * records SAFE metadata only (provider, model name, endpoint host, latency, source, rung, what the request
 * contained, the replies) to docs/evidence/phase-c/, and never prints or stores keys, cookies or database URLs.
 *
 * Honesty guard: the evidence says `verifiedLive: true` ONLY when the provider endpoint is the provider's own
 * default host and every call came from the model. Pointing ANTHROPIC_BASE_URL at the local fake server runs the
 * harness for self-checking and stamps the evidence `verifiedLive: false`.
 *
 * Quality questions (is the reply good teaching?) are RECORDED for human review, not asserted: a model is not
 * required to use one wording. Only app invariants are asserted (labelled AI, request contents, no answer leak).
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '../../../src/server/db';
import { getAiProvider } from '../../../src/server/ai-providers';
import { statesAnswer } from '../../../src/server/tutor/guard';
import { PracticeService } from '../../../src/services/practice.service';
import { TutorService } from '../../../src/services/tutor.service';

const PREFIX = 'live-ai-';
const INTEGERS = 'lesson-math-7-integers';
const OUT_DIR = 'docs/evidence/phase-c';

const wanted = process.env.RUN_LIVE_AI === 'true';
const provider = (() => {
  try {
    return getAiProvider();
  } catch {
    return null;
  }
})();
const configured = Boolean(provider?.isConfigured());
const live = wanted && configured;

if (!live) {
  // Say plainly why nothing runs. No values are printed.
  console.warn(`[live-ai] SKIPPED: RUN_LIVE_AI=${wanted ? 'true' : 'not set'}, provider configured=${configured ? 'yes' : 'NO'}. LIVE AI = NOT VERIFIED.`);
}

type Sent = { host: string; model: string | null; messageCount: number; system: string; user: string; latencyMs: number; status: number | null };
const sent: Sent[] = [];

const endpointHost = () => {
  if (provider?.name === 'gemini') return 'generativelanguage.googleapis.com';
  const base = process.env.ANTHROPIC_BASE_URL?.trim();
  try {
    return new URL(base || 'https://api.anthropic.com').host;
  } catch {
    return 'invalid-base-url';
  }
};
const DEFAULT_HOSTS = ['api.anthropic.com', 'generativelanguage.googleapis.com'];

const similarity = (a: string, b: string) => {
  const A = new Set(a.toLowerCase().match(/[a-z0-9−-]+/g) ?? []);
  const B = new Set(b.toLowerCase().match(/[a-z0-9−-]+/g) ?? []);
  const shared = [...A].filter((w) => B.has(w)).length;
  return A.size + B.size === 0 ? 1 : shared / (A.size + B.size - shared);
};

const evidence: Record<string, unknown> = {};
let realFetch: typeof fetch;

describe.skipIf(!live)('live tutor verification', () => {
  beforeAll(() => {
    realFetch = globalThis.fetch;
    // Pass-through spy: records the outgoing BODY and timing, never headers (they carry the key).
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const started = Date.now();
      let host = 'unknown';
      try {
        host = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url).host;
      } catch {
        /* keep unknown */
      }
      let model: string | null = null;
      let messageCount = 0;
      let system = '';
      let user = '';
      try {
        const body = JSON.parse(String(init?.body ?? '{}'));
        model = body.model ?? null;
        if (Array.isArray(body.messages)) {
          messageCount = body.messages.length;
          user = String(body.messages[0]?.content ?? '');
          system = String(body.system ?? '');
        } else if (Array.isArray(body.contents)) {
          messageCount = body.contents.length;
          user = String(body.contents[0]?.parts?.[0]?.text ?? '');
          system = String(body.systemInstruction?.parts?.[0]?.text ?? '');
        }
      } catch {
        /* not JSON: leave blank */
      }
      let status: number | null = null;
      try {
        const response = await realFetch(input, init);
        status = response.status;
        return response;
      } finally {
        sent.push({ host, model: model ?? (provider?.name === 'gemini' ? process.env.GEMINI_MODEL ?? null : null), messageCount, system, user, latencyMs: Date.now() - started, status });
      }
    }) as typeof fetch;
  });

  afterAll(async () => {
    globalThis.fetch = realFetch;
    await db.user.deleteMany({ where: { email: { startsWith: PREFIX } } });
    const allFromModel = (evidence.allRepliesFromModel as boolean | undefined) === true;
    const onDefaultHost = DEFAULT_HOSTS.includes(endpointHost());
    const final = {
      generatedAt: new Date().toISOString(),
      verifiedLive: allFromModel && onDefaultHost,
      why: onDefaultHost
        ? allFromModel
          ? 'Every tutor reply in this run came from the provider’s own endpoint.'
          : 'Some replies were AUTOMATIC fallbacks: the provider call failed or its reply was rejected by the guard.'
        : 'The endpoint is NOT the provider’s default host: this is a harness self-check, not live verification.',
      provider: provider?.name,
      model: provider?.name === 'gemini' ? process.env.GEMINI_MODEL ?? null : process.env.ANTHROPIC_MODEL?.trim() || 'claude-haiku-4-5-20251001 (code default)',
      endpointHost: endpointHost(),
      requestCount: sent.length,
      ...evidence,
    };
    mkdirSync(OUT_DIR, { recursive: true });
    const name = onDefaultHost ? `live-run-${final.generatedAt.replace(/[:.]/g, '-')}.json` : 'selfcheck-NOT-LIVE.json';
    writeFileSync(`${OUT_DIR}/${name}`, JSON.stringify(final, null, 2));
    console.warn(`[live-ai] evidence written to ${OUT_DIR}/${name} (verifiedLive=${final.verifiedLive})`);
  });

  async function newStudent() {
    return db.user.create({
      data: { email: `${PREFIX}${randomUUID()}@example.com`, passwordHash: 'x', role: 'STUDENT', displayName: 'Live AI Test' },
    });
  }

  async function lastAudit(userId: string) {
    return db.aIInteraction.findFirstOrThrow({ where: { userId }, orderBy: { createdAt: 'desc' } });
  }

  const allReplies: boolean[] = [];

  it('step 3: one real request about adding integers, with the real lesson context', async () => {
    const user = await newStudent();
    const before = sent.length;
    const turn = await TutorService.help(user.id, { message: "I don't understand how to add -3 and 7.", lessonId: INTEGERS });
    const request = sent[before];
    allReplies.push(turn.reply.source === 'AI');

    expect(request, 'a request must have been made').toBeTruthy();
    expect(turn.reply.source, 'the reply must come from the model, not the fallback').toBe('AI');
    expect(turn.reply.label).toBe('Ask Tuklas (AI)');
    expect(request.system).toContain('Operations on Integers');
    expect(request.user).toContain("<student_message>I don't understand how to add -3 and 7.</student_message>");
    const audit = await lastAudit(user.id);
    evidence.step3_smoke = {
      httpStatus: request.status,
      latencyMs: request.latencyMs,
      lessonContextIncluded: request.system.includes('Operations on Integers'),
      historyIncluded: request.user.includes('Conversation so far'),
      messagesInRequest: request.messageCount,
      replySource: turn.reply.source,
      aiInteractionLogged: audit.success,
      reply: turn.reply.content,
    };
  });

  it('step 4: grounding: the request carries the lesson; the reply is recorded for human review', async () => {
    const user = await newStudent();
    const before = sent.length;
    const turn = await TutorService.help(user.id, { message: 'What does absolute value mean in this lesson?', lessonId: INTEGERS });
    allReplies.push(turn.reply.source === 'AI');
    const request = sent[before];
    const requestHas = {
      lessonTitle: request.system.includes('Operations on Integers'),
      lessonContent: request.system.includes('Integers are the set of whole numbers'),
      vocabulary: /Absolute Value/.test(request.system),
      studentQuestion: request.user.includes('What does absolute value mean'),
    };
    expect(Object.values(requestHas).every(Boolean)).toBe(true);
    const mentionsLessonIdeas = /distance|zero|number line|non-negative|positive/i.test(turn.reply.content);
    evidence.step4_grounding = {
      requestContains: requestHas,
      replyMentionsLessonIdeas: mentionsLessonIdeas,
      // PASS only for the REQUEST. Whether the reply is faithful to the lesson needs a person: read `reply`.
      status: requestHas.lessonTitle && requestHas.lessonContent ? (mentionsLessonIdeas ? 'REQUEST PASS; reply plausibly grounded; HUMAN REVIEW NEEDED' : 'REQUEST PASS; reply NOT clearly grounded; HUMAN REVIEW NEEDED') : 'FAIL',
      reply: turn.reply.content,
    };
  });

  it('step 5: four-turn conversation: each request carries the earlier turns', async () => {
    const user = await newStudent();
    const script = ['I think -3 + 7 = -10.', "I still don't understand.", 'Should I move left or right?', 'I think right.'];
    let conversationId: string | undefined;
    const turns: Array<{ student: string; reply: string; source: string; historyTurnsInRequest: number }> = [];
    for (const message of script) {
      const before = sent.length;
      const turn = await TutorService.help(user.id, { message, lessonId: INTEGERS, ...(conversationId ? { conversationId } : {}) });
      conversationId = turn.conversationId;
      allReplies.push(turn.reply.source === 'AI');
      const request = sent[before];
      const historyTurnsInRequest = (request.user.match(/^(Student|Tuklas): /gm) ?? []).length;
      turns.push({ student: message, reply: turn.reply.content, source: turn.reply.source, historyTurnsInRequest });
      expect(request.system).toContain('Operations on Integers');
    }
    // Turn n carries 2(n-1) earlier lines: context grows, it is not reset.
    expect(turns.map((t) => t.historyTurnsInRequest)).toEqual([0, 2, 4, 6]);
    evidence.step5_continuity = { turns, contextGrowsEveryTurn: true, resetsEachTurn: false };
  });

  it('step 6: "just give me the answer" on an open question: the answer must not be stated', async () => {
    const user = await newStudent();
    const session = await PracticeService.startLessonBankSession(user.id, { lessonId: INTEGERS, total: 4 });
    const row = await db.practiceQuestion.findFirstOrThrow({ where: { sessionId: session.id }, orderBy: { position: 'asc' } });
    const correct = (row.options as string[])[row.correctIndex];
    const turn = await TutorService.help(user.id, { message: 'Just give me the answer.', practiceQuestionId: row.id });
    const audit = await lastAudit(user.id);
    allReplies.push(turn.reply.source === 'AI');
    // The app's own detector (it knows a step number like "Hint 1" is not the answer 1).
    const leaked = statesAnswer(turn.reply.content, correct, row.question);
    const scaffolds = /\?|try|think|look|what|how|first|step|number line|sign/i.test(turn.reply.content);
    evidence.step6_socratic = {
      question: row.question,
      replySource: turn.reply.source,
      fallbackReason: (audit.metadata as { fallbackReason?: string | null } | null)?.fallbackReason ?? null,
      answerLeaked: leaked,
      offersScaffolding: scaffolds,
      // Heuristic only. A guard rejection (AUTOMATIC) means the MODEL tried to leak and the app stopped it.
      status: turn.reply.source === 'AUTOMATIC' ? 'FAIL (model leaked or broke a rule; the app guard caught it)' : leaked ? 'FAIL' : scaffolds ? 'PASS (HUMAN REVIEW NEEDED)' : 'PARTIAL',
      reply: turn.reply.content,
    };
    expect(leaked, 'a model reply that states the answer must never reach the student').toBe(false);
  });

  it('step 7: the same wrong answer twice: replies recorded, repetition measured, no result forced', async () => {
    const user = await newStudent();
    const session = await PracticeService.startLessonBankSession(user.id, { lessonId: INTEGERS, total: 4 });
    const row = await db.practiceQuestion.findFirstOrThrow({ where: { sessionId: session.id }, orderBy: { position: 'asc' } });
    const wrong = (row.options as string[])[(row.correctIndex + 1) % 4];
    const claim = `I think it's ${wrong}`;
    const first = await TutorService.help(user.id, { message: claim, practiceQuestionId: row.id });
    const second = await TutorService.help(user.id, { message: claim, practiceQuestionId: row.id, conversationId: first.conversationId });
    allReplies.push(first.reply.source === 'AI', second.reply.source === 'AI');
    const sim = similarity(first.reply.content, second.reply.content);
    const recognisedRepetition = /again|same|already|still|once more|repeat/i.test(second.reply.content);
    const lastRequest = sent[sent.length - 1];
    evidence.step7_repeated = {
      response1: first.reply.content,
      response2: second.reply.content,
      rung1: first.reply.rung,
      rung2: second.reply.rung,
      wordSimilarity: Number(sim.toFixed(2)),
      requestWasTold: { sameAnswerAsBefore: /same (answer|attempt)|already (tried|said)/i.test(lastRequest.system), earlierTurnsIncluded: lastRequest.user.includes('Conversation so far') },
      replyAcknowledgesRepetition: recognisedRepetition,
      // The app does NOT yet track repetition (Phase D). Any difference here comes from the model alone.
      classification: sim >= 0.8 ? 'NOT ADAPTIVE (near-identical replies)' : 'DIFFERENT TEXT; the app gave the model no repetition signal, so this is NOT proof of adaptation',
    };
  });

  it('records whether every reply in this run came from the model', () => {
    evidence.allRepliesFromModel = allReplies.length > 0 && allReplies.every(Boolean);
    evidence.repliesFromModel = allReplies.filter(Boolean).length;
    evidence.repliesTotal = allReplies.length;
    expect(allReplies.length).toBeGreaterThan(0);
  });
});
