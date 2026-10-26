import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  REQUIRED_FIREBASE_CONFIG_KEYS,
  missingFirebaseConfigKeys,
  firebaseConfigErrorMessage,
  envVarNameFor,
} from "../src/lib/firebase-config.ts";

const COMPLETE = {
  apiKey: "AIza-example",
  authDomain: "demo.firebaseapp.com",
  projectId: "demo",
  storageBucket: "demo.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc",
};

describe("missingFirebaseConfigKeys", () => {
  test("returns [] when every required key is present", () => {
    assert.deepEqual(missingFirebaseConfigKeys(COMPLETE), []);
  });

  test("flags keys that are absent entirely", () => {
    const rest: Record<string, unknown> = { ...COMPLETE };
    delete rest.apiKey;
    delete rest.projectId;
    const missing = missingFirebaseConfigKeys(rest);
    assert.deepEqual(missing.sort(), ["apiKey", "projectId"]);
  });

  test("treats empty and whitespace-only strings as unset", () => {
    const missing = missingFirebaseConfigKeys({
      ...COMPLETE,
      apiKey: "",
      authDomain: "   ",
    });
    assert.deepEqual(missing.sort(), ["apiKey", "authDomain"]);
  });

  test("treats non-string values as unset", () => {
    const missing = missingFirebaseConfigKeys({
      ...COMPLETE,
      appId: 42 as unknown as string,
    });
    assert.deepEqual(missing, ["appId"]);
  });

  test("an entirely empty object reports every required key", () => {
    const missing = missingFirebaseConfigKeys({});
    assert.deepEqual(missing, [...REQUIRED_FIREBASE_CONFIG_KEYS]);
  });
});

describe("firebaseConfigErrorMessage", () => {
  test("null when nothing is missing", () => {
    assert.equal(firebaseConfigErrorMessage([]), null);
  });

  test("names the exact NEXT_PUBLIC_ vars the operator must set", () => {
    const msg = firebaseConfigErrorMessage(["apiKey", "appId"]);
    assert.ok(msg !== null);
    assert.ok(msg.includes("NEXT_PUBLIC_FIREBASE_API_KEY"));
    assert.ok(msg.includes("NEXT_PUBLIC_FIREBASE_APP_ID"));
    // Actionable next step, not just a complaint.
    assert.ok(msg.includes(".env.example"));
  });
});

describe("envVarNameFor", () => {
  test("maps every config key to its NEXT_PUBLIC_ variable", () => {
    for (const key of REQUIRED_FIREBASE_CONFIG_KEYS) {
      assert.ok(envVarNameFor(key).startsWith("NEXT_PUBLIC_FIREBASE_"));
    }
  });
});
