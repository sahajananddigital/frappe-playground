// ──────────────────────────────────────────────────────────────────────────────
// Frappe WASM Playground — Web Worker (Pyodide Runtime Sandbox)
// ──────────────────────────────────────────────────────────────────────────────
import { loadPyodide } from "/pyodide/pyodide.mjs";

let pyodide;
let fromServiceWorkerPort;

// Local Express server serves storage/ at this endpoint
const STORAGE_ENDPOINT = `${self.location.origin}/storage`;

// ─── Boot Sequence ──────────────────────────────────────────────────────────

async function bootPython() {
    self.postMessage({ type: "LOG", message: "Loading Pyodide..." });

    // 1. Initialize Pyodide engine
    pyodide = await loadPyodide();

    // 2. Load foundational WASM binary packages
    self.postMessage({ type: "LOG", message: "Loading core packages..." });
    await pyodide.loadPackage(["micropip", "cryptography", "tzdata"]);

    // 3. Install pure-Python dependencies from PyPI via micropip
    self.postMessage({ type: "LOG", message: "Installing Python dependencies..." });
    const micropip = pyodide.pyimport("micropip");
    await micropip.install([
        "RestrictedPython", "filetype", "filelock", "pypdf", "passlib",
        "markdown2", "bleach", "bleach-allowlist", "croniter", "cssutils",
        "email-reply-parser", "pydantic", "sqlparse", "sql_metadata",
        "terminaltables", "traceback-with-variables", "typing_extensions",
        "xlrd", "zxcvbn", "markdownify", "PyJWT", "semantic-version",
        "chardet", "html5lib", "oauthlib", "openpyxl", "xlsxwriter",
        "phonenumbers", "premailer", "pyotp", "requests-oauthlib", "rsa",
        "sentry-sdk", "tenacity", "Pillow", "pytz", "requests", "urllib3",
        "nh3", "Babel", "MarkupSafe", "PyYAML", "beautifulsoup4",
        "python-dateutil", "posthog", "pdfkit", "PyMySQL", "whoosh",
    ], { keep_going: true });

    // 4. Fetch runtime assets (Frappe code bundle + pre-baked SQLite DB + local wheels)
    self.postMessage({ type: "LOG", message: "Fetching Frappe runtime..." });
    const [codeRes, dbRes, docoptRes, num2wordsRes, assetsRes] = await Promise.all([
        fetch(`${STORAGE_ENDPOINT}/frappe_runtime.tar.gz`),
        fetch(`${STORAGE_ENDPOINT}/site1.db`),
        fetch(`${self.location.origin}/wheels/docopt-0.6.2-py2.py3-none-any.whl`),
        fetch(`${self.location.origin}/wheels/num2words-0.5.14-py3-none-any.whl`),
        fetch(`${STORAGE_ENDPOINT}/assets/assets.json`),
    ]);

    const codeArr = new Uint8Array(await codeRes.arrayBuffer());
    const dbArr  = new Uint8Array(await dbRes.arrayBuffer());
    const docoptArr = new Uint8Array(await docoptRes.arrayBuffer());
    const num2wordsArr = new Uint8Array(await num2wordsRes.arrayBuffer());
    const assetsJson = await assetsRes.text();

    // 5. Mount filesystem: Frappe code, site database, wheels
    self.postMessage({ type: "LOG", message: "Mounting virtual filesystem..." });
    pyodide.FS.mkdir("/home/pyodide/frappe_env");
    pyodide.unpackArchive(codeArr, "gztar", { extractDir: "/home/pyodide/frappe_env" });

    // Write wheels to FS for emfs:// install
    pyodide.FS.writeFile("/home/pyodide/docopt-0.6.2-py2.py3-none-any.whl", docoptArr);
    pyodide.FS.writeFile("/home/pyodide/num2words-0.5.14-py3-none-any.whl", num2wordsArr);
    await micropip.install("emfs:///home/pyodide/docopt-0.6.2-py2.py3-none-any.whl");
    await micropip.install("emfs:///home/pyodide/num2words-0.5.14-py3-none-any.whl");

    // Create Bench directory structure
    const dirs = [
        "/home/pyodide/bench",
        "/home/pyodide/bench/sites",
        "/home/pyodide/bench/sites/assets",
        "/home/pyodide/bench/sites/site1",
        "/home/pyodide/bench/sites/site1/db",
        "/home/pyodide/bench/sites/site1/locks",
        "/home/pyodide/bench/sites/site1/logs",
        "/home/pyodide/bench/sites/site1/private",
        "/home/pyodide/bench/sites/site1/private/files",
        "/home/pyodide/bench/sites/site1/public",
        "/home/pyodide/bench/sites/site1/public/files",
        "/home/pyodide/bench/logs",
        "/home/logs",
        "/home/pyodide/logs",
    ];
    for (const d of dirs) {
        try { pyodide.FS.mkdir(d); } catch (_) { /* exists */ }
    }

    // Write site database and config files
    pyodide.FS.writeFile("/home/pyodide/bench/sites/site1/db/site1.db", dbArr);
    pyodide.FS.writeFile("/home/pyodide/bench/sites/assets/assets.json", assetsJson);
    pyodide.FS.writeFile("/home/pyodide/bench/sites/apps.txt", "frappe\n");
    pyodide.FS.writeFile("/home/pyodide/bench/sites/currentsite.txt", "site1\n");

    // 6. Fetch and execute Python architecture modules
    self.postMessage({ type: "LOG", message: "Configuring Python environment..." });
    
    const [mocksRes, wsgiRes] = await Promise.all([
        fetch('/python/frappe_mocks.py'),
        fetch('/python/wsgi_server.py')
    ]);

    const mocksCode = await mocksRes.text();
    const wsgiCode = await wsgiRes.text();

    await pyodide.runPythonAsync(mocksCode);

    // Write the site_config.json
    await pyodide.runPythonAsync(`
import json, os, warnings
warnings.filterwarnings("ignore", category=SyntaxWarning, module=r"whoosh\\..*")
warnings.filterwarnings("ignore", category=DeprecationWarning, module=r"whoosh\\..*")

site_config = {
    "db_type": "sqlite",
    "db_name": "site1",
    "use_memory_cache": True,
    "developer_mode": 1,
    "ignore_csrf": 1,
}
with open("/home/pyodide/bench/sites/site1/site_config.json", "w") as f:
    json.dump(site_config, f)

os.chdir("/home/pyodide/bench/sites")
os.environ["SITES_PATH"] = "/home/pyodide/bench/sites"
os.environ["FRAPPE_SITE"] = "site1"

import frappe
frappe.init(site="site1", sites_path="/home/pyodide/bench/sites")
frappe.connect()

import frappe.auth
def bypass_csrf(*args, **kwargs): return True
frappe.auth.validate_csrf_token = bypass_csrf
    `);

    // Load the WSGI Server definitions
    await pyodide.runPythonAsync(wsgiCode);

    self.postMessage({ type: "LOG", message: "Frappe booted successfully!" });
    self.postMessage({ type: "READY" });
}

