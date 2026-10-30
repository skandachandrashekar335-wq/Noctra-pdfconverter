import { spawn } from "node:child_process";

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function run() {
  console.log("=== NOCTRA FIRST-TIME USER & ONBOARDING REMOVAL AUDIT ===");
  const edgeBin = "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge";
  const userDataDir = `/tmp/edge-no-onboarding-${Date.now()}`;
  const edgeProc = spawn(edgeBin, [
    "--headless=new",
    "--remote-debugging-port=9227",
    `--user-data-dir=${userDataDir}`,
    "--no-first-run",
    "about:blank",
  ]);

  try {
    let wsUrl = null;
    for (let i = 0; i < 30; i++) {
      try {
        const res = await fetch("http://127.0.0.1:9227/json/version");
        if (res.ok) {
          const json = await res.json();
          wsUrl = json.webSocketDebuggerUrl;
          if (wsUrl) break;
        }
      } catch {}
      await sleep(200);
    }
    const ws = new WebSocket(wsUrl);
    await new Promise((r) => (ws.onopen = r));

    let id = 1;
    const callbacks = new Map();
    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && callbacks.has(msg.id)) {
        callbacks.get(msg.id)(msg);
        callbacks.delete(msg.id);
      }
    };
    function send(method, params = {}) {
      return new Promise((resolve, reject) => {
        const reqId = id++;
        callbacks.set(reqId, (resp) => {
          if (resp.error) reject(new Error(resp.error.message || JSON.stringify(resp.error)));
          else resolve(resp.result);
        });
        ws.send(JSON.stringify({ id: reqId, method, params }));
      });
    }

    const { targetId } = await send("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });

    function sendSession(method, params = {}) {
      return new Promise((resolve, reject) => {
        const reqId = id++;
        callbacks.set(reqId, (resp) => {
          if (resp.error) reject(new Error(resp.error.message || JSON.stringify(resp.error)));
          else resolve(resp.result);
        });
        ws.send(JSON.stringify({ id: reqId, sessionId, method, params }));
      });
    }

    await sendSession("Page.enable");
    await sendSession("Runtime.enable");

    async function assertNoOnboarding(scenarioName) {
      await sleep(300);
      const res = await sendSession("Runtime.evaluate", {
        expression: `(() => {
          const dialog = document.querySelector('[role="dialog"][aria-labelledby*="onboarding"]');
          const hasPrivacyHeading = document.body?.innerText?.includes("100% Local-First Document Privacy");
          const hasInversionHeading = document.body?.innerText?.includes("Intelligent Dark Sweep Inversion");
          const hasTourText = document.body?.innerText?.includes("Unlike traditional converters, Noctra converts");
          const modalBackdrop = document.querySelector(".fixed.inset-0.z-50.bg-black\\\\/80");
          return {
            hasDialog: !!dialog,
            hasPrivacyHeading: !!hasPrivacyHeading,
            hasInversionHeading: !!hasInversionHeading,
            hasTourText: !!hasTourText,
            hasModalBackdrop: !!modalBackdrop
          };
        })()`,
        returnByValue: true,
      });
      const check = res.result.value;
      const failed = Object.values(check).some(Boolean);
      if (failed) {
        console.error(`✗ FAILED [${scenarioName}]: Onboarding popup detected:`, check);
        throw new Error(`Onboarding popup detected in ${scenarioName}`);
      } else {
        console.log(`✓ PASSED [${scenarioName}]: Clean application, zero onboarding popup.`);
      }
    }

    // Scenario 1: First visit in a fresh browser session (Landing Page)
    await sendSession("Page.navigate", { url: "http://localhost:3000/" });
    await sleep(1500);
    await assertNoOnboarding("Scenario 1: Fresh browser visit to Landing Page");

    // Scenario 2: First visit after explicitly clearing local storage (Landing Page)
    await sendSession("Runtime.evaluate", { expression: `localStorage.clear(); sessionStorage.clear();` });
    await sendSession("Page.navigate", { url: "http://localhost:3000/" });
    await sleep(1500);
    await assertNoOnboarding("Scenario 2: Visit after clearing all localStorage");

    // Scenario 3: New account registration / fresh session entering Dashboard
    await sendSession("Runtime.evaluate", {
      expression: `
        localStorage.clear();
        localStorage.setItem("noctra_auth_session", JSON.stringify({
          user: { uid: "brand-new-user-001", displayName: "Fresh Student", email: "fresh@noctra.app" },
          token: "fresh-token-123",
          expiresAt: Math.floor(Date.now() / 1000) + 3600
        }));
      `,
    });
    await sendSession("Page.navigate", { url: "http://localhost:3000/dashboard" });
    await sleep(2000);
    await assertNoOnboarding("Scenario 3: New user entering Dashboard directly");

    // Scenario 4: Google login session
    await sendSession("Runtime.evaluate", {
      expression: `
        localStorage.clear();
        localStorage.setItem("noctra_auth_session", JSON.stringify({
          user: { uid: "google-oauth-user", displayName: "Google Student", email: "google@noctra.app", photoURL: "https://example.com/photo.jpg" },
          token: "google-token-456",
          expiresAt: Math.floor(Date.now() / 1000) + 3600
        }));
      `,
    });
    await sendSession("Page.navigate", { url: "http://localhost:3000/dashboard" });
    await sleep(1500);
    await assertNoOnboarding("Scenario 4: Google login user entering Dashboard");

    // Scenario 5: Existing account login
    await sendSession("Runtime.evaluate", {
      expression: `
        localStorage.setItem("noctra_auth_session", JSON.stringify({
          user: { uid: "existing-user-789", displayName: "Alex Rivera", email: "alex@noctra.app" },
          token: "existing-token-789",
          expiresAt: Math.floor(Date.now() / 1000) + 86400 * 30
        }));
      `,
    });
    await sendSession("Page.navigate", { url: "http://localhost:3000/dashboard" });
    await sleep(1500);
    await assertNoOnboarding("Scenario 5: Existing account login");

    // Scenario 6: Page refresh on Dashboard
    await sendSession("Page.reload");
    await sleep(2000);
    await assertNoOnboarding("Scenario 6: Page reload on Dashboard");

    // Scenario 7: Returning after logout and login
    // Logout
    await sendSession("Runtime.evaluate", {
      expression: `
        localStorage.removeItem("noctra_auth_session");
      `,
    });
    await sendSession("Page.navigate", { url: "http://localhost:3000/auth/login" });
    await sleep(1000);
    await assertNoOnboarding("Scenario 7a: Login page after logout");
    // Re-login
    await sendSession("Runtime.evaluate", {
      expression: `
        localStorage.setItem("noctra_auth_session", JSON.stringify({
          user: { uid: "existing-user-789", displayName: "Alex Rivera", email: "alex@noctra.app" },
          token: "relogin-token",
          expiresAt: Math.floor(Date.now() / 1000) + 86400
        }));
      `,
    });
    await sendSession("Page.navigate", { url: "http://localhost:3000/dashboard" });
    await sleep(2000);
    await assertNoOnboarding("Scenario 7b: Re-login back to Dashboard");

    ws.close();
    console.log("=================================================");
    console.log("✓ ALL 7 USER SCENARIOS VERIFIED: ZERO ONBOARDING POPUP!");
    console.log("=================================================");
  } finally {
    edgeProc.kill("SIGKILL");
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
