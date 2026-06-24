const path = require("path");
const { app, BrowserWindow, globalShortcut } = require("electron");
const { IPC_CHANNELS } = require("./ipc-channels");

const BACKQUOTE_ACCELERATOR = "`";
let mainWindow = null;
let shortcutRegistered = false;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 700,
    height: 450,
    webPreferences: {
      // Veilig: renderer krijgt alleen beperkte API via preload.
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js")
    }
  });

  mainWindow.loadFile(path.join(__dirname, "index.html"));
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function triggerRendererSound(source) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  mainWindow.webContents.send(IPC_CHANNELS.PLAY_SOUND, { source });
}

function registerGlobalBackquoteShortcut() {
  shortcutRegistered = globalShortcut.register(BACKQUOTE_ACCELERATOR, () => {
    triggerRendererSound("globalShortcut (`)");
  });

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
