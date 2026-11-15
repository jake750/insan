import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { detectLocal, sentencesOf } from "../src/detection/local";
import { combine, detect, mergeSentences } from "../src/detection/index";
import { parseJudge } from "../src/detection/judge";
import { bandOf, MIN_WORDS } from "../src/detection/config";
import { SAMPLES } from "../src/ui/samples";

const human = (l: string) => readFileSync(new URL(`./fixtures/human.${l}.txt`, import.meta.url), "utf8");

for (const l of ["en", "fr", "ar"] as const) {
  test(`local detector ranks chatbot prose above human prose (${l})`, () => {
    const ai = detectLocal(SAMPLES[l], l).score;
    const hu = detectLocal(human(l), l).score;
    assert.ok(ai >= 61, `AI sample should be high, got ${ai}`);
    assert.ok(hu <= 30, `human sample should be low, got ${hu}`);
  });
}

test("bands follow 0–30 / 31–60 / 61–100", () => {
  assert.equal(bandOf(0), "low");
  assert.equal(bandOf(30), "low");
  assert.equal(bandOf(31), "mixed");
  assert.equal(bandOf(60), "mixed");
  assert.equal(bandOf(61), "high");
});

test("short text is scored but marked unreliable, without dividing by zero", async () => {
  const r = await detect("Hi.");
  assert.equal(r.reliable, false);
  assert.ok(Number.isFinite(r.score));
  const empty = await detect("");
  assert.equal(empty.score, 0);
  assert.ok(MIN_WORDS === 50);
});

test("Arabic sentence offsets line up with the text (؟ and no space after punctuation)", () => {
  const text = "هل جرّبت ذلك؟نعم جرّبته.\n\nثم ماذا؟ لا شيء!";
  for (const s of sentencesOf(text)) assert.equal(text.slice(s.start, s.end), s.text);
  assert.equal(sentencesOf(text).length, 4);
});

test("ensemble skips failed sources and renormalises weights", () => {
  const score = combine([
    { id: "local", score: 80, weight: 1 },
    { id: "gptzero", score: null, weight: 3, error: "Key rejected (401)" },
    { id: "sapling", score: 20, weight: 2 },
  ]);
  assert.equal(score, 40); // (80*1 + 20*2) / 3
});

test("external sentence scores merge onto local spans by word overlap", () => {
  const local = detectLocal("Moreover, the plan works well. I ate soup at noon and it was cold.", "en").sentences;
  const merged = mergeSentences(local, [{ id: "sapling", score: 50, weight: 2, sentences: [{ text: "Moreover the plan works well", score: 100 }] }]);
  assert.ok(merged[0].score > local[0].score);
  assert.equal(merged[1].score, local[1].score);
});

test("LLM judge reply parsing: fences, out-of-range indexes and missing overall", () => {
  const r = parseJudge('```json\n{"sentences":[{"i":1,"score":90,"reason":"stock opener"},{"i":7,"score":10},{"i":2,"score":"30"}]}\n```', ["A.", "B."]);
  assert.equal(r.score, 60);
  assert.deepEqual(r.sentences.map((s) => s.score), [90, 30]);
  assert.throws(() => parseJudge("I think it's AI.", ["A."]));
});

test("sentence reasons name the tell", () => {
  const r = detectLocal("Moreover, it is important to note that we delve into the data. It works.", "en");
  const codes = r.sentences[0].reasons.map((x) => x.code);
  assert.ok(codes.includes("transition") && codes.includes("cliche"));
});
