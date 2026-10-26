// Resolves Next.js-style `@/…` path aliases under `node --test`.
//
// Node's native type stripping understands TypeScript syntax but not tsconfig
// `paths`, so importing app modules (e.g. src/lib/conversion.ts) from a test
// fails with ERR_MODULE_NOT_FOUND. This hook maps `@/x` → `src/x(.ts|.tsx|/index.ts)`.
// Inert for anything that doesn't start with `@/`.
import { registerHooks } from "node:module";
import { existsSync, statSync } from "node:fs";
import { pathToFileURL } from "node:url";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");

function resolveAlias(specifier) {
  if (!specifier.startsWith("@/")) return null;
  const base = path.join(root, "src", specifier.slice(2));
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    path.join(base, "index.ts"),
    path.join(base, "index.tsx"),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate) && statSync(candidate).isFile()) {
      return pathToFileURL(candidate).href;
    }
  }
  return null;
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    const url = resolveAlias(specifier);
    if (url) return { url, shortCircuit: true };

    // ESM has no CommonJS-style extension guessing, and `next` ships no
    // `exports` map — so `import "next/server"` fails with ERR_MODULE_NOT_FOUND
    // while `next/server.js` exists on disk. Retry bare (non-relative)
    // specifiers with `.js` appended before giving up.
    if (
      !specifier.startsWith(".") &&
      !specifier.startsWith("/") &&
      !path.isAbsolute(specifier) &&
      !specifier.includes(":") &&
      !/\.[cm]?[jt]sx?$/.test(specifier)
    ) {
      try {
        return nextResolve(`${specifier}.js`, context);
      } catch {
        // fall through to the original specifier's resolution error
      }
    }

    return nextResolve(specifier, context);
  },
});
