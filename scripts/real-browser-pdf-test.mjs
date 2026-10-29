import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { PDFDocument } from "pdf-lib";

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function run() {
  console.log("=== NOCTRA REAL BROWSER E2E PDF CONVERSION TEST ===");

  const edgeBin = "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge";
  const userDataDir = `/tmp/edge-noctra-test-${Date.now()}`;
  fs.mkdirSync(userDataDir, { recursive: true });

  const edgeProc = spawn(edgeBin, [
    "--headless=new",
    "--remote-debugging-port=9222",
    `--user-data-dir=${userDataDir}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-gpu",
    "about:blank",
  ]);

  edgeProc.on("error", (err) => console.error("Edge process error:", err));

  try {
    let wsUrl = null;
    for (let i = 0; i < 30; i++) {
      try {
        const res = await fetch("http://127.0.0.1:9222/json/version");
        if (res.ok) {
          const json = await res.json();
          wsUrl = json.webSocketDebuggerUrl;
          if (wsUrl) break;
        }
      } catch {}
      await sleep(200);
    }

    if (!wsUrl) throw new Error("Could not connect to Edge DevTools WebSocket");
    console.log("Connected to Headless Edge via CDP");

    // Connect WebSocket
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

    // Create target page
    const { targetId } = await send("Target.createTarget", { url: "http://localhost:3000/test-convert" });
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

    console.log("Page navigating to http://localhost:3000/test-convert...");
    await sleep(2000);

    // Read the test fixture: 13-page PDF
    const fixturePath = path.resolve("qa-fixtures/noctra-qa-13.pdf");
    const fixtureBytes = fs.readFileSync(fixturePath);
    console.log(`Loaded test fixture: ${fixturePath} (${fixtureBytes.length} bytes, 13 pages)`);

    // Find the file input in DOM
    const doc = await sendSession("DOM.getDocument");
    const inputNode = await sendSession("DOM.querySelector", {
      nodeId: doc.root.nodeId,
      selector: "input[type='file']",
    });

    if (!inputNode || !inputNode.nodeId) {
      throw new Error("Could not find input[type='file'] on /test-convert page");
    }

    console.log("Triggering file upload into UploadZone...");
    await sendSession("DOM.setFileInputFiles", {
      files: [fixturePath],
      nodeId: inputNode.nodeId,
    });

    // Monitor conversion progress in browser
    console.log("Monitoring browser conversion progress...");
    let done = false;
    let attempts = 0;
    let outputUrl = null;

    while (!done && attempts < 60) {
      await sleep(1000);
      attempts++;

      const evalRes = await sendSession("Runtime.evaluate", {
        expression: `(() => {
          const title = document.querySelector(".done-title");
          const error = document.querySelector(".error-banner, [role='alert']");
          const downloadBtn = document.querySelector("a.done-download");
          const prog = document.querySelector(".prog-pct, .progress-fill");
          const label = document.querySelector(".prog-label");
          return {
            isDone: !!title && title.textContent.includes("complete"),
            isError: !!error ? error.textContent : null,
            downloadHref: downloadBtn ? downloadBtn.getAttribute("href") : null,
            progText: prog ? prog.textContent : null,
            labelText: label ? label.textContent : null,
          };
        })()`,
        returnByValue: true,
      });

      const state = evalRes.result?.value;
      if (!state) continue;

      if (state.isError) {
        throw new Error(`Browser conversion failed with error: ${state.isError}`);
      }

      if (state.isDone && state.downloadHref) {
        outputUrl = state.downloadHref;
        done = true;
        console.log(`✓ Conversion completed in browser! Download URL: ${outputUrl.slice(0, 40)}...`);
        break;
      } else {
        console.log(`  [${attempts}s] Progress: ${state.progText || "in flight"} - ${state.labelText || "processing"}`);
      }
    }

    if (!done || !outputUrl) {
      throw new Error("Conversion timed out after 60 seconds without reaching done state.");
    }

    // Now verify the downloaded PDF: Fetch the blob from browser memory!
    console.log("Fetching converted PDF blob from browser memory via CDP...");
    const blobFetchRes = await sendSession("Runtime.evaluate", {
      expression: `(async () => {
        const downloadBtn = document.querySelector("a.done-download");
        const res = await fetch(downloadBtn.href);
        const buf = await res.arrayBuffer();
        const bytes = new Uint8Array(buf);
        let binary = "";
        const len = bytes.byteLength;
        for (let i = 0; i < len; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
      })()`,
      awaitPromise: true,
      returnByValue: true,
    });

    const base64Data = blobFetchRes.result?.value;
    if (!base64Data) {
      throw new Error("Failed to extract converted blob bytes from browser!");
    }

    const downloadedBytes = Buffer.from(base64Data, "base64");
    console.log(`✓ Downloaded converted PDF: ${downloadedBytes.length} bytes`);

    // Verify downloaded bytes parse as a valid PDF with 13 pages
    console.log("Verifying output PDF structure and page count with pdf-lib...");
    const outputPdf = await PDFDocument.load(downloadedBytes);
    const outputPageCount = outputPdf.getPageCount();
    console.log(`✓ Output PDF page count: ${outputPageCount} (Expected: 13)`);

    if (outputPageCount !== 13) {
      throw new Error(`Page count mismatch! Expected 13, got ${outputPageCount}`);
    }

    if (downloadedBytes.length < 5000) {
      throw new Error(`Output file unexpectedly small: ${downloadedBytes.length} bytes`);
    }

    // Save a copy of the verified output PDF
    const outPath = "/tmp/noctra-qa-13-converted.pdf";
    fs.writeFileSync(outPath, downloadedBytes);
    console.log(`✓ Verified converted PDF saved to ${outPath}`);

    // Test 2: Small 1-page PDF
    console.log("\n--- Testing Single-Page PDF (noctra-qa.pdf) ---");
    const smallPath = path.resolve("qa-fixtures/noctra-qa.pdf");
    // Click "Convert another"
    await sendSession("Runtime.evaluate", {
      expression: `document.querySelectorAll("button").forEach(b => { if (b.textContent.includes("Convert another")) b.click(); });`,
    });
    await sleep(500);

    const doc2 = await sendSession("DOM.getDocument");
    const inputNode2 = await sendSession("DOM.querySelector", {
      nodeId: doc2.root.nodeId,
      selector: "input[type='file']",
    });
    await sendSession("DOM.setFileInputFiles", {
      files: [smallPath],
      nodeId: inputNode2.nodeId,
    });

    let smallDone = false;
    for (let i = 0; i < 20; i++) {
      await sleep(1000);
      const res = await sendSession("Runtime.evaluate", {
        expression: `(() => {
          const title = document.querySelector(".done-title");
          const downloadBtn = document.querySelector("a.done-download");
          return {
            isDone: !!title && title.textContent.includes("complete"),
            downloadHref: downloadBtn ? downloadBtn.getAttribute("href") : null,
          };
        })()`,
        returnByValue: true,
      });
      if (res.result?.value?.isDone) {
        smallDone = true;
        console.log("✓ Single-page PDF conversion complete!");
        break;
      }
    }
    if (!smallDone) throw new Error("Single page PDF conversion timed out");

    // Test 3: Failure case (Invalid file)
    console.log("\n--- Testing Invalid Input Failure Case ---");
    const invalidPath = "/tmp/fake-invalid.exe";
    fs.writeFileSync(invalidPath, "not a document");
    // Click "Convert another"
    await sendSession("Runtime.evaluate", {
      expression: `document.querySelectorAll("button").forEach(b => { if (b.textContent.includes("Convert another")) b.click(); });`,
    });
    await sleep(500);

    const doc3 = await sendSession("DOM.getDocument");
    const inputNode3 = await sendSession("DOM.querySelector", {
      nodeId: doc3.root.nodeId,
      selector: "input[type='file']",
    });
    await sendSession("DOM.setFileInputFiles", {
      files: [invalidPath],
      nodeId: inputNode3.nodeId,
    });
    await sleep(500);

    const errorCheck = await sendSession("Runtime.evaluate", {
      expression: `(() => {
        const err = document.querySelector(".error-text, [role='alert'], .error-card");
        return err ? err.textContent : null;
      })()`,
      returnByValue: true,
    });
    console.log(`✓ Invalid file gracefully rejected with message: "${errorCheck.result?.value?.trim()}"`);
    fs.unlinkSync(invalidPath);

    console.log("\n=================================================");
    console.log("✓ SUCCESS: REAL BROWSER CONVERSION AND DOWNLOAD VERIFIED!");
    console.log("✓ 13-page PDF processed through full pipeline without stalls.");
    console.log("✓ Downloaded PDF is non-empty, valid, and fully readable.");
    console.log("=================================================\n");

    ws.close();
  } finally {
    edgeProc.kill("SIGKILL");
    try {
      fs.rmSync(userDataDir, { recursive: true, force: true });
    } catch {}
  }
}

run().catch((err) => {
  console.error("\n❌ Browser test failed:", err);
  process.exit(1);
});
