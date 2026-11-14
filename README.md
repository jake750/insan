# Insan · إنسان

Insan rewrites stiff or AI-sounding text so it reads like a person wrote it, and keeps the meaning exactly. It runs in your browser with your own model key: Claude by default, or any OpenAI-compatible endpoint, including a local model through Ollama.

- **Multi-pass engine.** It reads the text first (language, register, domain, protected items), then rewrites it at sentence and paragraph level, then checks the meaning and repairs any drift automatically.
- **Private by design.** No accounts, analytics, trackers, cookies, third-party fonts or CDNs. Your key and history stay in your browser. Panic wipe erases everything in one click.
- **Three languages, full RTL.** English (US/UK), French (France or Maghreb usage) and Arabic (MSA, or with a Tunisian, Egyptian or Gulf flavour). The interface is available in English, French and Arabic.

> **Tech choice:** Next.js (App Router) + TypeScript + Tailwind 4. It deploys to Vercel in one step, and it is the simplest way to ship the optional stateless proxy (one route handler) next to a static client app.

---

## Install (easiest)

You need [Node.js](https://nodejs.org) 20.9 or newer. On Windows the installer offers to install it for you with `winget`.

**Windows:** unzip, then double-click **`install-windows.cmd`**. It installs into `%LOCALAPPDATA%\Insan`, builds the app, and adds an **Insan** icon to the Desktop and the Start Menu (with *Stop Insan* and *Uninstall Insan* next to it). No admin rights needed.

**macOS / Linux:** unzip, then run `bash install-mac-linux.sh`. It installs into `~/.local/share/insan` and adds an `insan` command (`insan stop` stops it), plus a menu entry on Linux or `~/Applications/Insan.command` on macOS.

The first install downloads the dependencies once (a few minutes). After that the icon starts a small server on this computer only (http://localhost:3210) and opens it in your browser. From there you can also install it as an app from the browser's address bar. Uninstalling doesn't touch what the browser stored: use **Panic wipe** in Settings first if you want your key and history gone too.

## Run it locally (developers)

```bash
npm install
npm run dev
```

Open http://localhost:3210.

`npm install` copies the pdf.js worker into `public/` (`scripts/copy-pdf-worker.mjs`) so PDF import needs no CDN. If your npm blocks install scripts, run `node scripts/copy-pdf-worker.mjs` once.

Other scripts:

| Command | What it does |
| --- | --- |
| `npm run build && npm start` | Production build and server |
| `npm test` | Engine and analysis unit tests (`tests/engine.test.ts`) |
| `npm run typecheck` | TypeScript check |

## Add a model key

Open **Settings** (gear icon, or `Ctrl/⌘ + ,`).

**Claude (default)**
1. Create a key at https://console.anthropic.com.
2. Paste it into *API key*. Pick a model: `claude-opus-5-5` (default, best quality), `claude-sonnet-5-5`, `claude-haiku-5-5` (fastest and cheapest) or `claude-fable-5-2`.
3. *Effort* trades speed for care. Medium is the default.
4. Press **Test connection**.

The key is stored in `localStorage` only, or in `sessionStorage` if you turn off *Remember the key on this device*. It is sent only to `api.anthropic.com`, or to your proxy if you enable it.

**OpenAI-compatible / local**
Choose *OpenAI-compatible / local* and pick a preset: Ollama, LM Studio, OpenAI or OpenRouter. You can also type any `…/v1` base URL. Local endpoints need no key.

### Fully offline with Ollama

```bash
ollama pull qwen3.5:4b
ollama serve
```

Ollama accepts requests from `localhost` origins by default. If you serve Insan from another origin, allow it:

```bash
OLLAMA_ORIGINS="https://your-insan-domain" ollama serve
```

Keep *Turn off model "thinking"* on for reasoning models like Qwen: it is much faster on modest hardware. Once the app has loaded, the service worker serves it offline, so Insan with Ollama needs no network at all.

## Deploy (Vercel)

1. Push this folder to a Git repository.
2. On https://vercel.com, choose **Add New → Project**, import the repository and press **Deploy**. No configuration is needed.
3. Optional environment variables for the proxy:
   - `INSAN_PROXY_DISABLED=1` turns the proxy off completely.
   - `INSAN_PROXY_HOSTS=api.anthropic.com,api.openai.com` restricts which hosts it may reach. This is the allowlist, and only HTTPS hosts are allowed.

Any Node host works too: `npm run build && npm start`.

---

## How the engine works

```
src/
  engine/
    prompts.ts      ← every prompt, one guide per mode, AI-pattern lists. Tune here.
    pipeline.ts     ← analyse → chunk → rewrite (streamed) → verify → repair
    text.ts         ← language detection, protected items, paragraph-aware chunking
    providers.ts    ← Anthropic SDK (browser) + OpenAI-compatible streaming, error mapping
    doc.ts          ← sentence segments aligned to originals (accept / reject / undo)
    types.ts
  analysis/
    metrics.ts      ← local naturalness report (no network)
    sentences.ts    ← EN / FR / AR sentence splitter
  ui/               ← React components, i18n, store, history (IndexedDB), file import/export
  app/              ← Next.js shell, PWA icons, stateless proxy route
```

1. **Analyse.** The language is detected locally. Code, URLs, emails and citations such as `[3]` or `(Smith, 2020)` are swapped for opaque placeholders (`⟦P0⟧`), so the model never sees them and cannot alter them. A short model call returns the register, the domain, names and terms to keep, and terminology notes. Any "keep" item that is not literally in the source is dropped.
2. **Rewrite.** The text is split at paragraph boundaries. Fenced code stays whole and headings travel with the paragraph that follows them. Chunks are about 900 words for Claude and 450 for small local models. Each chunk gets the same system prompt plus the last two rewritten paragraphs, so tone and terms stay consistent. Output streams live.
3. **Verify.** A local check confirms that every number (Arabic-Indic digits included), quotation, locked term and placeholder survived. A second model pass compares original and rewrite and reports anything *added*, *lost*, *changed* or *protected*.
4. **Repair.** If any issue is found, a minimal-edit repair pass fixes only those points. Whatever the local check still finds missing after repair is shown to you, never hidden.

### Tuning the prompts

Open `src/engine/prompts.ts`:

- `MODE_GUIDES`: one paragraph per mode (12 modes).
- `INTENSITY`: what each step of the Light touch → Full rewrite slider allows.
- `AI_PATTERNS`: machine-writing tells per language. Add the phrases you keep seeing.
- `buildRewriteSystem()`: assembles all of the above with the user's options.
- `ANALYZE_SYSTEM`, `VERIFY_SYSTEM`, `REPAIR_SYSTEM` and `buildAlternativesSystem()`: the other passes.

The local stock-phrase detector, which feeds the report and the highlighting, has its own list in `src/analysis/metrics.ts` (`AI_PHRASES`).

## Features

**Options**
- 12 modes: Standard, Fluent, Academic, Formal, Casual, Creative, Simple, Expand, Shorten, Persuasive, Story, Technical.
- Intensity slider; tone sliders for formality, warmth, confidence and emotion; reading level from grade 6 to expert.
- Audience field; *Write like this sample* (voice imitation).
- Language variant: EN US/UK, FR France/Maghreb, AR MSA/Tunisian/Egyptian/Gulf.
- Locked words, glossary (`original => preferred`), banned words, keep formatting, and the meaning check on or off.
- Presets: save and apply named option sets.

**Editor**
- Side-by-side panes with a diff view (removed text struck through, new text highlighted).
- Click any sentence to **Keep**, **Revert to original** (sentence alignment uses a DP over 1-1, 1-2 and 2-1 matches) or get **3 alternatives**.
- **3 versions of a paragraph** (layers icon next to each paragraph).
- Select text across sentences, then **Regenerate selection**.
- Undo/redo for every change; edit the whole output by hand.
- Word and character counts, reading time, length change in %.
- Drag-and-drop import of .txt, .md, .docx and .pdf. Export as copy, .txt, .md, .docx (author, app and date metadata removed) or PDF (through the browser's print engine, which gives correct Arabic shaping and RTL).
- Optional local history in IndexedDB, with search, delete and *Delete all history*.
- Command palette (`Ctrl/⌘ K`), dark/light/system theme, interface in EN/FR/AR, responsive down to phones (Original/Rewrite tabs), installable PWA.

**Naturalness report** (local, shown before and after)
- Sentence rhythm bars and length variety (coefficient of variation, also called "burstiness").
- Average sentence length, stock phrases (with in-text highlighting), repeated openers, passive voice (EN/FR) and word variety (MATTR).
- Readability: Flesch for EN, Kandel–Moles for FR, and an approximate measure for AR (no standard formula works on unvocalised Arabic, so the app labels it as approximate).
- It is presented as writing-quality feedback, not as a promise about any detector.

**Every state is designed:** empty input with one-click samples, no model connected, loading/streaming with stage steps (Reading → Rewriting part n of m → Checking meaning → Fixing drift), stopped (partial output kept), auth error, rate limit with a countdown and Retry, network/CORS errors with a shortcut to Settings, refusal, long and very long text notices.

### Keyboard

| Action | Keys |
| --- | --- |
| Humanize / stop | `Ctrl/⌘ ↵`, `Esc` |
| Command palette | `Ctrl/⌘ K` |
| Diff view | `Ctrl/⌘ ⇧ D` |
| Copy output | `Ctrl/⌘ ⇧ C` |
| Undo / redo (output) | `Ctrl/⌘ Z`, `Ctrl/⌘ ⇧ Z` |
| Settings | `Ctrl/⌘ ,` |
| Mode 1–9 | `Alt 1…9` |
| Shortcuts | `Ctrl/⌘ /` |

## Privacy

- No accounts, analytics, trackers or cookies. Fonts (IBM Plex Sans Arabic, Literata, Noto Naskh Arabic) are bundled from npm and served from the app itself.
- A strict Content-Security-Policy and `Referrer-Policy: no-referrer` apply. The app makes no requests except to the endpoint you choose.
- **Direct mode (default):** the browser calls the provider directly. For Claude, the official SDK runs with `dangerouslyAllowBrowser`, which is safe here because the key is your own.
- **Proxy mode:** `POST /api/proxy/*` forwards only the needed headers to an allowlisted HTTPS host and streams the reply back. It stores nothing, logs nothing and sets no cookies.
- The service worker caches only the app's own static files, never API traffic or your text.
- **Panic wipe** (Settings) erases the key, settings, presets, history (IndexedDB) and caches.

---

## Test samples (before / after)

These were produced by the app itself in a real browser, using the **local Ollama model `qwen3.5:4b`** (a 4-billion-parameter model on a modest laptop) with the meaning check on. Claude models produce noticeably better rewrites. These samples show the pipeline working end to end with the weakest supported setup. The figures come from the app's own naturalness report.

### English — Standard mode, intensity 3

**Before** (typical chatbot output)

> In today's fast-paced digital landscape, remote work has emerged as a pivotal shift in how organizations operate. It's important to note that this transformation is not just about location; it's about fundamentally reimagining collaboration, productivity, and work-life balance. Moreover, studies show that 68% of employees report higher satisfaction when given flexible arrangements.
>
> Furthermore, companies that leverage robust digital tools can foster a culture of trust and accountability. Additionally, remote work unlocks access to a diverse, global talent pool. However, it is crucial to acknowledge the challenges, such as isolation, communication gaps, and blurred boundaries.
>
> In conclusion, remote work is a multifaceted phenomenon that requires careful navigation. By embracing best practices, organizations can harness its full potential and thrive in the ever-evolving world of work.

**After**

> Remote work has become a major shift in how organizations run today's digital operations. It goes beyond simply changing locations; it involves completely rethinking collaboration, productivity, and balance between life and work. Data supports this: 68% of employees say they feel more satisfied when offered flexible schedules.
>
> Firms that adopt solid digital tools can build trust and accountability within their teams. At the same time, remote arrangements open doors to a wide, global workforce. That said, there are real hurdles, like isolation, communication breakdowns, and the line between work and home becoming fuzzy.
>
> Remote work is complex, requiring careful handling. When organizations apply proven methods, they can get the most out of this approach and succeed in a constantly shifting environment.

| Naturalness report | Before | After |
|---|---|---|
| Stock AI phrases found | 11 | 0 |
| Sentence length variety | 0.20 | 0.27 |
| Readability (Flesch) | 20 | 39 |
| Word variety | 90% | 93% |
| Words | 124 | 121 |
| Meaning check | — | passed |

The 68% figure was kept. The closing paragraph is still a little generic; a larger model does better there.

### Français — mode Académique, intensité 3

**Before** (typical chatbot output)

> Dans un monde en constante évolution, l'intelligence artificielle joue un rôle clé dans la transformation de l'éducation. Il est important de noter que cette révolution ne concerne pas seulement les outils, mais aussi la manière dont les élèves apprennent, collaborent et s'épanouissent. De plus, selon une étude de 2023, 45 % des enseignants utilisent déjà au moins un outil d'IA en classe.
>
> En outre, l'IA permet de personnaliser les parcours d'apprentissage, d'automatiser les tâches administratives et de favoriser l'inclusion. Par ailleurs, il convient de souligner les enjeux éthiques, tels que la protection des données, les biais algorithmiques et la dépendance technologique.
>
> En conclusion, l'intelligence artificielle représente un levier incontournable pour l'avenir de l'éducation. En adoptant une approche équilibrée, les établissements pourront tirer pleinement parti de son potentiel.

**After**

> L'intelligence artificielle joue aujourd'hui un rôle central dans la transformation du système éducatif, bien que cette évolution ne se limite pas à l'apport de nouveaux outils. Elle touche également aux modes d'apprentissage, de collaboration et de développement personnel des élèves. Un rapport publié en 2023 indique d'ailleurs que 45 % des enseignants font déjà usage d'au moins un dispositif lié à l'IA dans leurs cours.
>
> L'un des avantages majeurs réside dans la capacité de ces systèmes à adapter les parcours pédagogiques, à gérer des tâches administratives répétitives et à soutenir plus efficacement l'inclusion. Cependant, il n'y a pas lieu d'ignorer les défis soulevés par leur déploiement, notamment en matière de sécurité des données, de risques de biais algorithmiques ou de dépendance excessive aux technologies numériques.
>
> En somme, l'intelligence artificielle constitue un élément déterminant pour la suite du secteur éducatif. Une mise en œuvre rigoureuse permettrait aux établissements d'en tirer le meilleur parti sans compromettre les fondements de leur activité.

| Rapport de naturel | Avant | Après |
|---|---|---|
| Tournures IA repérées | 11 | 1 (« en somme ») |
| Variété de longueur des phrases | 0.23 | 0.28 |
| Lisibilité (Kandel–Moles) | 42 | 41 |
| Variété du vocabulaire | 86% | 88% |
| Mots | 126 | 158 (+25%, normal en mode académique) |
| Vérification du sens | — | réussie, 3 paragraphes conservés |

Honest note: the first French run (before two fixes) merged the three paragraphs into two and its repair pass put "De plus / Par ailleurs" back in. Two changes came out of that: a local paragraph-count check that triggers a repair, and a repair prompt that forbids re-introducing stock connectors. The run above is after those fixes. Also, "rapport" replaced "étude": close, but not identical. Always read the result.

### العربية — الوضع القياسي، الشدة 3

**Before** (typical chatbot output)

> في عالمنا المتسارع اليوم، يلعب التحول الرقمي دوراً محورياً في تشكيل مستقبل الشركات الصغيرة والمتوسطة. وتجدر الإشارة إلى أن هذا التحول لا يقتصر فقط على استخدام التكنولوجيا، بل يشمل أيضاً إعادة التفكير في نماذج العمل وطرق التواصل مع العملاء. وبحسب تقرير صدر عام 2024، فإن 60% من الشركات التي تبنّت حلولاً رقمية حققت نمواً في مبيعاتها.
>
> بالإضافة إلى ذلك، يساهم التحول الرقمي بشكل كبير في تحسين الكفاءة وخفض التكاليف وتعزيز القدرة التنافسية. علاوة على ذلك، يتيح الوصول إلى أسواق جديدة وشرائح أوسع من العملاء. ومن الجدير بالذكر أن هذا التحول يواجه تحديات عديدة، مثل نقص المهارات وضعف البنية التحتية ومخاوف الأمن السيبراني.
>
> ختاماً، يمكن القول إن التحول الرقمي لم يعد خياراً بل ضرورة حتمية. ومن خلال تبنّي استراتيجية واضحة، تستطيع الشركات أن تفتح آفاقاً واسعة للنمو والازدهار.

**After**

> في عصرنا المتسارع اليوم، يُعد التحول الرقمي محركاً أساسياً في رسم مستقبل شركات الصغيرة والمتوسطة. الأمر لا يتوقف عند مجرد تبني التقنيات الجديدة، بل يمتد إلى إعادة النظر في نماذج العمل وطرق التفاعل مع العملاء. وفقاً لتقرير صدر عام 2024، حققت 60% من الشركات التي اعتمدت حلولاً رقمية نمواً ملموساً في مبيعاتها.
>
> يساهم هذا التحول أيضاً في رفع كفاءة العمليات وخفض التكاليف، مما يعزز القدرة على المنافسة ويُمكّن الوصول إلى أسواق وجماهير عملاء جديدة. ومع ذلك، يبقى الطريق مليئاً بالعديد من التحديات، منها نقص الكوادر المؤهلة وضعف البنية التحتية ومخاوف الأمن السيبراني.
>
> باختصار، لم يعد التحول الرقمي خياراً بل ضرورة حتمية للنجاح. ويمكن للشركات أن تفتح آفاقاً واسعة للنمو والازدهار عبر اعتماد استراتيجيات واضحة تتسم بالوضوح والاتساق.

| تقرير الطبيعية | قبل | بعد |
|---|---|---|
| عبارات آلية مكرّرة | 8 | 1 («آفاقاً واسعة») |
| تنوّع أطوال الجمل | 0.23 | 0.23 |
| سهولة القراءة (تقريبية) | 79 | 77 |
| تنوّع المفردات | 93% | 97% |
| فحص المعنى | — | رُصد انحراف وأُصلح تلقائياً |

Honest note: the 4B model left a grammar slip ("شركات الصغيرة" should be "الشركات الصغيرة") and a redundant ending ("واضحة ... تتسم بالوضوح"). Sentence rhythm barely changed. Arabic is where a stronger model (Claude) makes the biggest difference.

### What the small model got wrong, and what that means

- In a short Casual-mode test, "the budget stayed under 12,000 euros" became "held firm at 12,000 euros". The number was kept, so the local check passed, and the 4B verifier missed the change of meaning. The meaning check reduces drift; it does not guarantee zero drift. Read the output before you use it.
- The naturalness report measures the text, not "detectability". Lower stock-phrase counts and more varied rhythm make writing read better; they are not a promise about any AI detector.

