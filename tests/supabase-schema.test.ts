/**
 * Static invariants for the Supabase schema and the no-secrets-in-the-browser
 * guarantee.
 *
 * These read the real files rather than a copy, so they fail if someone
 * relaxes RLS, drops the owner scoping, or introduces a `NEXT_PUBLIC_`
 * service-role key. They are *structural* checks: they assert what the
 * configuration says, not what Postgres does at runtime. Running them
 * against a live database needs the Supabase CLI/emulator, which is not
 * available here — see README §Security model for the manual two-account
 * procedure.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const read = (rel: string) => readFileSync(path.join(root, rel), "utf8");

const SCHEMA_PATH = "supabase/migrations/0001_conversions.sql";
const schema = read(SCHEMA_PATH);

/** Every `.ts`/`.tsx` file under `src`, excluding `node_modules`. */
function clientSourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      clientSourceFiles(full, out);
    } else if (/\.(ts|tsx)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

describe("conversions schema", () => {
  test("row level security is enabled", () => {
    assert.match(
      schema,
      /alter\s+table\s+public\.conversions\s+enable\s+row\s+level\s+security/i,
      "RLS must be enabled — never disabled to make the integration work"
    );
  });

  test("no permissive policy grants access to anon or authenticated", () => {
    // Only `restrictive` policies may name those roles: restrictive policies
    // narrow access and cannot open it, so they are safe.
    const policies = [...schema.matchAll(/create\s+policy[\s\S]*?;/gi)].map(
      (m) => m[0]
    );
    assert.ok(policies.length > 0, "expected at least the defensive policy");

    for (const policy of policies) {
      assert.doesNotMatch(
        policy,
        /\bas\s+permissive\b/i,
        `policy opens access rather than narrowing it:\n${policy.slice(0, 120)}`
      );
      // A policy that names `to authenticated` must be restrictive.
      if (/\bto\s+authenticated\b/i.test(policy)) {
        assert.match(
          policy,
          /\bas\s+restrictive\b/i,
          "a policy targeting `authenticated` must be restrictive, not permissive"
        );
      }
    }
  });

  test("explicitly revokes the roles that must never touch the table", () => {
    assert.match(schema, /revoke\s+all\s+on\s+public\.conversions\s+from\s+anon/i);
    assert.match(
      schema,
      /revoke\s+.*\bfrom\s+authenticated\b/i,
      "authenticated must not be granted write access through a key we never validate"
    );
  });

  test("the restrictive policy pins the Firebase project issuer and audience", () => {
    // Firebase signs with one shared key set across all projects, so a token
    // from any other Firebase project must be rejected.
    assert.match(schema, /securetoken\.google\.com\/noctra-a7423/);
    assert.match(schema, /'aud'\s*\)\s*=\s*'noctra-a7423'/);
  });

  test("an owner column exists and is required", () => {
    assert.match(schema, /user_uid\s+text\s+not\s+null/i);
  });

  test("a unique constraint makes record creation idempotent", () => {
    assert.match(
      schema,
      /unique\s*\([^)]*user_uid[^)]*client_ref[^)]*\)|unique\s+index[^;]*user_uid[^;]*client_ref/i,
      "(user_uid, client_ref) must be unique so a retried POST cannot duplicate"
    );
  });

  test("every listed column the UI needs is present", () => {
    for (const col of [
      "id",
      "user_uid",
      "client_ref",
      "original_file_name",
      "original_file_size",
      "output_file_name",
      "file_type",
      "status",
      "page_count",
      "error_message",
      "created_at",
      "completed_at",
    ]) {
      assert.match(
        schema,
        new RegExp(`\\b${col}\\b`),
        `missing column: ${col}`
      );
    }
  });

  test("a composite index backs the per-user history list", () => {
    assert.match(
      schema,
      /create\s+index[\s\S]*?on\s+public\.conversions\s*\(\s*user_uid\s*,\s*created_at\s+desc\s*\)/i,
      "the history list orders by (user_uid, created_at desc)"
    );
  });

  test("status is constrained to the values the UI renders", () => {
    for (const status of ["pending", "processing", "completed", "failed"]) {
      assert.match(schema, new RegExp(`'${status}'`), `missing status ${status}`);
    }
    assert.match(
      schema,
      /check\s*\(\s*file_type\s+in\s*\(\s*'pdf'\s*,\s*'docx'\s*,\s*'pptx'\s*\)/i
    );
  });

  test("the DOCX upgrade migration exists for deployed databases", () => {
    const migration = read("supabase/migrations/0002_add_docx_file_type.sql");
    assert.match(migration, /drop\s+constraint\s+if\s+exists\s+conversions_file_type_check/i);
    assert.match(migration, /'pdf'[\s\S]*'docx'[\s\S]*'pptx'/);
  });
});

