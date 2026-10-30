import { spawn } from "node:child_process";
import fs from "node:fs";

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

async function main() {
  console.log("=== Noctra Legal Pages Accessibility & Layout Verification ===\n");
  const edgeBin = "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge";
  const userDataDir = `/tmp/edge-audit-${Date.now()}`;
  fs.mkdirSync(userDataDir, { recursive: true });

  const edgeProc = spawn(edgeBin, [
    "--headless=new",
    "--remote-debugging-port=9255",
    `--user-data-dir=${userDataDir}`,
    "--no-first-run",
    "about:blank",
  ]);

  let allPassed = true;

  try {
    let wsUrl = null;
    for (let i = 0; i < 25; i++) {
      try {
        const res = await fetch("http://127.0.0.1:9255/json/version");
        if (res.ok) {
          wsUrl = (await res.json()).webSocketDebuggerUrl;
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

    for (const route of ["/privacy", "/terms"]) {
      console.log(`Checking route: ${route}`);

      for (const vp of VIEWPORTS) {
        await sendSession("Emulation.setDeviceMetricsOverride", {
          width: vp.width,
          height: vp.height,
          deviceScaleFactor: 1,
          mobile: vp.width <= 768,
        });

        await sendSession("Page.navigate", { url: `http://localhost:3000${route}` });
        await sleep(1000);

        const checkRes = await sendSession("Runtime.evaluate", {
          returnByValue: true,
          expression: `(() => {
            const docWidth = document.documentElement.scrollWidth;
            const winWidth = window.innerWidth;
            const hasHorizontalOverflow = docWidth > winWidth;
            
            const h1Count = document.querySelectorAll("h1").length;
            const h2Count = document.querySelectorAll("h2").length;
            
            const tocLinks = Array.from(document.querySelectorAll(".legal-toc-link")).length;
            const sections = Array.from(document.querySelectorAll(".legal-section")).length;
            
            return {
              viewport: "${vp.name}",
              docWidth,
              winWidth,
              hasHorizontalOverflow,
              h1Count,
              h2Count,
              tocLinks,
              sections,
            };
          })()`,
        });

        const r = checkRes.result.value;
        const overflowOk = !r.hasHorizontalOverflow;
        const structureOk = r.h1Count === 1 && r.h2Count >= 6 && r.sections === 6;

        if (overflowOk && structureOk) {
          console.log(`  ✔ [${vp.name}]: No overflow (${r.docWidth}px <= ${r.winWidth}px), h1=${r.h1Count}, h2=${r.h2Count}, sections=${r.sections}`);
        } else {
          console.error(`  ❌ [${vp.name}]: FAILED check:`, r);
          allPassed = false;
        }
      }
    }

    ws.close();
  } finally {
    edgeProc.kill("SIGKILL");
    try {
      fs.rmSync(userDataDir, { recursive: true, force: true });
    } catch {}
  }

  if (allPassed) {
    console.log("\n✔ ALL RESPONSIVE & ACCESSIBILITY CHECKS PASSED!");
  } else {
    console.error("\n❌ ACCESSIBILITY CHECK FAILED.");
    process.exit(1);
  }
}

main().catch(console.error);
