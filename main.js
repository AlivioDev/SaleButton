const path = require("path");
const { app, BrowserWindow, globalShortcut, Menu, Tray, ipcMain, nativeImage } = require("electron");

const BACKQUOTE_ACCELERATOR = "`";
const CHANNELS = {
  USB_TRIGGER: "usb-trigger",
  PAUSE_CHANGED: "pause-state-changed",
  GET_PAUSE_STATE: "get-pause-state",
  GET_STARTUP_SETTING: "get-startup-setting",
  SET_STARTUP_SETTING: "set-startup-setting",
  OPEN_SETTINGS: "open-settings"
};

let mainWindow = null;
let tray = null;
let shortcutRegistered = false;
let isPaused = false;
let isQuitting = false;

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
}

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

function sendOpenSettingsToRenderer() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  mainWindow.webContents.send(CHANNELS.OPEN_SETTINGS);
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

function getStartupSetting() {
  const loginSettings = app.getLoginItemSettings();
  return Boolean(loginSettings.openAtLogin);
}

function setStartupSetting(enabled) {
  const options = {
    openAtLogin: Boolean(enabled)
  };

  if (process.platform === "win32") {
    options.path = process.execPath;
    options.args = [];
  }

  app.setLoginItemSettings(options);
  return getStartupSetting();
}

function createAppMenu() {
  const template = [
    {
      label: "File",
      submenu: [
        {
          label: "Instellingen",
          click: () => {
            openMainWindow();
            sendOpenSettingsToRenderer();
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
      ]
    }
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
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
  const icoPath = path.join(__dirname, "assets", "Sale Button.ico");
  const pngPath = path.join(__dirname, "assets", "Sale Button.png");
  const preferredPath = process.platform === "win32" ? icoPath : pngPath;
  const fallbackPath = process.platform === "win32" ? pngPath : icoPath;

  let trayIcon = nativeImage.createFromPath(preferredPath);
  if (trayIcon.isEmpty()) {
    trayIcon = nativeImage.createFromPath(fallbackPath);
  }
  if (trayIcon.isEmpty()) {
    throw new Error("Kon geen geldig tray-icoon laden.");
  }

  tray = new Tray(trayIcon);
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

if (hasSingleInstanceLock) {
  app.whenReady().then(() => {
    ipcMain.handle(CHANNELS.GET_PAUSE_STATE, () => isPaused);
    ipcMain.handle(CHANNELS.GET_STARTUP_SETTING, () => getStartupSetting());
    ipcMain.handle(CHANNELS.SET_STARTUP_SETTING, (_event, enabled) => setStartupSetting(enabled));

    createAppMenu();
    createWindow();
    try {
      createTray();
    } catch (error) {
      console.error(`Tray kon niet gestart worden: ${error.message}`);
    }
    registerGlobalBackquoteShortcut();

    app.on("activate", () => {
      openMainWindow();
    });
  });

  app.on("second-instance", () => {
    openMainWindow();
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin" && isQuitting) {
      app.quit();
    }
  });

  app.on("will-quit", () => {
    if (shortcutRegistered) {
      globalShortcut.unregister(BACKQUOTE_ACCELERATOR);
      shortcutRegistered = false;
    }
  });
}
