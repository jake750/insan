"use client";
// File import (.txt .md .docx .pdf) and export (.txt .md .docx .pdf) — all in the browser.
// Exports carry no author, title, dates or app name in their metadata.

export async function importFile(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".txt") || name.endsWith(".md") || name.endsWith(".markdown") || file.type.startsWith("text/")) {
    return (await file.text()).replace(/\r\n?/g, "\n");
  }
  if (name.endsWith(".docx")) {
    const mod = await import("mammoth/mammoth.browser");
    const mammoth = mod.default ?? (mod as unknown as typeof mod.default);
    const { value } = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
    return value.replace(/\n{3,}/g, "\n\n").trim();
  }
  if (name.endsWith(".pdf")) return importPdf(file);
  throw new Error("unsupported");
}

async function importPdf(file: File): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs"; // self-hosted, copied on install
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const out: string[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    // rebuild lines from y positions, then paragraphs from vertical gaps
    const lines: { y: number; text: string }[] = [];
    for (const it of content.items as { str: string; transform: number[]; hasEOL?: boolean }[]) {
      if (!("str" in it)) continue;
      const y = Math.round(it.transform[5]);
      const last = lines[lines.length - 1];
      if (last && Math.abs(last.y - y) < 3) last.text += it.str;
      else lines.push({ y, text: it.str });
    }
    const gaps = lines.slice(1).map((l, i) => Math.abs(lines[i].y - l.y)).filter((g) => g > 0);
    const median = gaps.sort((a, b) => a - b)[Math.floor((gaps.length - 1) / 2)] ?? 12; // lower median: robust with few lines
    let para = "";
    lines.forEach((l, i) => {
      const gap = i ? Math.abs(lines[i - 1].y - l.y) : 0;
      if (i && gap > median * 1.45) {
        out.push(para.trim());
        para = "";
      }
      para += (para && !para.endsWith("-") ? " " : "") + l.text.trim();
    });
    if (para.trim()) out.push(para.trim());
  }
  return out.filter(Boolean).join("\n\n");
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const stripMd = (s: string) =>
  s
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/(^|\W)\*(.+?)\*(?=\W|$)/g, "$1$2")
    .replace(/^>\s?/gm, "");

export function exportText(text: string, kind: "txt" | "md") {
  const body = kind === "txt" ? stripMd(text) : text;
  download(new Blob([body], { type: kind === "md" ? "text/markdown" : "text/plain" }), `rewrite.${kind}`);
}

const isArabic = (s: string) => /[؀-ۿ]/.test(s) && (s.match(/[؀-ۿ]/g)!.length > s.length * 0.3);

