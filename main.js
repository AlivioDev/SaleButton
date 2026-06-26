const path = require("path");
const {
  app,
  BrowserWindow,
  globalShortcut,
  Menu,
  Tray,
  ipcMain,
  nativeImage,
  dialog
} = require("electron");
const { autoUpdater } = require("electron-updater");

const BACKQUOTE_ACCELERATOR = "`";
const CHANNELS = {
  USB_TRIGGER: "usb-trigger",
  PAUSE_CHANGED: "pause-state-changed",
  GET_PAUSE_STATE: "get-pause-state",
  GET_STARTUP_SETTING: "get-startup-setting",
  SET_STARTUP_SETTING: "set-startup-setting",
  OPEN_SETTINGS: "open-settings",
  CHECK_FOR_UPDATES: "check-for-updates",
  UPDATE_STATUS: "update-status"
};

let mainWindow = null;
let tray = null;
let shortcutRegistered = false;
let isPaused = false;
let isQuitting = false;
let updateListenersRegistered = false;

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

function logUpdateStatus(status, details = {}) {
  const payload = {
    status,
    ...details
  };

  console.log(`[updater] ${status}`, details);

  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  mainWindow.webContents.send(CHANNELS.UPDATE_STATUS, payload);
}

async function askAndDownloadUpdate(updateInfo) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  const message = updateInfo && updateInfo.version
    ? `Versie ${updateInfo.version} is beschikbaar. Nu downloaden en installeren?`
    : "Er is een update beschikbaar. Nu downloaden en installeren?";

  const result = await dialog.showMessageBox(mainWindow, {
    type: "info",
    title: "Update beschikbaar",
    message,
    buttons: ["Nu installeren", "Later"],
    cancelId: 1,
    defaultId: 0,
    noLink: true
  });

  if (result.response === 0) {
    await autoUpdater.downloadUpdate();
  }
}

async function askAndInstallDownloadedUpdate() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  const result = await dialog.showMessageBox(mainWindow, {
    type: "question",
    title: "Update gereed",
    message: "De update is gedownload. Wil je nu herstarten en installeren?",
    buttons: ["Nu installeren", "Later"],
    cancelId: 1,
    defaultId: 0,
    noLink: true
  });

  if (result.response === 0) {
    isQuitting = true;
    autoUpdater.quitAndInstall(false, true);
  }
}

function setupAutoUpdater() {
  if (updateListenersRegistered) {
    return;
  }

  updateListenersRegistered = true;
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;

  autoUpdater.on("checking-for-update", () => {
    logUpdateStatus("checking-for-update");
  });

  autoUpdater.on("update-available", async (info) => {
    logUpdateStatus("update-available", {
      version: info && info.version ? info.version : null
    });

    try {
      await askAndDownloadUpdate(info);
    } catch (error) {
      logUpdateStatus("error", { message: error.message });
    }
  });

  autoUpdater.on("update-not-available", (info) => {
    logUpdateStatus("update-not-available", {
      version: info && info.version ? info.version : null
    });
  });

  autoUpdater.on("download-progress", (progressObj) => {
    logUpdateStatus("download-progress", {
      percent: progressObj && typeof progressObj.percent === "number"
        ? Number(progressObj.percent.toFixed(2))
        : 0
    });
  });

  autoUpdater.on("update-downloaded", async (info) => {
    logUpdateStatus("update-downloaded", {
      version: info && info.version ? info.version : null
    });

    try {
      await askAndInstallDownloadedUpdate();
    } catch (error) {
      logUpdateStatus("error", { message: error.message });
    }
  });

  autoUpdater.on("error", (error) => {
    logUpdateStatus("error", {
      message: error && error.message ? error.message : "Onbekende updatefout."
    });
  });
}

async function checkForUpdates(triggerSource) {
  if (!app.isPackaged) {
    return {
      ok: false,
      message: "Updates werken alleen in de geïnstalleerde productieversie."
    };
  }

  try {
    await autoUpdater.checkForUpdates();
    return {
      ok: true,
      message: `Updatecontrole gestart (${triggerSource}).`
    };
  } catch (error) {
    logUpdateStatus("error", { message: error.message });
    return {
      ok: false,
      message: error.message
    };
  }
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
        {
          label: "Controleer op updates",
          click: async () => {
            openMainWindow();
            await checkForUpdates("menu");
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
    ipcMain.handle(CHANNELS.CHECK_FOR_UPDATES, () => checkForUpdates("button"));

    createAppMenu();
    createWindow();
    try {
      createTray();
    } catch (error) {
      console.error(`Tray kon niet gestart worden: ${error.message}`);
    }
    registerGlobalBackquoteShortcut();

    setupAutoUpdater();

    if (app.isPackaged) {
      // Alleen in echte geïnstalleerde app, niet tijdens npm start.
      checkForUpdates("startup");
    }

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