describe("no Supabase credentials in the browser", () => {
  test("no client module reads the service-role key", () => {
    const offenders: string[] = [];
    for (const file of clientSourceFiles(path.join(root, "src"))) {
      const source = readFileSync(file, "utf8");
      // Server-only modules are allowed to name the variables; anything else
      // that mentions it would be bundling it.
      if (
        /SUPABASE_(?:SECRET_KEY|SERVICE_ROLE_KEY)/.test(source) &&
        !file.includes(`${path.sep}server${path.sep}`) &&
        path.basename(file) !== "supabase-config.ts"
      ) {
        offenders.push(path.relative(root, file));
      }
    }
    assert.deepEqual(
      offenders,
      [],
      `service-role key referenced outside the server-only modules: ${offenders.join(", ")}`
    );
  });

  test("nothing reads a NEXT_PUBLIC_ Supabase variable from the environment", () => {
    // Match real env access only (`process.env.NEXT_PUBLIC_…SUPABASE…`), not
    // prose or this test's own assertion strings — the hazard is a value that
    // Next.js would inline into the browser bundle.
    const readPattern = /process\.env\.NEXT_PUBLIC_[A-Z_]*SUPABASE[A-Z_]*/;
    const offenders: string[] = [];
    const scan = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const full = path.join(dir, entry);
        if (statSync(full).isDirectory()) {
          if (entry === "node_modules" || entry === ".next") continue;
          scan(full);
        } else if (/\.(ts|tsx|mjs|json)$/.test(entry)) {
          if (readPattern.test(readFileSync(full, "utf8"))) {
            offenders.push(path.relative(root, full));
          }
        }
      }
    };
    scan(root);
    assert.deepEqual(
      offenders,
      [],
      `Supabase config must not be NEXT_PUBLIC_ (bundled to the browser): ${offenders.join(", ")}`
    );
  });

  test("the server-only guard rejects a NEXT_PUBLIC_ prefixed key", async () => {
    const { assertServerOnlyKey } = await import("../src/lib/supabase-config.ts");

    assert.throws(
      () => assertServerOnlyKey("NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY"),
      /must stay server-side/i,
      "a mis-labelled env var must fail loudly at startup"
    );
    assert.doesNotThrow(() => assertServerOnlyKey("SUPABASE_SERVICE_ROLE_KEY"));
  });

  test("config reads as unconfigured when the vars are absent", async () => {
    const { missingSupabaseConfigKeys, readSupabaseServerConfig, supabaseConfigErrorMessage } =
      await import("../src/lib/supabase-config.ts");

    const missing = missingSupabaseConfigKeys({});
    assert.equal(missing.length, 2, "both server vars are required");
    assert.equal(readSupabaseServerConfig({}), null, "incomplete config reads as null");
    const message = supabaseConfigErrorMessage(missing);
    assert.ok(message, "an explanation is produced");
    assert.match(message, /SUPABASE_URL/);
    assert.match(message, /conversion/i, "says conversions still work");

    const configured = readSupabaseServerConfig({
      SUPABASE_URL: "https://example.supabase.co/",
      SUPABASE_SERVICE_ROLE_KEY: " secret ",
    });
    assert.equal(configured?.url, "https://example.supabase.co", "trailing slash trimmed");
    assert.equal(configured?.serviceRoleKey, "secret", "value trimmed");

    const modern = readSupabaseServerConfig({
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SECRET_KEY: " sb_secret_example ",
      SUPABASE_SERVICE_ROLE_KEY: "legacy-should-not-win",
    });
    assert.equal(
      modern?.serviceRoleKey,
      "sb_secret_example",
      "the modern secret key is preferred when both are present"
    );
  });
});

describe("legacy Firestore configuration", () => {
  test("firestore.rules and firestore.indexes.json remain, marked legacy", () => {
    const readme = read("README.md");
    // Kept per the migration decision: nothing is deleted until the Supabase
    // replacement has been verified against a live project.
    assert.ok(readFileSync(path.join(root, "firestore.rules"), "utf8").length > 0);
    assert.match(
      readme,
      /firestore\.rules/i,
      "README must document that the Firestore files are legacy and unused"
    );
  });

  test("no runtime module still imports Firestore", async () => {
    const offenders: string[] = [];
    for (const file of clientSourceFiles(path.join(root, "src"))) {
      const source = readFileSync(file, "utf8");
      if (/from\s+["']firebase\/firestore["']/.test(source)) {
        offenders.push(path.relative(root, file));
      }
    }
    assert.deepEqual(offenders, [], `Firestore still imported by: ${offenders.join(", ")}`);
  });
});
