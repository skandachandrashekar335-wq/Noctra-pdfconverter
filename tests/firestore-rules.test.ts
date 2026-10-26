/**
 * Static invariant checks on firestore.rules.
 *
 * These do NOT execute the rules against the emulator (that requires the
 * Firebase CLI + Java emulator, neither of which is installed here — see the
 * report's BLOCKED section for the exact commands). What they do is guard the
 * security contract against accidental weakening: if someone removes an
 * ownership check, allows anonymous access, or re-introduces the broken
 * combined `update, delete` rule, this test fails.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const RULES = readFileSync(
  join(import.meta.dirname, "..", "firestore.rules"),
  "utf8"
);

/** Extract the body of a `match /path { ... }` block (brace-balanced). */
function matchBlock(pathPattern: string): string {
  const header = `match ${pathPattern} {`;
  const start = RULES.indexOf(header);
  assert.ok(start !== -1, `expected a match block for ${pathPattern}`);
  let depth = 0;
  let body = "";
  for (let i = start + header.length - 1; i < RULES.length; i++) {
    if (RULES[i] === "{") depth++;
    else if (RULES[i] === "}") {
      depth--;
      if (depth === 0) break;
    }
    body += RULES[i];
  }
  return body;
}

const users = matchBlock("/users/{userId}");
const conversions = matchBlock("/conversions/{conversionId}");

describe("firestore.rules — global invariants", () => {
  test("rules_version is 2", () => {
    assert.match(RULES, /rules_version\s*=\s*'2'/);
  });

  test("no blanket `allow ... if true` grants", () => {
    assert.ok(
      !/allow\s+\w+\s*:\s*if\s+true/.test(RULES),
      "rules must never grant unconditionally"
    );
  });

  test("every allow line is gated on request.auth", () => {
    // `if false` (explicit denial) is fine; anything else must check auth.
    const allowLines = RULES.split("\n").filter((l) => l.includes("allow "));
    for (const line of allowLines) {
      if (line.includes("if false")) continue;
      assert.ok(
        line.includes("request.auth"),
        `allow line is not auth-gated: ${line.trim()}`
      );
    }
  });
});

describe("firestore.rules — /users/{userId}", () => {
  test("read is owner-scoped (get requires auth.uid == userId)", () => {
    assert.match(users, /allow get: if request\.auth != null\s*&&\s*request\.auth\.uid == userId/);
  });

  test("listing user profiles is denied", () => {
    assert.match(users, /allow list: if false/);
  });

  test("writes are owner-only", () => {
    assert.match(
      users,
      /allow create, update, delete: if request\.auth != null\s*&&\s*request\.auth\.uid == userId/
    );
  });

  test("a profile cannot claim another user's uid", () => {
    assert.match(users, /request\.resource\.data\.uid == userId/);
  });

  test("uses `get`, not broad `read`, on users", () => {
    assert.ok(
      !/allow read:/.test(users),
      "users must not use `read` (= get + list)"
    );
  });
});

describe("firestore.rules — /conversions/{conversionId}", () => {
  test("reads are owner-scoped against resource.data.userId", () => {
    assert.match(
      conversions,
      /allow get, list: if request\.auth != null\s*&&\s*request\.auth\.uid == resource\.data\.userId/
    );
  });

  test("create must be stamped with the caller's own uid", () => {
    assert.match(
      conversions,
      /allow create: if request\.auth != null[\s\S]*request\.auth\.uid == request\.resource\.data\.userId/
    );
  });

  test("create requires userId to be a string", () => {
    assert.match(conversions, /request\.resource\.data\.userId is string/);
  });

  test("update cannot reassign ownership", () => {
    assert.match(
      conversions,
      /allow update: if[\s\S]*request\.resource\.data\.userId == resource\.data\.userId/
    );
  });

  test("delete is owner-scoped", () => {
    assert.match(
      conversions,
      /allow delete: if request\.auth != null\s*&&\s*request\.auth\.uid == resource\.data\.userId/
    );
  });

  test("update and delete are NOT combined (request.resource is null on delete)", () => {
    assert.ok(
      !/allow update, delete:/.test(conversions),
      "combined update, delete makes the ownership guard un-evaluable on delete"
    );
    assert.ok(!/allow delete, update:/.test(conversions));
  });
});
