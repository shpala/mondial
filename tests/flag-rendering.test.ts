// Architecture fitness test: every flag in the UI must render through the
// <TeamFlag> component, never as a raw `{team.flag}` JSX child.
//
// Flags are stored as regional-indicator emoji ("🇧🇷"). On platforms without a
// flag-emoji font (Windows, many Linux/Chrome combos) those render as the bare
// 2-letter code ("BR"). <TeamFlag> feature-detects this and swaps in a flagcdn
// image; a raw interpolation has no such fallback and silently shows "BR".
// This pins the invariant so a raw render can't sneak back in (regression of
// the model page's Title-race list).
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));

function tsxFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    const rel = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...tsxFiles(rel));
    else if (entry.name.endsWith(".tsx")) out.push(rel);
  }
  return out;
}

// A `.flag` interpolation whose opening `{` is NOT preceded by `=` is a JSX
// child render (e.g. `>{o.team.flag}<`), not a prop pass (`flag={o.team.flag}`).
const RAW_FLAG_RENDER = /[^=]\{[\w.]*\.flag\}/;

describe("flag rendering", () => {
  it("renders every flag through <TeamFlag>, never as a raw JSX child", () => {
    const violations: string[] = [];
    for (const file of [...tsxFiles("app"), ...tsxFiles("components")]) {
      const lines = readFileSync(join(ROOT, file), "utf8").split("\n");
      lines.forEach((line, i) => {
        if (RAW_FLAG_RENDER.test(line)) violations.push(`${file}:${i + 1}: ${line.trim()}`);
      });
    }
    expect(violations).toEqual([]);
  });
});
