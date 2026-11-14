import { test } from "node:test";
import assert from "node:assert/strict";
import { detectLang, protect, unprotect, splitBlocks, chunkBlocks, mustKeep, missingItems } from "../src/engine/text";
import { splitSentences } from "../src/analysis/sentences";
import { analyzeText } from "../src/analysis/metrics";
import { buildDoc, docText, updateSeg } from "../src/engine/doc";
import { buildRewriteSystem } from "../src/engine/prompts";
import { DEFAULT_OPTIONS } from "../src/engine/types";

test("language detection", () => {
  assert.equal(detectLang("The quick brown fox jumps over the lazy dog and it is fine."), "en");
  assert.equal(detectLang("Le chat est sur la table et nous sommes dans la cuisine."), "fr");
  assert.equal(detectLang("يلعب الذكاء الاصطناعي دوراً محورياً في عالمنا المتسارع."), "ar");
});

test("protect / unprotect round-trip", () => {
  const src = "See https://example.com/a?b=1 and `npm run dev` (Smith, 2020) [3] mail a.b@c.org";
  const p = protect(src, []);
  assert.ok(!p.text.includes("https://"));
  assert.ok(!p.text.includes("npm run"));
  assert.equal(unprotect(p.text, p.map), src);
});

test("code fences stay one block; headings travel with next block", () => {
  const blocks = splitBlocks("# Title\n\nPara one.\n\n```js\nconst a = 1;\n\nconst b = 2;\n```\n\nPara two.");
  assert.equal(blocks.length, 4);
  const chunks = chunkBlocks(["# H", "a ".repeat(10), "b ".repeat(10)], 5);
  assert.deepEqual(chunks[0].slice(0, 2), ["# H", "a ".repeat(10)]);
});

test("must-keep numbers accept Arabic-Indic digits", () => {
  const items = mustKeep("Revenue rose 23% to 1,200 units in 2024.", []);
  assert.deepEqual(missingItems("ارتفعت الإيرادات ٢٣% إلى 1200 وحدة عام ٢٠٢٤", items, []), []);
  assert.deepEqual(missingItems("Revenue rose a lot.", ["2024"], []), ["2024"]);
  // French spacing before % (normal, no-break and narrow no-break spaces), Arabic percent sign
  assert.deepEqual(missingItems("selon une étude, 45 % des enseignants", ["45 %"], []), []);
  assert.deepEqual(missingItems("45% des enseignants", ["45 %"], []), []);
  assert.deepEqual(missingItems("نسبة ٤٥٪ من المعلمين", ["45%"], []), []);
});

test("sentence split respects abbreviations and decimals", () => {
  const s = splitSentences("Dr. Smith measured 3.5 kg. It worked! Did it? هل نجح؟ نعم.");
  assert.deepEqual(s.map((x) => x.text), ["Dr. Smith measured 3.5 kg.", "It worked!", "Did it?", "هل نجح؟", "نعم."]);
});

test("naturalness report finds AI phrases in all three languages", () => {
  assert.ok(analyzeText("Moreover, it is important to note that we delve into the tapestry of data.").aiHits.length >= 3);
  assert.ok(analyzeText("Dans un monde en constante évolution, il est essentiel de noter que l'IA joue un rôle clé.").aiHits.length >= 2);
  assert.ok(analyzeText("تجدر الإشارة إلى أن الذكاء الاصطناعي يلعب دوراً محورياً في عالمنا المتسارع.").aiHits.length >= 2);
  const r = analyzeText("Short one. This sentence is quite a bit longer than the first one was. Tiny. Another medium sentence here now.");
  assert.ok(r.burstiness > 0.4 && r.readability && r.readability.score > 0);
});

test("doc alignment: reject restores the original sentence", () => {
  const orig = "AI is changing work. Many jobs will shift. Training matters.";
  const out = "Work is being reshaped by AI. A lot of jobs are going to move around. So training really matters.";
  const doc = buildDoc(orig, out);
  assert.equal(doc[0].length, 3);
  assert.equal(doc[0][1].orig, "Many jobs will shift.");
  const d2 = updateSeg(doc, doc[0][1].id, { text: doc[0][1].orig, status: "rejected" });
  assert.equal(docText(d2), "Work is being reshaped by AI. Many jobs will shift. So training really matters.");
});

test("doc keeps list line breaks", () => {
  const doc = buildDoc("- one\n- two", "- first item\n- second item");
  assert.equal(docText(doc), "- first item\n- second item");
});

test("system prompt includes options", () => {
  const s = buildRewriteSystem({ ...DEFAULT_OPTIONS, mode: "academic", banned: ["utilize"], locked: ["Insan"] }, null);
  assert.ok(s.includes("researcher") && s.includes("utilize") && s.includes("Insan"));
});
