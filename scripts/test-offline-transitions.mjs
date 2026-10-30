import { spawn } from "node:child_process";

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function run() {
  const edgeBin = "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge";
  const userDataDir = `/tmp/edge-offline-test-${Date.now()}`;
  const edgeProc = spawn(edgeBin, [
    "--headless=new",
    "--remote-debugging-port=9226",
    `--user-data-dir=${userDataDir}`,
    "--no-first-run",
    "about:blank",
  ]);

  try {
    let wsUrl = null;
    for (let i = 0; i < 30; i++) {
      try {
        const res = await fetch("http://127.0.0.1:9226/json/version");
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

    const { targetId } = await send("Target.createTarget", { url: "http://localhost:3000/" });
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
    await sendSession("Network.enable");

    // Login and open dashboard
    await sendSession("Runtime.evaluate", {
      expression: `
        localStorage.setItem("noctra_auth_session", JSON.stringify({
          user: { uid: "test-user-123", displayName: "Alex Rivera", email: "alex@noctra.app" },
          token: "mock-token",
          expiresAt: Math.floor(Date.now() / 1000) + 86400 * 30
        }));
        localStorage.setItem("noctra:app-theme", "dark");
      `,
    });

    await sendSession("Page.navigate", { url: "http://localhost:3000/dashboard" });
    await sleep(2500);

    // 1. Initial online check
    let state = await sendSession("Runtime.evaluate", {
      expression: `(() => {
        const title = document.querySelector(".dash-status-title")?.textContent?.trim() || "";
        const desc = document.querySelector(".dash-status-desc")?.textContent?.trim() || "";
        const isOnline = document.querySelector(".dash-status-pill")?.classList?.contains("is-online") || false;
        const floating = document.querySelector("aside[role='status']") !== null;
        return JSON.stringify({ title, desc, isOnline, floating });
      })()`,
      returnByValue: true,
    });
    console.log("1. Initial Online State:", JSON.parse(state.result.value));

    // 2. Simulate native browser offline state via CDP
    await sendSession("Network.emulateNetworkConditions", {
      offline: true,
      latency: 0,
      downloadThroughput: 0,
      uploadThroughput: 0,
    });
    await sleep(500);

    state = await sendSession("Runtime.evaluate", {
      expression: `(() => {
        const title = document.querySelector(".dash-status-title")?.textContent?.trim() || "";
        const desc = document.querySelector(".dash-status-desc")?.textContent?.trim() || "";
        const isOffline = document.querySelector(".dash-status-pill")?.classList?.contains("is-offline") || false;
        const floating = document.querySelector("aside[role='status']") !== null;
        const navOnline = navigator.onLine;
        return JSON.stringify({ title, desc, isOffline, floating, navOnline });
      })()`,
      returnByValue: true,
    });
    console.log("2. CDP Emulated Offline State:", JSON.parse(state.result.value));

    // 3. Restore native online state via CDP
    await sendSession("Network.emulateNetworkConditions", {
      offline: false,
      latency: 0,
      downloadThroughput: -1,
      uploadThroughput: -1,
    });
    await sleep(500);

    state = await sendSession("Runtime.evaluate", {
      expression: `(() => {
        const title = document.querySelector(".dash-status-title")?.textContent?.trim() || "";
        const isOnline = document.querySelector(".dash-status-pill")?.classList?.contains("is-online") || false;
        const navOnline = navigator.onLine;
        return JSON.stringify({ title, isOnline, navOnline });
      })()`,
      returnByValue: true,
    });
    console.log("3. Restored Online State:", JSON.parse(state.result.value));

    // 4. Mobile Viewport Offline Banner
    await sendSession("Emulation.setDeviceMetricsOverride", {
      width: 390,
      height: 844,
      deviceScaleFactor: 1,
      mobile: true,
    });
    await sendSession("Network.emulateNetworkConditions", {
      offline: true,
      latency: 0,
      downloadThroughput: 0,
      uploadThroughput: 0,
    });
    await sleep(500);

    state = await sendSession("Runtime.evaluate", {
      expression: `(() => {
        const banner = document.querySelector(".dash-mobile-offline-banner");
        const visible = banner !== null && window.getComputedStyle(banner).display !== "none";
        const text = banner?.textContent?.trim() || "";
        return JSON.stringify({ visible, text });
      })()`,
      returnByValue: true,
    });
    console.log("4. Mobile Viewport Offline Banner:", JSON.parse(state.result.value));

    ws.close();
  } finally {
    edgeProc.kill("SIGKILL");
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