// ─── WSGI Request Handler ───────────────────────────────────────────────────

self.onmessage = async (event) => {
    if (event.data && event.data.type === "INIT_CHANNEL") {
        fromServiceWorkerPort = event.ports[0];
        
        // Wait for Pyodide to finish booting BEFORE handling ANY requests
        try {
            await bootPython();
            fromServiceWorkerPort.postMessage({ type: "READY" });
        } catch (err) {
            console.error("Failed to boot Pyodide:", err);
            return;
        }

        const requestQueue = [];
        let processing = false;

        async function processQueue() {
            if (processing || requestQueue.length === 0) return;
            processing = true;

            const { req, responsePort } = requestQueue.shift();
            console.log("WORKER PROCESSING REQUEST:", req.method, req.path);

            try {
                self.pyRequestPayload = req;
                
                // Execute the WSGI handler we loaded from wsgi_server.py
                const resultJson = await pyodide.runPythonAsync(`
import json, js
req = js.self.pyRequestPayload.to_py()
response = handle_request(req)
json.dumps(response)
                `);
                responsePort.postMessage(JSON.parse(resultJson));
            } catch (err) {
                // If Pyodide itself crashes, return a 500 so the SW doesn't hang
                responsePort.postMessage({
                    status: 500,
                    headers: { "Content-Type": "text/plain" },
                    body: `Worker error: ${err.message}\n${err.stack || ""}`,
                });
            } finally {
                processing = false;
                setTimeout(processQueue, 0);
            }
        }

        fromServiceWorkerPort.onmessage = (reqEvent) => {
            requestQueue.push({
                req: reqEvent.data,
                responsePort: reqEvent.ports[0]
            });
            processQueue();
        };
        
    }
};