export async function exportDocx(text: string) {
  const d = await import("docx");
  const runs = (line: string) =>
    line.split(/(\*\*[^*]+\*\*)/).filter(Boolean).map((part) =>
      part.startsWith("**") ? new d.TextRun({ text: part.slice(2, -2), bold: true, rightToLeft: isArabic(line) }) : new d.TextRun({ text: part, rightToLeft: isArabic(line) }),
    );
  const paragraphs: InstanceType<typeof d.Paragraph>[] = [];
  for (const block of text.split(/\n\s*\n/)) {
    for (const line of block.split("\n")) {
      const rtl = isArabic(line);
      const h = line.match(/^(#{1,6})\s+(.*)/);
      const li = line.match(/^\s*(?:[-*•]|\d+[.)])\s+(.*)/);
      if (h) {
        const level = [d.HeadingLevel.HEADING_1, d.HeadingLevel.HEADING_2, d.HeadingLevel.HEADING_3][Math.min(2, h[1].length - 1)];
        paragraphs.push(new d.Paragraph({ heading: level, bidirectional: rtl, children: runs(h[2]) }));
      } else if (li) paragraphs.push(new d.Paragraph({ bullet: { level: 0 }, bidirectional: rtl, children: runs(li[1]) }));
      else paragraphs.push(new d.Paragraph({ bidirectional: rtl, spacing: { after: 160 }, children: runs(line) }));
    }
  }
  const doc = new d.Document({ creator: "", title: "", description: "", lastModifiedBy: "", sections: [{ children: paragraphs }] });
  const blob = await d.Packer.toBlob(doc);
  download(await scrubDocx(blob), "rewrite.docx");
}

/** Replace docProps with empty ones: no author, app name, revision or timestamps. */
async function scrubDocx(blob: Blob): Promise<Blob> {
  try {
    const JSZip = (await import("jszip")).default;
    const zip = await JSZip.loadAsync(blob);
    zip.file(
      "docProps/core.xml",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"></cp:coreProperties>`,
    );
    zip.file(
      "docProps/app.xml",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"></Properties>`,
    );
    // zip entries carry modification times too: pin them all to a fixed date
    const epoch = new Date(Date.UTC(1980, 0, 1));
    for (const [name, f] of Object.entries(zip.files)) if (!f.dir) zip.file(name, await f.async("uint8array"), { date: epoch });
    return await zip.generateAsync({ type: "blob", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
  } catch {
    return blob;
  }
}

export const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/**
 * PDF through the browser's own print engine: the only way to get correct Arabic shaping and
 * RTL without shipping a font-shaping engine. Title is neutral, no app name, no URL in headers.
 */
/** `extraHtml` (already escaped) is appended after the text, e.g. the AI-score report. */
export function exportPdf(text: string, extraHtml = "") {
  const html = text
    .split(/\n\s*\n/)
    .map((b) => {
      const h = b.match(/^(#{1,3})\s+(.*)/);
      const dir = isArabic(b) ? "rtl" : "ltr";
      if (h) return `<h${h[1].length} dir="${dir}">${esc(h[2])}</h${h[1].length}>`;
      return `<p dir="${dir}">${esc(stripMd(b)).replace(/\n/g, "<br>")}</p>`;
    })
    .join("");
  const frame = document.createElement("iframe");
  frame.style.cssText = "position:fixed;width:0;height:0;border:0;inset:auto";
  document.body.appendChild(frame);
  const doc = frame.contentDocument!;
  doc.open();
  doc.write(`<!doctype html><html><head><meta charset="utf-8"><title>document</title><style>
    @page { margin: 22mm 20mm; }
    body { font-family: "Literata Variable", "Noto Naskh Arabic", Georgia, serif; font-size: 12pt; line-height: 1.6; color: #111; }
    p { margin: 0 0 10pt; } h1,h2,h3 { font-family: "IBM Plex Sans Arabic", system-ui, sans-serif; margin: 14pt 0 6pt; }
    .report { break-before: page; font-family: "IBM Plex Sans Arabic", system-ui, sans-serif; font-size: 10.5pt; }
    .report table { border-collapse: collapse; width: 100%; } .report td, .report th { border-bottom: 1px solid #ccc; padding: 4pt 6pt; text-align: start; }
    .report .note { color: #444; font-size: 9.5pt; }
  </style></head><body>${html}${extraHtml}</body></html>`);
  doc.close();
  // copy the self-hosted @font-face rules so the print uses the same fonts
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      const rules = Array.from(sheet.cssRules).filter((r) => r instanceof CSSFontFaceRule).map((r) => r.cssText.replace(/url\((['"]?)\//g, `url($1${location.origin}/`));
      if (rules.length) {
        const st = doc.createElement("style");
        st.textContent = rules.join("\n");
        doc.head.appendChild(st);
      }
    } catch {
      /* cross-origin sheet — none in this app */
    }
  }
  const go = () => {
    frame.contentWindow!.focus();
    frame.contentWindow!.print();
    setTimeout(() => frame.remove(), 2000);
  };
  (doc.fonts?.ready ?? Promise.resolve()).then(() => setTimeout(go, 50));
}

export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
  }
}
