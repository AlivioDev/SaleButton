const path = require("path");
const { app, BrowserWindow, globalShortcut, Menu, Tray, ipcMain } = require("electron");

const BACKQUOTE_ACCELERATOR = "`";
const CHANNELS = {
  USB_TRIGGER: "usb-trigger",
  PAUSE_CHANGED: "pause-state-changed",
  GET_PAUSE_STATE: "get-pause-state"
};

let mainWindow = null;
let tray = null;
let shortcutRegistered = false;
let isPaused = false;
let isQuitting = false;

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
  mainWindow.on("close", (event) => {
    // Klik op X => verberg naar tray, niet echt afsluiten.
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
  mainWindow.webContents.on("did-finish-load", () => {
    sendPauseStateToRenderer();
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function openMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow();
    return;
  }

  mainWindow.show();
  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }
  mainWindow.focus();
}

function sendPauseStateToRenderer() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  mainWindow.webContents.send(CHANNELS.PAUSE_CHANGED, { isPaused });
}

function buildTrayMenu() {
  const pauseResumeLabel = isPaused ? "Hervatten" : "Pauzeren";

  return Menu.buildFromTemplate([
    {
      label: "Open app",
      click: () => {
        openMainWindow();
      }
    },
    {
      label: pauseResumeLabel,
      click: () => {
        isPaused = !isPaused;
        sendPauseStateToRenderer();
        if (tray) {
          tray.setContextMenu(buildTrayMenu());
        }
      }
    },
    { type: "separator" },
    {
      label: "Sluiten",
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ]);
}

function createTray() {
  const trayIconPath = path.join(__dirname, "assets", "icon.ico");
  tray = new Tray(trayIconPath);
  tray.setToolTip("Sale Button");
  tray.setContextMenu(buildTrayMenu());

  tray.on("double-click", () => {
    openMainWindow();
  });
}

function triggerUsbAction() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  if (isPaused) {
    return;
  }

  // Renderer kiest zelf (vast/random) en speelt geluid af.
  mainWindow.webContents.send(CHANNELS.USB_TRIGGER);
}

function registerGlobalBackquoteShortcut() {
  shortcutRegistered = globalShortcut.register(BACKQUOTE_ACCELERATOR, triggerUsbAction);

  if (!shortcutRegistered) {
    console.error("Kon globalShortcut voor ` niet registreren.");
  }
}

app.whenReady().then(() => {
  createWindow();
  createTray();
  registerGlobalBackquoteShortcut();

  ipcMain.handle(CHANNELS.GET_PAUSE_STATE, () => isPaused);

  app.on("activate", () => {
    openMainWindow();
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
