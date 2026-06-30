const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");
const {
  app,
  BrowserWindow,
  globalShortcut,
  Menu,
  Tray,
  ipcMain,
  nativeImage,
  dialog,
  shell
} = require("electron");
const { autoUpdater } = require("electron-updater");

const BACKQUOTE_ACCELERATOR = "`";

const CHANNELS = {
  PLAY_SOUND: "play-sound",
  PAUSE_CHANGED: "pause-state-changed",
  UPDATE_STATUS: "update-status",
  GET_APP_STATE: "get-app-state",
  REFRESH_SOUNDS: "refresh-sounds",
  PLAY_CURRENT_MODE: "play-current-mode",
  PLAY_SPECIFIC_SOUND: "play-specific-sound",
  SET_MODE: "set-mode",
  SET_FIXED_SOUND: "set-fixed-sound",
  ADD_SOUND_FILES: "add-sound-files",
  DELETE_SOUND: "delete-sound",
  OPEN_USER_SOUNDS_FOLDER: "open-user-sounds-folder",
  GET_STARTUP_SETTING: "get-startup-setting",
  SET_STARTUP_SETTING: "set-startup-setting",
  CHECK_FOR_UPDATES: "check-for-updates",
  GET_UPDATE_STATE: "get-update-state",
  INSTALL_DOWNLOADED_UPDATE: "install-downloaded-update"
};

const DEFAULT_SETTINGS = {
  mode: "fixed",
  fixedSound: null
};

let mainWindow = null;
let settingsWindow = null;
let tray = null;
let shortcutRegistered = false;
let isPaused = false;
let isQuitting = false;
let updateListenersRegistered = false;
let updateReadyToInstall = false;

let settings = { ...DEFAULT_SETTINGS };
let updateState = {
  status: "idle",
  message: "nog niet gecontroleerd.",
  version: null,
  percent: 0
};

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
}

function getDefaultSoundsDir() {
  return path.join(app.getAppPath(), "default-sounds");
}

function getUserSoundsDir() {
  return path.join(app.getPath("userData"), "sounds");
}

function getSettingsPath() {
  return path.join(app.getPath("userData"), "settings.json");
}

function ensureUserSoundsInitialized() {
  const userDir = getUserSoundsDir();
  if (fs.existsSync(userDir)) {
    return;
  }

  fs.mkdirSync(userDir, { recursive: true });

  const defaultDir = getDefaultSoundsDir();
  if (!fs.existsSync(defaultDir)) {
    return;
  }

  const files = fs
    .readdirSync(defaultDir)
    .filter((fileName) => path.extname(fileName).toLowerCase() === ".mp3");

  files.forEach((fileName) => {
    const source = path.join(defaultDir, fileName);
    const target = path.join(userDir, fileName);
    if (!fs.existsSync(target)) {
      fs.copyFileSync(source, target);
    }
  });
}

function loadSettings() {
  try {
    const settingsPath = getSettingsPath();
    if (!fs.existsSync(settingsPath)) {
      return { ...DEFAULT_SETTINGS };
    }

    const parsed = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
    return {
      mode: parsed && parsed.mode === "random" ? "random" : "fixed",
      fixedSound:
        parsed && typeof parsed.fixedSound === "string" && parsed.fixedSound.trim() !== ""
          ? parsed.fixedSound
          : null
    };
  } catch (error) {
    console.error("Kon settings niet laden:", error.message);
    return { ...DEFAULT_SETTINGS };
  }
}

function saveSettings() {
  try {
    fs.writeFileSync(getSettingsPath(), JSON.stringify(settings, null, 2), "utf8");
  } catch (error) {
    console.error("Kon settings niet opslaan:", error.message);
  }
}

function listUserSounds() {
  const userDir = getUserSoundsDir();
  if (!fs.existsSync(userDir)) {
    return [];
  }

  return fs
    .readdirSync(userDir)
    .filter((fileName) => path.extname(fileName).toLowerCase() === ".mp3")
    .sort((a, b) => a.localeCompare(b));
}

function buildAppState() {
  const sounds = listUserSounds();
  const fixedSoundMissing = Boolean(settings.fixedSound) && !sounds.includes(settings.fixedSound);

  return {
    sounds,
    mode: settings.mode,
    fixedSound: settings.fixedSound,
    isPaused,
    userSoundsPath: getUserSoundsDir(),
    fixedSoundMissing
  };
}

