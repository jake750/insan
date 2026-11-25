// The multi-pass pipeline: analyse → rewrite (chunked, streamed) → verify → repair.
import {
  ANALYZE_SYSTEM,
  POLISH_SYSTEM,
  buildPolishUser,
  REPAIR_SYSTEM,
  VERIFY_SYSTEM,
  buildAlternativesSystem,
  buildAlternativesUser,
  buildAnalyzeUser,
  buildRepairUser,
  buildRewriteSystem,
  buildRewriteUser,
  buildVerifyUser,
} from "./prompts";
import { makeChat, parseJsonReply, stripThinking, type Chat } from "./providers";
import { styleIssues } from "./style";
import { chunkBlocks, detectLang, missingItems, mustKeep, protect, splitBlocks, unprotect, wordCount } from "./text";
import {
  EngineError,
  type ChunkResult,
  type DocBrief,
  type Lang,
  type PipelineEvent,
  chunkWords,
  type ProviderConfig,
  type RewriteOptions,
  type VerifyIssue,
} from "./types";

export interface PipelineResult {
  output: string;
  brief: DocBrief;
  chunks: ChunkResult[];
}

interface RunArgs {
  input: string;
  options: RewriteOptions;
  provider: ProviderConfig;
  signal?: AbortSignal;
  onEvent?: (e: PipelineEvent) => void;
}

const LENGTH_FACTOR: Partial<Record<RewriteOptions["mode"], number>> = { expand: 2, storytelling: 1.5, creative: 1.3, conversational: 1.2, shorten: 0.8 };

function tokenBudget(words: number, provider: ProviderConfig, mode: RewriteOptions["mode"]): number {
  const est = Math.ceil(words * 2.6 * (LENGTH_FACTOR[mode] ?? 1.15)) + 400;
  // Claude models think adaptively and thinking counts toward max_tokens, so leave headroom.
  return provider.kind === "anthropic" ? Math.min(64000, Math.max(16000, est * 3)) : Math.max(1200, est);
}

