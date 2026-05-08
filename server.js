const http = require("http");
const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");

const root = __dirname;
const port = 8080;

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8"
};

http.createServer(async (req, res) => {
  try {
    if (req.url === "/api/arduino/status") {
      return json(res, await getArduinoStatus());
    }
    if (req.url === "/api/arduino/boards") {
      return json(res, await getArduinoBoards());
    }
    if (req.url === "/api/arduino/install-libs" && req.method === "POST") {
      const body = await readJson(req);
      return json(res, await installArduinoLibraries(body.code || ""));
    }
    if (req.url === "/api/arduino/upload" && req.method === "POST") {
      const body = await readJson(req);
      return json(res, await compileAndUploadArduino(body));
    }
    if (req.url === "/api/pico/dependencies" && req.method === "POST") {
      const body = await readJson(req);
      return json(res, resolvePicoDependencies(body.code || ""));
    }
    return serveStatic(req, res);
  } catch (error) {
    res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    res.end(error.message || String(error));
  }
}).listen(port, () => {
  console.log(`Neuro Block server running at http://localhost:${port}`);
});

function json(res, data) {
  res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => { raw += chunk; });
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function serveStatic(req, res) {
  const requested = req.url === "/" ? "/index.html" : req.url;
  const pathname = decodeURIComponent(requested.split("?")[0]);
  const filePath = resolveStaticPath(pathname);
  if (!filePath.startsWith(root)) {
    res.writeHead(403);
    return res.end("Forbidden");
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      return res.end("Not found");
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { "Content-Type": mimeTypes[ext] || "application/octet-stream" });
    res.end(data);
  });
}

function resolveStaticPath(pathname) {
  if (pathname.startsWith("/vendor/blockly/")) {
    return path.join(root, "node_modules", "blockly", pathname.replace("/vendor/blockly/", ""));
  }
  return path.join(root, pathname);
}

function execArduinoCli(args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile("arduino-cli", args, { cwd: root, windowsHide: true, maxBuffer: 1024 * 1024, ...options }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr || stdout || error.message));
      } else {
        resolve({ stdout, stderr });
      }
    });
  });
}

async function getArduinoStatus() {
  try {
    await execArduinoCli(["version"]);
    return { installed: true };
  } catch {
    return { installed: false };
  }
}

async function getArduinoBoards() {
  try {
    const { stdout } = await execArduinoCli(["board", "list", "--format", "json"]);
    const parsed = JSON.parse(stdout || "[]");
    return Array.isArray(parsed) ? parsed : parsed.boards || [];
  } catch {
    return [];
  }
}

function detectArduinoLibraries(code) {
  return Array.from(code.matchAll(/^#include\s+[<"]([^>"]+)[>"]/gm)).map((match) => match[1].replace(/\.h$/i, ""));
}

async function installArduinoLibraries(code) {
  const libs = detectArduinoLibraries(code).filter((name) => name && name.toLowerCase() !== "arduino");
  if (!libs.length) return { message: "설치할 Arduino 라이브러리가 없습니다.", installed: [] };
  const installed = [];
  const failed = [];
  for (const lib of libs) {
    try {
      await execArduinoCli(["lib", "install", lib]);
      installed.push(lib);
    } catch (error) {
      failed.push({ lib, error: error.message });
    }
  }
  return {
    message: failed.length ? `일부 라이브러리 설치 실패: ${failed.map((x) => x.lib).join(", ")}` : "Arduino 라이브러리 설치 완료",
    installed,
    failed
  };
}

async function compileAndUploadArduino({ code, fqbn, port, sketchName }) {
  if (!fqbn) throw new Error("Arduino 보드 FQBN이 필요합니다.");
  if (!port) throw new Error("Arduino 포트가 필요합니다.");
  await installArduinoLibraries(code || "");
  const sketchDir = path.join(root, ".arduino-build", safeName(sketchName || "neuro_block"));
  fs.mkdirSync(sketchDir, { recursive: true });
  const inoPath = path.join(sketchDir, `${safeName(sketchName || "neuro_block")}.ino`);
  fs.writeFileSync(inoPath, code || "", "utf8");
  await execArduinoCli(["compile", "--fqbn", fqbn, sketchDir]);
  await execArduinoCli(["upload", "-p", port, "--fqbn", fqbn, sketchDir]);
  return { message: `Arduino 업로드 완료: ${port} / ${fqbn}` };
}

function resolvePicoDependencies(code) {
  const importMatches = Array.from(code.matchAll(/^(?:from|import)\s+([a-zA-Z_][\w]*)/gm)).map((m) => m[1]);
  const builtin = new Set(["machine", "utime", "time", "os", "sys", "math", "json", "random"]);
  const names = Array.from(new Set(importMatches.filter((name) => !builtin.has(name))));
  const files = [];
  for (const name of names) {
    const candidate = path.join(root, "device-libs", "pico", `${name}.py`);
    if (fs.existsSync(candidate)) {
      files.push({ name: `${name}.py`, content: fs.readFileSync(candidate, "utf8") });
    }
  }
  return { files };
}

function safeName(value) {
  return String(value || "neuro_block").replace(/[^a-zA-Z0-9_-]/g, "_");
}
