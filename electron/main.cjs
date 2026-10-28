const { app, BrowserWindow, dialog, shell } = require("electron");
const os = require("node:os");
const path = require("node:path");
const fs = require("node:fs");
const http = require("node:http");
const next = require("next");

let mainWindow;
let splashWindow;
let nextApp;
let server;
console.log("[PronaX] Electron main loaded", app.getAppPath());

// Keep the portable build self-contained and avoid relying on a profile path
// that may not be writable when launched from a temporary portable extraction.
const userDataPath = path.join(app.getPath("temp"), "PronaX-profile");
fs.mkdirSync(userDataPath, { recursive: true });
app.setPath("userData", userDataPath);
app.commandLine.appendSwitch("disk-cache-dir", path.join(userDataPath, "cache"));
app.commandLine.appendSwitch("disable-http-cache");
app.commandLine.appendSwitch("no-proxy-server");
app.disableHardwareAcceleration();
app.commandLine.appendSwitch("disable-gpu");
app.commandLine.appendSwitch("disable-gpu-compositing");
app.commandLine.appendSwitch("disable-gpu-rasterization");
app.commandLine.appendSwitch("disable-gpu-sandbox");
app.commandLine.appendSwitch("enable-unsafe-swiftshader");

async function startWebApp() {
  const projectRoot = app.getAppPath();
  const isDevelopment = !app.isPackaged && process.env.PRONAX_DESKTOP_PRODUCTION !== "1";
  process.chdir(projectRoot);
  process.env.NODE_ENV = isDevelopment ? "development" : "production";
  process.env.NEXT_TELEMETRY_DISABLED = "1";

  nextApp = next({ dev: isDevelopment, dir: projectRoot, hostname: "127.0.0.1" });
  console.log("[PronaX] Preparing local app", { isDevelopment, projectRoot });
  await nextApp.prepare();
  console.log("[PronaX] Next.js is ready");
  const handler = nextApp.getRequestHandler();
  server = http.createServer((request, response) => {
    console.log("[PronaX] HTTP request", request.method, request.url);
    Promise.resolve(handler(request, response)).catch((error) => {
      console.error("[PronaX] HTTP handler failed", error);
      if (!response.headersSent) response.writeHead(500);
      response.end("PronaX server error");
    });
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Could not start the local PronaX server.");
  console.log("[PronaX] Local server listening", address);
  return `http://127.0.0.1:${address.port}`;
}

function showSplash() {
  splashWindow = new BrowserWindow({
    width: 520,
    height: 260,
    resizable: false,
    maximizable: false,
    minimizable: false,
    frame: false,
    center: true,
    show: true,
    alwaysOnTop: true,
    backgroundColor: "#050505",
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  splashWindow.loadFile(path.join(__dirname, "splash.html"));
}

function closeSplash() {
  if (splashWindow && !splashWindow.isDestroyed()) splashWindow.close();
  splashWindow = null;
}

async function createWindow() {
  showSplash();
  const url = await startWebApp();
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 940,
    minWidth: 900,
    minHeight: 640,
    show: false,
    backgroundColor: "#f7f9f6",
    icon: path.join(app.getAppPath(), "public", "pronax-app-icon.ico"),
    title: "PronaX — Albania Neighbourhood Intelligence",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  mainWindow.webContents.setWindowOpenHandler(({ url: target }) => {
    if (target.startsWith("https://") || target.startsWith("http://")) shell.openExternal(target);
    return { action: "deny" };
  });
  mainWindow.once("ready-to-show", () => { mainWindow.show(); closeSplash(); });
  await mainWindow.loadURL(url);
  mainWindow.on("closed", () => { mainWindow = null; });
}

app.whenReady().then(() => {
  console.log("[PronaX] Electron ready");
  return createWindow();
}).catch((error) => {
  closeSplash();
  console.error("PronaX startup failed:", error);
  dialog.showErrorBox("PronaX could not start", `${error.message}\n\nTry reinstalling or contact support with the startup log.`);
  app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow().catch(console.error);
});

app.on("before-quit", () => {
  if (server) server.close();
  if (nextApp && typeof nextApp.close === "function") nextApp.close();
});

app.on("window-all-closed", () => app.quit());