/** Clean model chatter that sometimes wraps the rewrite. */
function cleanRewrite(s: string): string {
  let t = stripThinking(s).trim();
  t = t.replace(/^<\/?(source|rewrite|output)>\s*/i, "").replace(/\s*<\/(source|rewrite|output)>$/i, "");
  t = t.replace(/^(here is|here's|voici|إليك)[^\n]{0,80}:\s*\n+/i, "");
  return t.trim();
}

/** Keep a polished chunk only if it kept every placeholder and paragraph, did not shrink or balloon, and has fewer tells. */
export function acceptPolish(before: string, after: string, placeholders: string[], beforeWeight: number, lang: Lang, map: Map<string, string>, keepParagraphs = true): boolean {
  if (placeholders.some((p) => !after.includes(p))) return false;
  if (keepParagraphs && splitBlocks(after).length !== splitBlocks(before).length) return false;
  const ratio = wordCount(after) / Math.max(1, wordCount(before));
  if (ratio < 0.75 || ratio > 1.35) return false;
  return styleIssues(unprotect(after, map), lang).weight < beforeWeight;
}

async function analyze(chat: Chat, text: string, signal?: AbortSignal): Promise<Partial<DocBrief> | null> {
  const sample = text.split(/\s+/).slice(0, 2500).join(" ");
  try {
    const raw = await chat({ system: ANALYZE_SYSTEM, user: buildAnalyzeUser(sample), maxTokens: 6000, signal });
    return parseJsonReply<Partial<DocBrief>>(raw);
  } catch (e) {
    if (e instanceof EngineError && e.code !== "bad_request" && e.code !== "unknown") throw e;
    return null; // analysis is best-effort
  }
}

export async function runPipeline({ input, options, provider, signal, onEvent }: RunArgs): Promise<PipelineResult> {
  const chat = makeChat(provider);
  const emit = (e: PipelineEvent) => onEvent?.(e);
  const lang = detectLang(input);
  const prot = protect(input, options.locked);
  const totalWords = wordCount(input);

  // 1 — Analyse
  let brief: DocBrief = { lang, register: "as in source", domain: "general", keep: [], terminology: [] };
  if (totalWords >= 60) {
    emit({ stage: "analyzing" });
    const a = await analyze(chat, prot.text, signal);
    if (a) {
      brief = {
        lang,
        register: String(a.register ?? brief.register).slice(0, 80),
        domain: String(a.domain ?? brief.domain).slice(0, 80),
        // only keep items that really occur in the source, so a hallucinated list can't distort the rewrite
        keep: (Array.isArray(a.keep) ? a.keep : []).map(String).filter((k) => k.length > 1 && input.includes(k)).slice(0, 40),
        terminology: (Array.isArray(a.terminology) ? a.terminology : []).map(String).slice(0, 10),
      };
    }
  }
  emit({ stage: "rewriting", brief });

  // 2 — Chunk
  const maxWords = chunkWords(provider);
  const chunks = chunkBlocks(splitBlocks(prot.text), maxWords).map((c) => c.join("\n\n"));
  const system = buildRewriteSystem(options, brief);
  const done: string[] = [];
  const results: ChunkResult[] = [];
  const show = (current: string) => unprotect([...done, current].filter(Boolean).join("\n\n"), prot.map);

  for (let i = 0; i < chunks.length; i++) {
    if (signal?.aborted) throw new EngineError("aborted", "Stopped.");
    const chunk = chunks[i];
    const placeholders = [...chunk.matchAll(/⟦P\d+⟧/g)].map((m) => m[0]);
    // a chunk that is only protected material (e.g. a code block) is copied through untouched
    if (!/\p{L}{2,}/u.test(chunk.replace(/⟦P\d+⟧/g, ""))) {
      done.push(chunk);
      results.push({ index: i, original: unprotect(chunk, prot.map), rewritten: unprotect(chunk, prot.map), issues: [], repaired: false });
      continue;
    }
    const previous = done.length ? done.join("\n\n").split(/\n\n/).slice(-2).join("\n\n") : "";
    emit({ stage: "rewriting", chunk: i, totalChunks: chunks.length, text: show("") });

    let streamed = "";
    const raw = await chat({
      system,
      user: buildRewriteUser(chunk, previous, i > 0),
      maxTokens: tokenBudget(wordCount(chunk), provider, options.mode),
      signal,
      onText: (d) => {
        streamed += d;
        emit({ stage: "rewriting", chunk: i, totalChunks: chunks.length, text: show(cleanRewrite(streamed)) });
      },
    });
    let rewritten = cleanRewrite(raw);
    if (!rewritten) throw new EngineError("unknown", "The model returned an empty response.");

    // 3 — Verify (local checks always; LLM check when enabled)
    const origPlain = unprotect(chunk, prot.map);
    const keepItems = mustKeep(origPlain, [...brief.keep, ...options.locked]).map((s) => s);
    const localMissing = () =>
      missingItems(unprotect(rewritten, prot.map), keepItems, []).concat(placeholders.filter((p) => !rewritten.includes(p)).map((p) => prot.map.get(p) ?? p));
    // structural check: one output paragraph per source paragraph when formatting is kept
    const paraIssue = (): VerifyIssue[] => {
      if (!options.keepFormatting) return [];
      const want = splitBlocks(chunk).length;
      const got = splitBlocks(rewritten).length;
      return want === got ? [] : [{ kind: "lost", detail: `The source has ${want} paragraphs but the rewrite has ${got}. Keep exactly one paragraph per source paragraph, in order, and keep each paragraph's content in it.` }];
    };
    let issues: VerifyIssue[] = [
      ...localMissing().map((m) => ({ kind: "protected" as const, detail: `"${m.slice(0, 80)}" must appear unchanged` })),
      ...paraIssue(),
    ];

    if (options.verify) {
      emit({ stage: "verifying", chunk: i, totalChunks: chunks.length, text: show(rewritten) });
      const v = await chat({
        system: VERIFY_SYSTEM,
        user: buildVerifyUser(origPlain, unprotect(rewritten, prot.map), keepItems),
        maxTokens: provider.kind === "anthropic" ? 12000 : 1500,
        signal,
      }).catch((e) => {
        if (e instanceof EngineError && (e.code === "aborted" || e.code === "auth")) throw e;
        return "";
      });
      const parsed = parseJsonReply<{ issues?: VerifyIssue[] }>(v);
      const llmIssues = (parsed?.issues ?? []).filter((x) => x && x.detail && ["added", "lost", "changed", "protected"].includes(x.kind));
      issues = [...issues, ...llmIssues];
    }

    let repaired = false;
    let repairs: VerifyIssue[] = [];
    if (issues.length) {
      emit({ stage: "repairing", chunk: i, totalChunks: chunks.length, text: show(rewritten), issues });
      const fixed = cleanRewrite(
        await chat({
          system: REPAIR_SYSTEM + " Keep tokens like ⟦P0⟧ exactly as they are.",
          user: buildRepairUser(chunk, rewritten, issues),
          maxTokens: tokenBudget(wordCount(chunk), provider, options.mode),
          signal,
        }),
      );
      if (fixed) {
        rewritten = fixed;
        repaired = true;
      }
      // whatever is still missing after repair is reported, not hidden
      const found = issues;
      const missBefore = localMissing();
      const paraBefore = paraIssue().length > 0;
      issues = [
        ...localMissing().map((m) => ({ kind: "protected" as const, detail: m.slice(0, 120) })),
        ...paraIssue().map(() => ({ kind: "structure" as const, detail: "" })),
      ];
      if (repaired) {
        // what the repair really fixed: restored items, plus the model-found drift (and paragraph fix) that is gone
        const missAfter = new Set(localMissing());
        const paraFixed = paraBefore && !paraIssue().length;
        repairs = [
          ...missBefore.filter((m) => !missAfter.has(m)).map((m) => ({ kind: "protected" as const, detail: m.slice(0, 120) })),
          ...found
            .filter((x) => x.kind !== "protected" && (!x.detail.startsWith("The source has") || paraFixed))
            .map((x) => (x.detail.startsWith("The source has") ? { kind: "structure" as const, detail: "" } : x)),
        ];
      }
    }

    // 4 — Polish last, so nothing undoes it: name the tells that survived and fix only those
    // (up to two rounds; a round is kept only if it loses no protected item and lowers the tells)
    if (options.polish) {
      for (let round = 0; round < 2; round++) {
        const style = styleIssues(unprotect(rewritten, prot.map), lang);
        if (!style.issues.length) break;
        emit({ stage: "polishing", chunk: i, totalChunks: chunks.length, text: show(rewritten) });
        const polished = cleanRewrite(
          await chat({
            system: POLISH_SYSTEM,
            user: buildPolishUser(rewritten, style.issues),
            maxTokens: tokenBudget(wordCount(chunk), provider, options.mode),
            signal,
          }).catch((e) => {
            if (e instanceof EngineError && (e.code === "aborted" || e.code === "auth")) throw e;
            return ""; // polishing is best-effort
          }),
        );
        if (!polished || !acceptPolish(rewritten, polished, placeholders, style.weight, lang, prot.map, options.keepFormatting)) break;
        const before = localMissing().length;
        const prev = rewritten;
        rewritten = polished;
        if (localMissing().length > before) {
          rewritten = prev;
          break;
        }
      }
    }

    done.push(rewritten);
    const missingNow = new Set(localMissing());
    const kept = keepItems.filter((k) => !missingNow.has(k));
    results.push({ index: i, original: origPlain, rewritten: unprotect(rewritten, prot.map), issues, repaired, fixed: repairs, kept });
    emit({ stage: "rewriting", chunk: i + 1, totalChunks: chunks.length, text: show(""), issues });
  }

  const output = unprotect(done.join("\n\n"), prot.map);
  emit({ stage: "done", text: output, brief, totalChunks: chunks.length });
  return { output, brief, chunks: results };
}

/** Three alternatives for one sentence or paragraph, in context. */
export async function alternatives(args: {
  target: string;
  before: string;
  after: string;
  unit: "sentence" | "paragraph";
  options: RewriteOptions;
  provider: ProviderConfig;
  brief: DocBrief | null;
  signal?: AbortSignal;
}): Promise<string[]> {
  const chat = makeChat(args.provider);
  const prot = protect(args.target, args.options.locked);
  const brief = args.brief ?? { lang: detectLang(args.target + args.before), register: "as in source", domain: "general", keep: [], terminology: [] };
  const raw = await chat({
    system: buildAlternativesSystem(args.options, brief, args.unit),
    user: buildAlternativesUser(prot.text, args.before, args.after),
    maxTokens: args.provider.kind === "anthropic" ? 12000 : 1500,
    signal: args.signal,
  });
  const parsed = parseJsonReply<{ alternatives?: string[] }>(raw);
  let list = parsed?.alternatives?.filter((s) => typeof s === "string" && s.trim()) ?? [];
  if (!list.length) {
    // fallback for models that ignore the JSON instruction: numbered lines
    list = stripThinking(raw)
      .split(/\n+/)
      .map((l) => l.replace(/^\s*(\d+[.)]|[-*•])\s*/, "").trim())
      .filter((l) => l.length > 3);
  }
  return list.slice(0, 3).map((s) => unprotect(s.trim(), prot.map));
}
