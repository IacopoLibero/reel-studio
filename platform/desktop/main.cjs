"use strict";
/**
 * Reel Studio as a desktop app (run by the `electron` of the system: `electron /usr/lib/reel-studio/platform/desktop`).
 * It starts the hub as a separate Node process, opens a window on it, sits in the tray (closing the window hides it, the hub keeps working),
 * and shows the hub's notifications as system notifications. Quitting from the tray stops the hub.
 */
const { app, BrowserWindow, Menu, Notification, Tray, dialog, nativeImage, session, shell } = require("electron");
const { join, resolve } = require("node:path");
const os = require("node:os");
const { augmentPath, enterUrl, readToken, startHub, waitHealth } = require("./lib/hub.cjs");
const { pollNotifications } = require("./lib/notify.cjs");
const autostart = require("./lib/autostart.cjs");

const HOME = os.homedir();
const STUDIO = process.env.REEL_STUDIO_HOME || join(HOME, "ReelStudio");
const DATA = join(STUDIO, "data");
const PORT = Number(process.env.HUB_PORT || 4000);
const BASE = `http://127.0.0.1:${PORT}`;
const HUB_DIR = resolve(__dirname, "../hub");
const COMMAND = process.env.REEL_STUDIO_COMMAND || "/usr/bin/reel-studio";
const hiddenStart = process.argv.includes("--hidden");
// The name the desktop shows on notifications and in the tray (the package name is "reel-studio-desktop").
app.setName("Reel Studio");
app.setDesktopName("reel-studio.desktop");

let win = null, tray = null, hub = null, quitting = false, poller = null;

if (!app.requestSingleInstanceLock()) { app.quit(); } else {
  // A second start (the menu entry clicked again) brings the window back.
  app.on("second-instance", () => showWindow());
  app.whenReady().then(main).catch((e) => fail(e));
}

function fail(e) {
  console.error(`[app] ${e && e.stack ? e.stack : e}`);
  dialog.showErrorBox("Reel Studio could not start", String(e && e.message ? e.message : e));
  quitting = true; app.quit();
}

async function main() {
  // The window may only show the hub: no camera, microphone or other permission, and links that go elsewhere open in the browser.
  session.defaultSession.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));
  Menu.setApplicationMenu(null);

  if (!(await waitHealth(BASE, { timeoutMs: 1500, intervalMs: 300 }))) {
    hub = startHub({
      hubDir: HUB_DIR,
      env: { ...process.env, REEL_STUDIO_HOME: STUDIO, HUB_PORT: String(PORT), PATH: augmentPath(process.env.PATH || "", HOME) },
      onLine: (l) => console.log(`[hub] ${l}`),
    });
    hub.exited.then((code) => { if (!quitting) fail(new Error(`The hub stopped (exit code ${code}).`)); });
    if (!(await waitHealth(BASE, { timeoutMs: 90000 }))) throw new Error("The hub did not start in time.");
  }
  console.log("[app] hub is up");
  makeTray();
  startNotifications();
  if (!hiddenStart) await showWindow();
}

async function showWindow() {
  if (win && !win.isDestroyed()) { win.show(); win.focus(); return; }
  const token = await tokenWhenReady();
  win = new BrowserWindow({
    width: 1360, height: 900, minWidth: 900, minHeight: 600, title: "Reel Studio", backgroundColor: "#111214",
    icon: join(__dirname, "icon.png"), autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  const inApp = (u) => { try { return new URL(u).origin === BASE; } catch { return false; } };
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url) && !inApp(url)) void shell.openExternal(url); return { action: "deny" }; });
  win.webContents.on("will-navigate", (e, url) => { if (!inApp(url)) { e.preventDefault(); if (/^https?:/.test(url)) void shell.openExternal(url); } });
  // Closing hides the window when there is a tray to bring it back from; a second start of the app also brings it back.
  win.on("close", (e) => { if (!quitting && tray) { e.preventDefault(); win.hide(); } });
  await win.loadURL(await enterUrl(BASE, token));
  console.log("[app] window shows the hub");
}

async function tokenWhenReady() {
  for (let i = 0; i < 20; i++) { const t = readToken(DATA); if (t) return t; await new Promise((r) => setTimeout(r, 500)); }
  throw new Error(`No token in ${DATA}/dev-token.`);
}

function makeTray() {
  try { tray = new Tray(nativeImage.createFromPath(join(__dirname, "tray.png"))); } catch { tray = null; return; }
  tray.setToolTip("Reel Studio");
  const build = () => Menu.buildFromTemplate([
    { label: "Open Reel Studio", click: () => void showWindow() },
    { label: "Start at login", type: "checkbox", checked: autostart.isOn({ home: HOME }), click: (item) => { autostart.set(item.checked, { home: HOME, command: COMMAND }); } },
    { type: "separator" },
    { label: "Quit (stops the hub)", click: () => quit() },
  ]);
  tray.setContextMenu(build());
  tray.on("click", () => void showWindow());
}

function startNotifications() {
  const tick = async () => {
    const token = readToken(DATA);
    if (!token) return;
    await pollNotifications({
      base: BASE, token,
      show: (n) => {
        if (!Notification.isSupported()) throw new Error("notifications are not supported here");
        const note = new Notification({ title: n.title, body: n.body, icon: join(__dirname, "icon.png") });
        note.on("click", () => { void showWindow().then(() => { if (win && n.url && String(n.url).startsWith("/")) void win.loadURL(`${BASE}${n.url}`); }); });
        note.show();
      },
    });
  };
  void tick();
  poller = setInterval(() => void tick(), 60000);
}

async function quit() {
  quitting = true;
  if (poller) clearInterval(poller);
  if (hub) await hub.stop();
  app.quit();
}

// With a tray the app lives on after its window closes; without one there would be no way back, so closing the window quits.
app.on("window-all-closed", () => { if (!tray) void quit(); });
app.on("before-quit", () => { quitting = true; });
// The hub must never outlive the app: a logout, a shutdown or a kill of the app (SIGTERM, SIGINT, SIGHUP) stops it too.
for (const sig of ["SIGTERM", "SIGINT", "SIGHUP"]) process.on(sig, () => { void quit(); });
process.on("exit", () => { if (hub && hub.child.exitCode === null) hub.child.kill("SIGTERM"); });
