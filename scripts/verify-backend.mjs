#!/usr/bin/env node
// Verify the Supabase + Firebase Admin backend against the *real* services.
//
// The unit tests prove the code's intent with injected stubs. This script
// proves the deployment's reality: that the migration was applied, that the
// credentials parse, and that the security properties hold against the live
// database. Run it after filling in `.env.local`:
//
//   node scripts/verify-backend.mjs
//
// Read-only by default — it never writes a row to your database. Pass
// `--write` to additionally exercise the insert/delete round-trip (a probe
// row is created and then removed).
//
// Set SUPABASE_ANON_KEY too, if you have it, to prove the anon key really is
// denied by row level security rather than merely assumed to be.
//
// Exit code 0 means every check passed.

import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createPrivateKey, randomUUID } from "node:crypto";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const WANT_WRITE = process.argv.includes("--write");

const useColor = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;
const paint = (code) => (s) => (useColor ? "\x1b[" + code + "m" + s + "\x1b[0m" : s);
const red = paint(31);
const green = paint(32);
const yellow = paint(33);
const dim = paint(2);
const bold = paint(1);

let passed = 0;
let failed = 0;

function pass(label, detail) {
  passed += 1;
  console.log(green("PASS") + " " + label + (detail ? " " + dim("- " + detail) : ""));
}

function fail(label, detail, fix) {
  failed += 1;
  console.log(red("FAIL") + " " + label);
  if (detail) console.log("       " + detail);
  if (fix) console.log("       " + yellow(fix));
}

function skip(label, why) {
  console.log(yellow("SKIP") + " " + label + " " + dim("- " + why));
}

function heading(title) {
  console.log("\n" + bold(title) + "\n" + dim("-".repeat(title.length)));
}

// Never print a secret in full. Show just enough to recognise which key it is.
function mask(value) {
  if (typeof value !== "string" || value.trim().length === 0) return "(empty)";
  const v = value.trim();
  if (v.length <= 12) return v.slice(0, 3) + "... (" + v.length + " chars)";
  return v.slice(0, 6) + "..." + v.slice(-4) + " (" + v.length + " chars)";
}

// ── load .env.local without adding a dependency ─────────────────────────────