function applyUniqueFileName(fileName) {
  const userDir = getUserSoundsDir();
  const parsed = path.parse(fileName);
  let candidate = path.join(userDir, fileName);
  let index = 0;

  while (fs.existsSync(candidate)) {
    index += 1;
    candidate = path.join(userDir, `${parsed.name} (${index})${parsed.ext}`);
  }

  return candidate;
}

function sendPauseStateToMainRenderer() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  mainWindow.webContents.send(CHANNELS.PAUSE_CHANGED, { isPaused });
}

function sendUpdateStateToSettingsWindow() {
  if (!settingsWindow || settingsWindow.isDestroyed()) {
    return;
  }

  settingsWindow.webContents.send(CHANNELS.UPDATE_STATUS, { ...updateState });
}

function setUpdateState(status, message, extra = {}) {
  updateState = {
    status,
    message,
    version: extra.version || null,
    percent: typeof extra.percent === "number" ? extra.percent : 0
  };

  console.log(`[updater] ${status}`, updateState);
  sendUpdateStateToSettingsWindow();
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 980,
    height: 760,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  mainWindow.loadFile(path.join(__dirname, "index.html"));
  mainWindow.on("close", (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
  mainWindow.webContents.on("did-finish-load", () => {
    sendPauseStateToMainRenderer();
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function openMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createMainWindow();
    return;
  }

  mainWindow.show();
  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }
  mainWindow.focus();
}

function openSettingsWindow(section = "general") {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.show();
    settingsWindow.focus();
    return;
  }

  settingsWindow = new BrowserWindow({
    width: 540,
    height: 420,
    parent: mainWindow || undefined,
    modal: false,
    resizable: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  settingsWindow.loadFile(path.join(__dirname, "settings.html"), {
    query: { section }
  });

  settingsWindow.webContents.on("did-finish-load", () => {
    sendUpdateStateToSettingsWindow();
  });

  settingsWindow.on("closed", () => {
    settingsWindow = null;
  });
}

function buildTrayMenu() {
  return Menu.buildFromTemplate([
    {
      label: "Open app",
      click: () => {
        openMainWindow();
      }
    },
    {
      label: isPaused ? "Hervatten" : "Pauzeren",
      click: () => {
        isPaused = !isPaused;
        sendPauseStateToMainRenderer();
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
  tray.on("double-click", () => openMainWindow());
}

function resolveSoundForMode(respectPause) {
  const appState = buildAppState();

  if (respectPause && appState.isPaused) {
    return { ok: false, error: "App staat op pauze." };
  }

  if (appState.sounds.length === 0) {
    return { ok: false, error: "Geen MP3-bestanden gevonden in de gebruikersmap." };
  }

  if (appState.mode === "random") {
    const index = Math.floor(Math.random() * appState.sounds.length);
    return { ok: true, filename: appState.sounds[index] };
  }

  if (!appState.fixedSound) {
    return { ok: false, error: "Er is nog geen vast geluid gekozen." };
  }

  if (!appState.sounds.includes(appState.fixedSound)) {
    return { ok: false, error: `Vast geluid bestaat niet meer: ${appState.fixedSound}` };
  }

  return { ok: true, filename: appState.fixedSound };
}

function sendPlaySoundToRenderer(filename, source) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return { ok: false, error: "Appvenster is niet beschikbaar." };
  }

  const soundPath = path.join(getUserSoundsDir(), filename);
  if (!fs.existsSync(soundPath)) {
    return { ok: false, error: `Geluid niet gevonden: ${filename}` };
  }

  mainWindow.webContents.send(CHANNELS.PLAY_SOUND, {
    filename,
    source,
    fileUrl: pathToFileURL(soundPath).toString()
  });

  return { ok: true };
}

function triggerUsbAction() {
  const resolved = resolveSoundForMode(true);
  if (!resolved.ok) {
    return;
  }

  sendPlaySoundToRenderer(resolved.filename, "`-toets");
}

function registerGlobalBackquoteShortcut() {
  shortcutRegistered = globalShortcut.register(BACKQUOTE_ACCELERATOR, triggerUsbAction);
  if (!shortcutRegistered) {
    console.error("Kon globalShortcut voor ` niet registreren.");
  }
}

function getStartupSetting() {
  return Boolean(app.getLoginItemSettings().openAtLogin);
}

function setStartupSetting(enabled) {
  const options = { openAtLogin: Boolean(enabled) };
  if (process.platform === "win32") {
    options.path = process.execPath;
    options.args = [];
  }

  app.setLoginItemSettings(options);
  return getStartupSetting();
}

async function askDownloadUpdate(version) {
  const targetWindow = settingsWindow || mainWindow;
  if (!targetWindow || targetWindow.isDestroyed()) {
    return false;
  }

  const result = await dialog.showMessageBox(targetWindow, {
    type: "info",
    title: "Update beschikbaar",
    message: `Versie ${version || "nieuw"} is beschikbaar.`,
    detail: "Wil je deze update nu downloaden en installeren?",
    buttons: ["Nu installeren", "Later"],
    defaultId: 0,
    cancelId: 1,
    noLink: true
  });

  return result.response === 0;
}

async function askInstallDownloadedUpdate(version) {
  const targetWindow = settingsWindow || mainWindow;
  if (!targetWindow || targetWindow.isDestroyed()) {
    return false;
  }

  const result = await dialog.showMessageBox(targetWindow, {
    type: "question",
    title: "Update gedownload",
    message: `Versie ${version || "nieuw"} is gedownload.`,
    detail: "Wil je nu herstarten en installeren?",
    buttons: ["Nu installeren", "Later"],
    defaultId: 0,
    cancelId: 1,
    noLink: true
  });

  return result.response === 0;
}

function setupAutoUpdater() {
  if (updateListenersRegistered) {
    return;
  }

  updateListenersRegistered = true;
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;

  autoUpdater.on("checking-for-update", () => {
    setUpdateState("checking-for-update", "controleert op updates...");
  });

  autoUpdater.on("update-available", async (info) => {
    const version = info && info.version ? info.version : null;
    setUpdateState("update-available", "update beschikbaar.", { version });

    try {
      const shouldDownload = await askDownloadUpdate(version);
      if (!shouldDownload) {
        setUpdateState("update-available", "update uitgesteld.", { version });
        return;
      }

      await autoUpdater.downloadUpdate();
    } catch (error) {
      setUpdateState("error", error.message || "Fout bij update download.");
    }
  });

  autoUpdater.on("update-not-available", () => {
    setUpdateState("update-not-available", "geen update beschikbaar.");
  });

  autoUpdater.on("download-progress", (progressObj) => {
    const percent =
      progressObj && typeof progressObj.percent === "number"
        ? Number(progressObj.percent.toFixed(2))
        : 0;
    setUpdateState("download-progress", `downloaden: ${percent}%`, { percent });
  });

  autoUpdater.on("update-downloaded", async (info) => {
    const version = info && info.version ? info.version : null;
    updateReadyToInstall = true;
    setUpdateState("update-downloaded", "update gedownload.", { version });

    try {
      const shouldInstall = await askInstallDownloadedUpdate(version);
      if (!shouldInstall) {
        setUpdateState("update-downloaded", "update klaar, installatie uitgesteld.", { version });
        return;
      }

      isQuitting = true;
      autoUpdater.quitAndInstall(false, true);
    } catch (error) {
      setUpdateState("error", error.message || "Fout bij update-installatie.");
    }
  });

  autoUpdater.on("error", (error) => {
    setUpdateState("error", error && error.message ? error.message : "Onbekende updatefout.");
  });
}

async function checkForUpdates(triggerSource) {
  if (!app.isPackaged) {
    setUpdateState("error", "Updates werken alleen in de geïnstalleerde productieversie.");
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
    setUpdateState("error", error.message || "Updatecontrole mislukt.");
    return {
      ok: false,
      message: error.message || "Updatecontrole mislukt."
    };
  }
}

function installDownloadedUpdate() {
  if (!updateReadyToInstall) {
    return { ok: false, message: "Er is nog geen gedownloade update beschikbaar." };
  }

  isQuitting = true;
  autoUpdater.quitAndInstall(false, true);
  return { ok: true };
}

function createApplicationMenu() {
  const template = [
    {
      label: "File",
      submenu: [
        {
          label: "Open app",
          click: () => {
            openMainWindow();
          }
        },
        {
          label: "Instellingen",
          click: () => {
            openSettingsWindow("general");
          }
        },
        {
          label: "Controleer op updates",
          click: async () => {
            openSettingsWindow("updates");
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

function registerIpcHandlers() {
  ipcMain.handle(CHANNELS.GET_APP_STATE, () => buildAppState());
  ipcMain.handle(CHANNELS.REFRESH_SOUNDS, () => buildAppState());

  ipcMain.handle(CHANNELS.PLAY_CURRENT_MODE, () => {
    const resolved = resolveSoundForMode(false);
    if (!resolved.ok) {
      return resolved;
    }
    return sendPlaySoundToRenderer(resolved.filename, "Test huidige modus");
  });

  ipcMain.handle(CHANNELS.PLAY_SPECIFIC_SOUND, (_event, filename) => {
    return sendPlaySoundToRenderer(filename, "Play/Test knop");
  });

  ipcMain.handle(CHANNELS.SET_MODE, (_event, mode) => {
    if (mode !== "fixed" && mode !== "random") {
      return { ok: false, error: "Ongeldige modus." };
    }

    settings.mode = mode;
    saveSettings();
    return { ok: true, state: buildAppState() };
  });

  ipcMain.handle(CHANNELS.SET_FIXED_SOUND, (_event, filename) => {
    const sounds = listUserSounds();
    if (!sounds.includes(filename)) {
      return { ok: false, error: "Geluid niet gevonden." };
    }

    settings.fixedSound = filename;
    saveSettings();
    return { ok: true, state: buildAppState() };
  });

  ipcMain.handle(CHANNELS.ADD_SOUND_FILES, (_event, filePaths) => {
    if (!Array.isArray(filePaths)) {
      return { ok: false, error: "Ongeldige bestandslijst." };
    }

    let copiedCount = 0;
    filePaths.forEach((sourcePath) => {
      if (!sourcePath || path.extname(sourcePath).toLowerCase() !== ".mp3") {
        return;
      }

      if (!fs.existsSync(sourcePath)) {
        return;
      }

      const targetPath = applyUniqueFileName(path.basename(sourcePath));
      fs.copyFileSync(sourcePath, targetPath);
      copiedCount += 1;
    });

    return { ok: true, copiedCount, state: buildAppState() };
  });

  ipcMain.handle(CHANNELS.DELETE_SOUND, async (_event, filename) => {
    const sounds = listUserSounds();
    if (!sounds.includes(filename)) {
      return { ok: false, error: "Geluid niet gevonden." };
    }

    const targetWindow = mainWindow || settingsWindow;
    if (!targetWindow || targetWindow.isDestroyed()) {
      return { ok: false, error: "Geen actief venster beschikbaar." };
    }

    const confirmation = await dialog.showMessageBox(targetWindow, {
      type: "question",
      title: "Geluid verwijderen",
      message: `Weet je zeker dat je "${filename}" wilt verwijderen?`,
      buttons: ["Verwijderen", "Annuleren"],
      defaultId: 1,
      cancelId: 1,
      noLink: true
    });

    if (confirmation.response !== 0) {
      return { ok: true, cancelled: true, state: buildAppState() };
    }

    fs.unlinkSync(path.join(getUserSoundsDir(), filename));

    let fixedSoundReset = false;
    if (settings.fixedSound === filename) {
      settings.fixedSound = null;
      saveSettings();
      fixedSoundReset = true;
    }

    return {
      ok: true,
      cancelled: false,
      fixedSoundReset,
      state: buildAppState()
    };
  });

  ipcMain.handle(CHANNELS.OPEN_USER_SOUNDS_FOLDER, async () => {
    const result = await shell.openPath(getUserSoundsDir());
    if (result) {
      return { ok: false, error: result };
    }
    return { ok: true };
  });

  ipcMain.handle(CHANNELS.GET_STARTUP_SETTING, () => getStartupSetting());
  ipcMain.handle(CHANNELS.SET_STARTUP_SETTING, (_event, enabled) => setStartupSetting(enabled));
  ipcMain.handle(CHANNELS.CHECK_FOR_UPDATES, () => checkForUpdates("settings"));
  ipcMain.handle(CHANNELS.GET_UPDATE_STATE, () => ({ ...updateState, readyToInstall: updateReadyToInstall }));
  ipcMain.handle(CHANNELS.INSTALL_DOWNLOADED_UPDATE, () => installDownloadedUpdate());
}

if (hasSingleInstanceLock) {
  app.whenReady().then(() => {
    ensureUserSoundsInitialized();
    settings = loadSettings();
    saveSettings();

    registerIpcHandlers();
    createApplicationMenu();
    createMainWindow();
    registerGlobalBackquoteShortcut();
    setupAutoUpdater();

    try {
      createTray();
    } catch (error) {
      console.error(`Tray kon niet gestart worden: ${error.message}`);
    }

    if (app.isPackaged) {
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
