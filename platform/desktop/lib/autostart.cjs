"use strict";
const { existsSync, mkdirSync, rmSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");

const file = ({ home }) => join(home, ".config", "autostart", "reel-studio.desktop");

/** "Start at login": a standard autostart entry that opens the app hidden (in the tray), so schedules and daily plans keep going. */
function set(on, o) {
  if (!on) { rmSync(file(o), { force: true }); return; }
  mkdirSync(join(o.home, ".config", "autostart"), { recursive: true });
  writeFileSync(file(o), `[Desktop Entry]\nType=Application\nName=Reel Studio\nExec=${o.command} --hidden\nIcon=reel-studio\nTerminal=false\nX-GNOME-Autostart-enabled=true\n`);
}

const isOn = (o) => existsSync(file(o));

module.exports = { set, isOn };
