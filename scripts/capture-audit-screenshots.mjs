import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const VIEWPORTS = [
  { name: "1920x1080", width: 1920, height: 1080 },
  { name: "1440x900", width: 1440, height: 900 },
  { name: "1280x800", width: 1280, height: 800 },
  { name: "1024x768", width: 1024, height: 768 },
  { name: "768x1024", width: 768, height: 1024 },
  { name: "390x844", width: 390, height: 844 },
];

const TABS = ["convert", "library", "study", "settings"];

async function main() {
  const edgeBin = "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge";
  const userDataDir = `/tmp/edge-audit-${Date.now()}`;
  fs.mkdirSync(userDataDir, { recursive: true });

  const outDir = path.resolve("audit-screenshots/restored");
  fs.mkdirSync(outDir, { recursive: true });

  const edgeProc = spawn(edgeBin, [
    "--headless=new",
    "--remote-debugging-port=9224",
    `--user-data-dir=${userDataDir}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-gpu",
    "about:blank",
  ]);

  try {
    let wsUrl = null;
    for (let i = 0; i < 30; i++) {
      try {
        const res = await fetch("http://127.0.0.1:9224/json/version");
        if (res.ok) {
          const json = await res.json();
          wsUrl = json.webSocketDebuggerUrl;
          if (wsUrl) break;
        }
      } catch {}
      await sleep(200);
    }
    if (!wsUrl) throw new Error("Could not connect to Edge DevTools WebSocket");

    const ws = new WebSocket(wsUrl);
    await new Promise((resolve) => ws.onopen = resolve);

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
    await sendSession("DOM.enable");

    // Set local storage session
    await sleep(1500);
    await sendSession("Runtime.evaluate", {
      expression: `(() => {
        localStorage.setItem("noctra_auth_session", JSON.stringify({
          user: { uid: "test-user-123", displayName: "Alex Rivera", email: "alex@noctra.app" },
          token: "mock-token",
          expiresAt: Math.floor(Date.now() / 1000) + 86400 * 30
        }));
        localStorage.setItem("noctra:app-theme", "dark");
      })()`,
    });

    // Navigate to dashboard
    await sendSession("Page.navigate", { url: "http://localhost:3000/dashboard" });
    await sleep(2500);

    // Hide Next.js dev overlay if present so it doesn't obstruct tabs in screenshots
    await sendSession("Runtime.evaluate", {
      expression: `(() => {
        const style = document.createElement("style");
        style.textContent = "nextjs-portal, [data-nextjs-toast], #nextjs-dev-overlay { display: none !important; }";
        document.head.appendChild(style);
      })()`,
    });

    for (const vp of VIEWPORTS) {
      console.log(`Setting viewport: ${vp.name} (${vp.width}x${vp.height})`);
      await sendSession("Emulation.setDeviceMetricsOverride", {
        width: vp.width,
        height: vp.height,
        deviceScaleFactor: 1,
        mobile: vp.width <= 768,
      });

      for (const tab of TABS) {
        // Click navigation tab
        await sendSession("Runtime.evaluate", {
          expression: `(() => {
            const labelMap = {
              convert: "Convert",
              library: "Library",
              study: "Study AI",
              settings: "Settings"
            };
            const targetText = labelMap["${tab}"];
            const buttons = Array.from(document.querySelectorAll(".nav-item, button, .dash-nav button"));
            const btn = buttons.find(b => b.textContent && b.textContent.includes(targetText));
            if (btn) btn.click();
          })()`,
        });
        await sleep(500);

        const scr = await sendSession("Page.captureScreenshot", { format: "png" });
        const filePath = path.join(outDir, `${vp.name}-${tab}.png`);
        fs.writeFileSync(filePath, Buffer.from(scr.data, "base64"));
        console.log(`Saved screenshot: ${filePath}`);
      }
    }

    ws.close();
  } finally {
    edgeProc.kill("SIGKILL");
    try {
      fs.rmSync(userDataDir, { recursive: true, force: true });
    } catch {}
  }
}

main().catch((err) => {
  console.error("Audit screenshot failed:", err);
  process.exit(1);
});
