// Stand-in for the ESLint boundary/determinism rules (DESIGN §6.1, §7) until Codex's lint config lands.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = new URL('../../', import.meta.url).pathname;
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : p.endsWith('.ts') ? [p] : [];
  });
}
const importsOf = (src: string) => [...src.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]!);

describe('module boundaries', () => {
  it('engine/ imports only engine/ and protocol/', () => {
    for (const f of files(join(root, 'src/engine'))) {
      for (const imp of importsOf(readFileSync(f, 'utf8'))) {
        const ok = imp.startsWith('.') && (/^(\.\.\/)*protocol\//.test(imp) || !/\.\.\/(view|ui|app|session|controllers|content)\b/.test(imp));
        expect(ok, `${relative(root, f)} imports ${imp}`).toBe(true);
      }
    }
  });

  it('engine/ uses no DOM, clock, randomness, async or Map/Set', () => {
    const banned = [/\bMath\.random\b/, /\bDate\.now\b/, /\bperformance\./, /\bnew (Map|Set)\b/, /\bdocument\./, /\bwindow\./, /\bfetch\(/, /\basync\b/, /\bawait\b/, /\bsetTimeout\b/];
    for (const f of files(join(root, 'src/engine'))) {
      const src = readFileSync(f, 'utf8').replace(/\/\/.*$/gm, '');
      for (const b of banned) expect(b.test(src), `${relative(root, f)} matches ${b}`).toBe(false);
    }
  });

  it('view/, ui/ and controllers/ never import engine/resolve', () => {
    for (const d of ['src/view', 'src/ui', 'src/controllers']) {
      for (const f of files(join(root, d))) {
        for (const imp of importsOf(readFileSync(f, 'utf8'))) expect(imp.includes('engine/resolve'), `${relative(root, f)} imports ${imp}`).toBe(false);
      }
    }
  });

  it('no VITE_ secrets or API keys in source', () => {
    for (const f of files(join(root, 'src'))) {
      const src = readFileSync(f, 'utf8');
      expect(/VITE_[A-Z_]*(KEY|SECRET|TOKEN)/.test(src) || /sk-[A-Za-z0-9]{20,}/.test(src), relative(root, f)).toBe(false);
    }
  });
});