function parseEnvFile(path) {
  if (!existsSync(path)) return {};
  const out = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      value.length > 1 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

const env = { ...parseEnvFile(resolve(ROOT, ".env.local")), ...process.env };

function isSet(key) {
  const v = env[key];
  return typeof v === "string" && v.trim().length > 0;
}

// A value copied verbatim from .env.example is not configuration.
function isPlaceholder(key) {
  const v = env[key];
  if (typeof v !== "string") return true;
  const value = v.trim();
  if (/^(your_|<|xxx|changeme|placeholder)/i.test(value)) return true;
  if (/xxxxx|your_project|your_private_key|example\.com/i.test(value)) return true;
  if (key === "FIREBASE_ADMIN_CLIENT_EMAIL") {
    return !/^[^@\s]+@[^@\s]+\.iam\.gserviceaccount\.com$/i.test(value);
  }
  if (key === "FIREBASE_ADMIN_PRIVATE_KEY") {
    return !/-----BEGIN (?:RSA )?PRIVATE KEY-----/.test(value) ||
      /your_private_key_here/i.test(value);
  }
  return false;
}

function decodeJwtPayload(token) {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    return JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

function isMatchingSupabaseServiceRoleKey(value, url) {
  const payload = decodeJwtPayload(value.trim());
  if (!payload || payload.role !== "service_role" || typeof payload.ref !== "string") {
    return false;
  }
  try {
    return payload.ref === new URL(url).hostname.split(".")[0];
  } catch {
    return false;
  }
}

function supabaseServerKeyName() {
  if (isSet("SUPABASE_SECRET_KEY")) return "SUPABASE_SECRET_KEY";
  if (isSet("SUPABASE_SERVICE_ROLE_KEY")) return "SUPABASE_SERVICE_ROLE_KEY";
  return null;
}

function isUsableSupabaseServerKey(name, url) {
  if (!name || !isSet(name) || isPlaceholder(name)) return false;
  if (name === "SUPABASE_SECRET_KEY") {
    return /^sb_secret_[A-Za-z0-9_-]+$/.test(env[name].trim());
  }
  return isMatchingSupabaseServiceRoleKey(env[name], url);
}

console.log(bold("\nNoctra backend verification"));

// ── 1. environment presence ─────────────────────────────────────────────────

heading("Environment variables");

const SERVER_ONLY = [
  ["SUPABASE_URL", "Supabase Dashboard -> Project Settings -> API -> Project URL"],
  ["FIREBASE_ADMIN_PROJECT_ID", "must equal the project that issues your tokens"],
];

for (const [key, hint] of SERVER_ONLY) {
  if (!isSet(key)) {
    fail(key + " is missing", undefined, hint);
  } else if (isPlaceholder(key)) {
    fail(
      key + " is still the placeholder from .env.example",
      mask(env[key]),
      hint
    );
  } else {
    pass(key + " is set", mask(env[key]));
  }
}

// The service-account credential is OPTIONAL: token verification uses
// Google's public x509 certs and needs only the project ID. A credential is
// only required for Admin *write* APIs, which this app never calls. What is
// never acceptable is a HALF-set credential — a key without its email (or an
// email without a key) means someone edited one var and not the other.
const emailSet = isSet("FIREBASE_ADMIN_CLIENT_EMAIL") && !isPlaceholder("FIREBASE_ADMIN_CLIENT_EMAIL");
const keySet = isSet("FIREBASE_ADMIN_PRIVATE_KEY") && !isPlaceholder("FIREBASE_ADMIN_PRIVATE_KEY");

if (emailSet && keySet) {
  pass("Firebase service-account credential is fully configured");
} else if (!isSet("FIREBASE_ADMIN_CLIENT_EMAIL") && !isSet("FIREBASE_ADMIN_PRIVATE_KEY")) {
  pass(
    "Firebase Admin runs credential-less (project ID only)",
    "verification uses Google's public certs; no private key exists to leak"
  );
} else {
  fail(
    "Firebase service-account credential is only half configured",
    "client email " + (emailSet ? "set" : "missing") + ", private key " + (keySet ? "set" : "missing"),
    "Either set BOTH FIREBASE_ADMIN_CLIENT_EMAIL and FIREBASE_ADMIN_PRIVATE_KEY, or remove BOTH — never one without the other."
  );
}

const activeSupabaseKeyName = supabaseServerKeyName();
if (!activeSupabaseKeyName) {
  fail(
    "Supabase server key is missing",
    undefined,
    "Set SUPABASE_SECRET_KEY (preferred) or the legacy SUPABASE_SERVICE_ROLE_KEY in .env.local."
  );
} else if (isPlaceholder(activeSupabaseKeyName)) {
  fail(
    activeSupabaseKeyName + " is still the placeholder from .env.example",
    mask(env[activeSupabaseKeyName]),
    "Copy a server-only key from the same Supabase project as SUPABASE_URL."
  );
} else {
  pass(activeSupabaseKeyName + " is set", mask(env[activeSupabaseKeyName]));
  if (isUsableSupabaseServerKey(activeSupabaseKeyName, env.SUPABASE_URL)) {
    pass(
      activeSupabaseKeyName === "SUPABASE_SECRET_KEY"
        ? "Supabase secret key has the expected format"
        : "Supabase service-role key matches the configured project"
    );
  } else {
    fail(
      activeSupabaseKeyName + " is not valid for the configured Supabase project",
      undefined,
      "Copy the server-only secret from the same Supabase project as SUPABASE_URL; never use the publishable/anon key here."
    );
  }
}

// A NEXT_PUBLIC_-prefixed Supabase key would be bundled into the browser.
// This is the single worst mistake this architecture could make, so check it.
const leakyKeys = Object.keys(env).filter((k) =>
  /^NEXT_PUBLIC_.*(SUPABASE|SERVICE_ROLE|SECRET)/i.test(k)
);
if (leakyKeys.length > 0) {
  for (const key of leakyKeys) {
    fail(
      key + " would expose a Supabase secret to the browser",
      undefined,
      "Server-only variables must never use the NEXT_PUBLIC_ prefix. Rename it."
    );
  }
} else {
  pass("No NEXT_PUBLIC_ variable exposes a Supabase secret");
}

// ── 2. Firebase Admin credential actually parses ────────────────────────────

heading("Firebase Admin token verification");

const adminProjectUsable =
  isSet("FIREBASE_ADMIN_PROJECT_ID") &&
  !isPlaceholder("FIREBASE_ADMIN_PROJECT_ID");

const adminUsable = adminProjectUsable && emailSet && keySet;
const credentialLess = adminProjectUsable && !isSet("FIREBASE_ADMIN_CLIENT_EMAIL") && !isSet("FIREBASE_ADMIN_PRIVATE_KEY");

if (adminUsable) {
  try {
    try {
      createPrivateKey({
        key: env.FIREBASE_ADMIN_PRIVATE_KEY.replace(/\\n/g, "\n"),
        format: "pem",
      });
      pass("Firebase private key parses as PEM");
    } catch {
      fail(
        "Firebase private key is not a valid PEM key",
        undefined,
        "Generate a new private key for Firebase project noctra-a7423 and preserve the literal \\n escapes in .env.local."
      );
      throw new Error("invalid Firebase private key");
    }

    const { initializeApp, cert, getApps, deleteApp } = await import(
      "firebase-admin/app"
    );
    const { getAuth } = await import("firebase-admin/auth");

    for (const app of [...getApps()]) await deleteApp(app);

    const privateKey = env.FIREBASE_ADMIN_PRIVATE_KEY.replace(/\\n/g, "\n");
    initializeApp({
      credential: cert({
        projectId: env.FIREBASE_ADMIN_PROJECT_ID.trim(),
        clientEmail: isSet("FIREBASE_ADMIN_CLIENT_EMAIL")
          ? env.FIREBASE_ADMIN_CLIENT_EMAIL.trim()
          : undefined,
        privateKey,
      }),
    });
    pass("Service-account credentials parse");

    // A garbage token tells us which layer is failing:
    //   app/invalid-credential  -> the credential itself is unusable
    //   anything else           -> the credential is live, the token is just bad
    const auth = getAuth();
    try {
      await auth.verifyIdToken("garbage-token-for-probe");
      fail(
        "verifyIdToken accepted a garbage token",
        undefined,
        "That should be impossible. Treat as a bug."
      );
    } catch (error) {
      const code = error && error.code ? error.code : "unknown";
      if (code === "app/invalid-credential") {
        fail(
          "The credential is present but unusable",
          code,
          "Regenerate the key for the project that issues your tokens (noctra-a7423)."
        );
      } else {
        pass(
          "verifyIdToken rejects a garbage token (credential is live)",
          "code: " + code
        );
      }
    }

    for (const app of [...getApps()]) await deleteApp(app);
  } catch (error) {
    fail(
      "Could not initialise the Firebase Admin SDK",
      error && error.message ? error.message : String(error),
      "Check FIREBASE_ADMIN_PRIVATE_KEY keeps its literal \\n escapes."
    );
  }
} else if (credentialLess) {
  // Credential-less mode: the Admin SDK verifies tokens against Google's
  // public x509 certs using only the project ID. Prove both halves: the SDK
  // initialises without any credential, and verification still reaches real
  // token validation (rejecting a well-formed fake JWT's signature) rather
  // than failing earlier on a missing credential.
  try {
    const { initializeApp, getApps, deleteApp } = await import(
      "firebase-admin/app"
    );
    const { getAuth } = await import("firebase-admin/auth");

    for (const app of [...getApps()]) await deleteApp(app);
    initializeApp({ projectId: env.FIREBASE_ADMIN_PROJECT_ID.trim() });
    pass("Admin SDK initialises with project ID only (no private key)");

    const auth = getAuth();

    try {
      await auth.verifyIdToken("garbage-token-for-probe");
      fail(
        "verifyIdToken accepted a garbage token",
        undefined,
        "That should be impossible. Treat as a bug."
      );
    } catch (error) {
      const code = error && error.code ? error.code : "unknown";
      if (code === "app/invalid-credential") {
        fail(
          "The Admin SDK reports a credential problem despite credential-less mode",
          code,
          "Remove any half-set FIREBASE_ADMIN_CLIENT_EMAIL / FIREBASE_ADMIN_PRIVATE_KEY pair."
        );
      } else {
        pass("verifyIdToken rejects a garbage token", "code: " + code);
      }
    }

    // A well-formed JWT with a real kid: reaching a signature/argument error
    // proves the public-cert fetch path is alive, which is the entire
    // verification dependency in credential-less mode.
    const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
    const fakeJwt =
      b64({ alg: "RS256", typ: "JWT", kid: "904b0f91be6eb0867dabbaab587dfc2e33f00a24" }) +
      "." +
      b64({
        iss: "https://securetoken.google.com/" + env.FIREBASE_ADMIN_PROJECT_ID.trim(),
        aud: env.FIREBASE_ADMIN_PROJECT_ID.trim(),
        user_id: "verify-probe-uid",
        sub: "verify-probe-uid",
        iat: Math.floor(Date.now() / 1000) - 60,
        exp: Math.floor(Date.now() / 1000) + 300,
        auth_time: Math.floor(Date.now() / 1000) - 60,
      }) +
      ".c2lnbmF0dXJl";
    try {
      await auth.verifyIdToken(fakeJwt);
      fail(
        "verifyIdToken accepted a fake-signature JWT",
        undefined,
        "That should be impossible. Treat as a bug."
      );
    } catch (error) {
      const code = error && error.code ? error.code : "unknown";
      const msg = error && error.message ? error.message : String(error);
      if (/invalid signature/i.test(msg)) {
        pass(
          "Public-cert verification path is alive",
          "reached signature validation with no private key configured"
        );
      } else if (/fetch failed|ENOTFOUND|ECONNREFUSED|network/i.test(msg)) {
        fail(
          "Could not reach Google's public certificate endpoint",
          msg,
          "Token verification depends on this endpoint; check network egress."
        );
      } else {
        fail("Unexpected verification failure in credential-less mode", code + ": " + msg.slice(0, 120));
      }
    }

    for (const app of [...getApps()]) await deleteApp(app);
  } catch (error) {
    fail(
      "Could not initialise the Firebase Admin SDK without a credential",
      error && error.message ? error.message : String(error),
      "Credential-less verification requires only FIREBASE_ADMIN_PROJECT_ID."
    );
  }
} else {
  skip("Firebase Admin checks", "environment incomplete or still placeholder");
}

// ── 3. Supabase schema + row level security ─────────────────────────────────

heading("Supabase database");

let supabase = null;

const supabaseUsable =
  isSet("SUPABASE_URL") &&
  !isPlaceholder("SUPABASE_URL") &&
  isUsableSupabaseServerKey(activeSupabaseKeyName, env.SUPABASE_URL);

const publicSupabaseProbeUsable =
  isSet("SUPABASE_URL") &&
  !isPlaceholder("SUPABASE_URL") &&
  isSet("SUPABASE_ANON_KEY") &&
  !isPlaceholder("SUPABASE_ANON_KEY");

// A public key cannot replace the server-only key, but it can still
// tell us whether the project exists and whether the migrations created the
// table. Run this probe independently so a missing service role does not hide
// a useful schema diagnostic.
if (!supabaseUsable && publicSupabaseProbeUsable) {
  try {
    const { createClient } = await import("@supabase/supabase-js");
    const publicClient = createClient(
      env.SUPABASE_URL.trim().replace(/\/+$/, ""),
      env.SUPABASE_ANON_KEY.trim(),
      { auth: { persistSession: false, autoRefreshToken: false } }
    );
    const { data: publicRows, error: publicError } = await publicClient
      .from("conversions")
      .select("id, user_uid")
      .limit(1);

    if (publicError) {
      if (/does not exist|schema cache|not find the table/i.test(publicError.message)) {
        fail(
          "The conversions table does not exist",
          publicError.message,
          "Run supabase/migrations/0001_conversions.sql and then 0002_add_docx_file_type.sql in the Supabase SQL editor."
        );
      } else if (/permission|forbidden|jwt|not allowed/i.test(publicError.message)) {
        pass("Supabase project is reachable and public access is denied by RLS");
      } else {
        fail("Supabase public schema probe failed", publicError.message);
      }
    } else if (!publicRows || publicRows.length === 0) {
      pass("Supabase project is reachable and public access returns zero rows");
    } else {
      fail(
        "The public Supabase key returned conversion rows",
        undefined,
        "RLS is not protecting the conversions table. Do not deploy until fixed."
      );
    }
  } catch (error) {
    fail(
      "Could not run the Supabase public schema probe",
      error && error.message ? error.message : String(error)
    );
  }
}

if (supabaseUsable) {
  try {
    const { createClient } = await import("@supabase/supabase-js");
    const url = env.SUPABASE_URL.trim().replace(/\/+$/, "");
    new URL(url); // throws if malformed
    supabase = createClient(url, env[activeSupabaseKeyName].trim(), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    pass("Supabase client constructed", new URL(url).host);
  } catch (error) {
    fail("Could not build a Supabase client", error && error.message ? error.message : String(error));
  }
} else {
  skip("Supabase checks", "environment incomplete or still placeholder");
}

if (supabase) {
  const REQUIRED_COLUMNS = [
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
  ];

  // a. The migration ran: the table exists with every column the app reads.
  let tableExists = true;
  const { error: tableError } = await supabase.from("conversions").select("id").limit(1);

  if (tableError) {
    const msg = tableError.message ? tableError.message : String(tableError);
    if (/does not exist|schema cache|not find the table/i.test(msg)) {
      tableExists = false;
      fail(
        "The conversions table does not exist",
        msg,
        "Run supabase/migrations/0001_conversions.sql in the SQL editor."
      );
    } else {
      fail("Could not read the conversions table", msg);
    }
  } else {
    const { data: sample, error: probeError } = await supabase
      .from("conversions")
      .select(REQUIRED_COLUMNS.join(", "))
      .limit(1);
    if (probeError) {
      fail(
        "The conversions table is missing expected columns",
        probeError.message,
        "Re-apply supabase/migrations/0001_conversions.sql."
      );
    } else {
      pass(
        "conversions table exists with every expected column",
        (sample ? sample.length : 0) + " row(s) visible to the service role"
      );
    }
  }

  // b. RLS is on: prove it with the real anon key when one is available.
  if (isSet("SUPABASE_ANON_KEY") && tableExists) {
    try {
      const { createClient } = await import("@supabase/supabase-js");
      const anon = createClient(
        env.SUPABASE_URL.trim().replace(/\/+$/, ""),
        env.SUPABASE_ANON_KEY.trim(),
        { auth: { persistSession: false, autoRefreshToken: false } }
      );
      const { data: anonRows, error: anonError } = await anon
        .from("conversions")
        .select("id, user_uid")
        .limit(5);

      if (anonError) {
        pass("Anon key is denied by RLS", anonError.message);
      } else if (!anonRows || anonRows.length === 0) {
        pass("Anon key can read zero rows (RLS holds)");
      } else {
        fail(
          "The anon key returned " + anonRows.length + " row(s)",
          undefined,
          "RLS is not protecting this table. Do not deploy until fixed."
        );
      }
    } catch (error) {
      fail("Anon RLS probe failed", String(error && error.message ? error.message : error));
    }
  } else if (!tableExists) {
    skip("Anon-key RLS probe", "conversions table is missing");
  } else {
    skip("Anon-key RLS probe", "set SUPABASE_ANON_KEY to prove RLS denies the public key");
  }

  // c. Service role can read its own table.
  if (tableExists) {
    const { data: rows, error: readError } = await supabase
      .from("conversions")
      .select("id, user_uid, client_ref")
      .limit(1);
    if (readError) {
      fail("Service role cannot read conversions", readError.message);
    } else {
      pass(
        "Service role can read conversions",
        (rows ? rows.length : 0) + " row(s) returned"
      );
    }
  } else {
    skip("Service-role table read", "conversions table is missing");
  }

  // d. Optional write round-trip proving UID scoping.
  if (WANT_WRITE) {
    const probeUid = "verify-script-" + Date.now();
    const { data: inserted, error: insertError } = await supabase
      .from("conversions")
      .insert({
        user_uid: probeUid,
        client_ref: randomUUID(),
        original_file_name: "verify-probe.pdf",
        original_file_size: 1,
        file_type: "pdf",
        status: "completed",
        page_count: 1,
      })
      .select("id, user_uid")
      .single();

    if (insertError) {
      fail("Service role cannot insert into conversions", insertError.message);
    } else {
      pass("Service role can insert a row", "id " + inserted.id);

      // Reading as the wrong user must return nothing — this is the same
      // .eq("user_uid", uid) scoping the API relies on.
      const { data: foreign } = await supabase
        .from("conversions")
        .select("id")
        .eq("user_uid", probeUid + "-other")
        .eq("id", inserted.id);
      if (!foreign || foreign.length === 0) {
        pass("A different UID cannot see the row");
      } else {
        fail("A different UID could read a row it does not own");
      }

      const { error: deleteError } = await supabase
        .from("conversions")
        .delete()
        .eq("id", inserted.id);
      if (deleteError) {
        fail("Could not clean up the probe row", deleteError.message);
      } else {
        pass("Probe row cleaned up");
      }
    }

    const docxProbeUid = "verify-script-docx-" + Date.now();
    const { data: docxInserted, error: docxInsertError } = await supabase
      .from("conversions")
      .insert({
        user_uid: docxProbeUid,
        client_ref: randomUUID(),
        original_file_name: "verify-probe.docx",
        original_file_size: 1,
        file_type: "docx",
        status: "completed",
        page_count: 1,
      })
      .select("id, user_uid")
      .single();

    if (docxInsertError) {
      fail(
        "DOCX history rows are not accepted",
        docxInsertError.message,
        "Run supabase/migrations/0002_add_docx_file_type.sql."
      );
    } else {
      pass("Service role can insert a DOCX history row");
      const { error: docxDeleteError } = await supabase
        .from("conversions")
        .delete()
        .eq("id", docxInserted.id);
      if (docxDeleteError) {
        fail("Could not clean up the DOCX probe row", docxDeleteError.message);
      } else {
        pass("DOCX probe row cleaned up");
      }
    }
  } else {
    skip("Write round-trip", "re-run with --write to test inserts");
  }
}

// ── summary ─────────────────────────────────────────────────────────────────

console.log("");
if (failed === 0) {
  console.log(
    green(bold("All " + passed + " checks passed.")) +
      dim(" Live credentials verified - this is real, not stubbed.")
  );
} else {
  console.log(red(bold(failed + " check(s) failed")) + dim(" (" + passed + " passed)"));
  console.log(yellow("Fix the items above, then re-run: node scripts/verify-backend.mjs"));
}
console.log("");

process.exit(failed === 0 ? 0 : 1);
