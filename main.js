const path = require("path");
const { app, BrowserWindow, globalShortcut } = require("electron");

const BACKQUOTE_ACCELERATOR = "`";

let mainWindow = null;
let shortcutRegistered = false;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 700,
    webPreferences: {
      // Simpele lokale app: renderer mag Node modules gebruiken.
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, "index.html"));
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function triggerUsbAction() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  // Renderer kiest zelf (vast/random) en speelt geluid af.
  mainWindow.webContents.send("usb-trigger");
}

function registerGlobalBackquoteShortcut() {
  shortcutRegistered = globalShortcut.register(BACKQUOTE_ACCELERATOR, triggerUsbAction);

  if (!shortcutRegistered) {
    console.error("Kon globalShortcut voor ` niet registreren.");
  }
}

app.whenReady().then(() => {
  createWindow();
  registerGlobalBackquoteShortcut();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("will-quit", () => {
  if (shortcutRegistered) {
    globalShortcut.unregister(BACKQUOTE_ACCELERATOR);
    shortcutRegistered = false;
  }
});
