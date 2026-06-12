import io, traceback, os, sys
import mimetypes
import sqlite3
from http.cookies import SimpleCookie
import frappe
import frappe.auth
from frappe.app import application

BENCH_SITES_PATH = "/home/pyodide/bench/sites"
SITE_DB_PATH = "/home/pyodide/bench/sites/site1/db/site1.db"

def handle_request(req):
    """
    Simulates a WSGI environment, calls the Frappe application, 
    and returns a serialized Response dictionary.
    """
    if hasattr(req, "to_py"):
        req = req.to_py()
    global _cookie_jar
    
    # 1. Handle Static Files
    if req["path"].startswith("/files/"):
        try:
            file_path = "/home/pyodide/bench/sites/site1/public" + req["path"]
            with open(file_path, "rb") as f:
                content = f.read()
            mime_type, _ = mimetypes.guess_type(file_path)
            return {
                "status": 200, 
                "headers": [("Content-Type", mime_type or "application/octet-stream")], 
                "body": content
            }
        except FileNotFoundError:
            return {"status": 404, "headers": [], "body": b"File not found in MEMFS"}

    # 2. Re-init Frappe environment variables per request
    os.chdir(BENCH_SITES_PATH)
    os.environ["SITES_PATH"] = BENCH_SITES_PATH
    os.environ["FRAPPE_SITE"] = "site1"

    # 3. Build WSGI Environment Dictionary
    # We must properly format the browser-sent cookies alongside our _cookie_jar
    _browser_cookies = req["headers"].get("cookie", "") or ""
    
    _parsed = SimpleCookie(_browser_cookies)
    
    if '_cookie_jar' not in globals():
        _cookie_jar = {}
        
    for k, v in _cookie_jar.items():
        _parsed[k] = v
        
    _all_cookies = "; ".join(f"{k}={m.value}" for k, m in _parsed.items())

    environ = {
        "REQUEST_METHOD": req["method"],
        "PATH_INFO": req["path"],
        "QUERY_STRING": req.get("query", ""),
        "SERVER_NAME": "site1",
        "SERVER_PORT": "8000",
        "SERVER_PROTOCOL": "HTTP/1.1",
        "HTTP_HOST": "site1",
        "HTTP_COOKIE": _all_cookies,
        "wsgi.version": (1, 0),
        "wsgi.url_scheme": "http",
        "wsgi.errors": sys.stderr,
        "wsgi.multithread": False,
        "wsgi.multiprocess": False,
        "wsgi.run_once": False,
    }

    for k, v in req["headers"].items():
        key = "HTTP_" + k.replace("-", "_").upper()
        if key not in environ:
            environ[key] = str(v)

    body_data = req.get("body", b"")
    if isinstance(body_data, str):
        body_data = body_data.encode("utf-8")
    elif hasattr(body_data, "to_py"):
        body_data = bytes(body_data.to_py())
    elif not isinstance(body_data, bytes):
        body_data = bytes(body_data)

    environ["wsgi.input"] = io.BytesIO(body_data)

    if req["method"] in ["POST", "PUT", "PATCH"]:
        environ["CONTENT_TYPE"] = str(req["headers"].get("content-type", "application/x-www-form-urlencoded"))
        environ["CONTENT_LENGTH"] = str(len(body_data))

    _status = "500 Internal Server Error"
    _headers = []

    def start_response(status, response_headers, exc_info=None):
        nonlocal _status, _headers
        _status = status
        _headers = response_headers
        return lambda body_data: None

    # 4. Execute the WSGI Application
    try:
        result_iter = application(environ, start_response)
        
        # Extract returned Set-Cookie headers into the global cookie jar for persistence
        for k, v in _headers:
            if k.lower() == "set-cookie":
                parts = v.split(";")
                if parts:
                    kv = parts[0].split("=", 1)
                    if len(kv) == 2:
                        _cookie_jar[kv[0].strip()] = kv[1].strip()

        # Pyodide cannot return generator/iterable wrappers across the JS boundary easily,
        # so we exhaust the iterable and join the chunks here.
        body_parts = []
        for chunk in result_iter:
            body_parts.append(chunk)

        if hasattr(result_iter, "close"):
            result_iter.close()

        if (
            req["path"] == "/api/method/frappe.desk.page.setup_wizard.setup_wizard.setup_complete"
            and _status.startswith("2")
        ):
            # Frappe marks the app setup-complete after its own setup commit in this
            # WASM/SQLite path. Persist the final flags before the redirect to /desk.
            conn = sqlite3.connect(SITE_DB_PATH)
            try:
                conn.execute("PRAGMA journal_mode=WAL")
                conn.execute(
                    "update 'tabInstalled Application' set is_setup_complete=1 where app_name='frappe'"
                )
                conn.execute(
                    "update tabSingles set value='1' where doctype='System Settings' and field='setup_complete'"
                )
                conn.execute(
                    "update tabDefaultValue set defvalue='workspace' where parent='__default' and defkey='desktop:home_page'"
                )
                conn.commit()

            finally:
                conn.close()

    except Exception as e:
        tb = traceback.format_exc()
        print("WSGI Exception:", tb)
        _status = "500 Internal Server Error"
        _headers = [("Content-Type", "text/plain")]
        body_parts = [tb.encode("utf-8")]
    finally:
        frappe.destroy()

    # 5. Return JSON-serializable response to Javascript
    status_code = int(_status.split(" ")[0])
    try:
        body_bytes = b"".join(body_parts)
    except Exception:
        body_bytes = b""
        
    if status_code >= 500:
        print(f"WSGI 500 Error Body for {req['path']}: {body_bytes.decode('utf-8', errors='replace')}")
        
    return {
        "status": status_code,
        "headers": _headers,
        "body": body_bytes
    }

os.chdir(BENCH_SITES_PATH)
os.environ["SITES_PATH"] = BENCH_SITES_PATH
os.environ["FRAPPE_SITE"] = "site1"

frappe.init(site="site1", sites_path=BENCH_SITES_PATH)
frappe.connect()

def bypass_csrf(*args, **kwargs): return True
frappe.auth.validate_csrf_token = bypass_csrf
