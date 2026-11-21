import { test } from "node:test";
import assert from "node:assert/strict";
import { isNewer, parseRelease } from "../src/update/release";
import { GEMINI, isLocalEndpoint } from "../src/engine/types";

test("version comparison", () => {
  assert.equal(isNewer("1.3.0", "1.2.0"), true);
  assert.equal(isNewer("v1.10.0", "1.9.9"), true);
  assert.equal(isNewer("2.0.0", "1.99.99"), true);
  assert.equal(isNewer("1.2.0", "1.2.0"), false);
  assert.equal(isNewer("1.1.9", "1.2.0"), false);
  assert.equal(isNewer("1.3.0-beta", "1.2.0"), false);
  assert.equal(isNewer("garbage", "1.2.0"), false);
});

const dl = "https://github.com/jake750/insan/releases/download/v1.3.0/";

test("release parsing keeps only this repo's own assets", () => {
  const r = parseRelease({
    tag_name: "v1.3.0",
    html_url: "https://github.com/jake750/insan/releases/tag/v1.3.0",
    assets: [
      { name: "Insan-1.3.0-android.apk", browser_download_url: dl + "Insan-1.3.0-android.apk" },
      { name: "Insan-Setup-1.3.0.exe", browser_download_url: "https://evil.example/Insan-Setup-1.3.0.exe" },
    ],
  });
  assert.equal(r?.version, "1.3.0");
  assert.equal(r?.apk, dl + "Insan-1.3.0-android.apk");
  assert.equal(r?.exe, undefined);
  assert.equal(parseRelease({ tag_name: "v1.3.0", draft: true }), null);
  assert.equal(parseRelease({ tag_name: "v1.3.0", prerelease: true }), null);
  assert.equal(parseRelease({ tag_name: "nightly" }), null);
  assert.equal(parseRelease(null), null);
});

test("only local endpoints skip the key", () => {
  assert.equal(isLocalEndpoint("http://localhost:11434/v1"), true);
  assert.equal(isLocalEndpoint("http://127.0.0.1:1234/v1"), true);
  assert.equal(isLocalEndpoint(GEMINI.baseUrl), false);
  assert.equal(isLocalEndpoint("https://localhost.evil.example/v1"), false);
  assert.equal(isLocalEndpoint("https://api.openai.com/v1"), false);
});
