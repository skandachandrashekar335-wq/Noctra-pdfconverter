import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

const VIEWPORTS = [
  { name: "desktop-1440", width: 1440, height: 900 },
  { name: "laptop-1280", width: 1280, height: 800 },
  { name: "tablet-768", width: 768, height: 1024 },
  { name: "mobile-390", width: 390, height: 844 },
  { name: "mobile-360", width: 360, height: 740 },
];

export async function captureLegalPages(subfolder = "current") {
  const edgeBin = "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge";
  const userDataDir = `/tmp/edge-legal-${Date.now()}`;
  fs.mkdirSync(userDataDir, { recursive: true });

  const outDir = path.resolve(`audit-screenshots/legal-pages/${subfolder}`);
  fs.mkdirSync(outDir, { recursive: true });

  const edgeProc = spawn(edgeBin, [
    "--headless=new",
    "--remote-debugging-port=9244",
    `--user-data-dir=${userDataDir}`,
    "--no-first-run",
    "about:blank",
  ]);

  try {
    let wsUrl = null;
    for (let i = 0; i < 25; i++) {
      try {
        const res = await fetch("http://127.0.0.1:9244/json/version");
        if (res.ok) {
          wsUrl = (await res.json()).webSocketDebuggerUrl;
          if (wsUrl) break;
        }
      } catch {}
      await sleep(200);
    }

    if (!wsUrl) throw new Error("Could not connect to Edge DevTools WebSocket");

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
        callbacks.set(reqId, (r) => (r.error ? reject(new Error(r.error.message)) : resolve(r.result)));
        ws.send(JSON.stringify({ id: reqId, method, params }));
      });
    }

    const { targetId } = await send("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });

    function sendSession(method, params = {}) {
      return new Promise((resolve, reject) => {
        const reqId = id++;
        callbacks.set(reqId, (r) => (r.error ? reject(new Error(r.error.message)) : resolve(r.result)));
        ws.send(JSON.stringify({ id: reqId, sessionId, method, params }));
      });
    }

    await sendSession("Page.enable");
    await sendSession("Runtime.enable");
    await sendSession("DOM.enable");

    const pagesToCapture = [
      { route: "/privacy", label: "privacy" },
      { route: "/terms", label: "terms" },
    ];

    for (const pageInfo of pagesToCapture) {
      for (const vp of VIEWPORTS) {
        await sendSession("Emulation.setDeviceMetricsOverride", {
          width: vp.width,
          height: vp.height,
          deviceScaleFactor: 1,
          mobile: vp.width <= 768,
        });

        await sendSession("Page.navigate", { url: `http://localhost:3000${pageInfo.route}` });
        await sleep(1500);

        // Hide Next.js dev toast
        await sendSession("Runtime.evaluate", {
          expression: `(() => {
            const style = document.createElement("style");
            style.textContent = "nextjs-portal, [data-nextjs-toast], #nextjs-dev-overlay { display: none !important; }";
            document.head.appendChild(style);
          })()`,
        });
        await sleep(300);

        // Capture full page
        const screenshotRes = await sendSession("Page.captureScreenshot", {
          format: "png",
          captureBeyondViewport: true,
        });

        const filePath = path.join(outDir, `${pageInfo.label}-${vp.name}.png`);
        fs.writeFileSync(filePath, Buffer.from(screenshotRes.data, "base64"));
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

captureLegalPages("redesigned").catch(console.error);
