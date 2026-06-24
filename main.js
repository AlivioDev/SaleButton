const path = require("path");
const fs = require("fs");
const { app, BrowserWindow, globalShortcut, ipcMain } = require("electron");
const { IPC_CHANNELS } = require("./ipc-channels");

const BACKQUOTE_ACCELERATOR = "`";
const SOUNDS_DIR = path.join(__dirname, "sounds");
const SETTINGS_PATH = path.join(__dirname, "settings.json");
const DEFAULT_SETTINGS = {
  mode: "fixed",
  fixedSound: null
};

let mainWindow = null;
let shortcutRegistered = false;
let settings = { ...DEFAULT_SETTINGS };

function safeIpcResult(handler) {
  try {
    return handler();
  } catch (error) {
    return {
      ok: false,
      error: error && error.message ? error.message : "Onbekende IPC-fout."
    };
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 700,
    height: 450,
    webPreferences: {
      // Veilig: renderer krijgt alleen beperkte API via preload.
      nodeIntegration: false,
      contextIsolation: true,
      // In sommige Windows omgevingen voorkomt dit preload-initialisatieproblemen.
      sandbox: false,
      preload: path.join(__dirname, "preload.js")
    }
  });

  mainWindow.loadFile(path.join(__dirname, "index.html"));
  mainWindow.webContents.on("preload-error", (_event, preloadPath, error) => {
    console.error(`Preload-fout in ${preloadPath}:`, error);
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function loadSoundLibrary() {
  try {
    const entries = fs.readdirSync(SOUNDS_DIR, { withFileTypes: true });
    const sounds = entries
      .filter((entry) => entry.isFile() && path.extname(entry.name).toLowerCase() === ".mp3")
      .map((entry) => entry.name)
      .sort((a, b) => a.localeCompare(b));

    return { sounds, error: null };
  } catch (error) {
    if (error.code === "ENOENT") {
      return { sounds: [], error: "Map ./sounds bestaat niet." };
    }

    return { sounds: [], error: `Kon ./sounds niet lezen: ${error.message}` };
  }
}

function loadSettings() {
  try {
    if (!fs.existsSync(SETTINGS_PATH)) {
      return { ...DEFAULT_SETTINGS };
    }

    const raw = fs.readFileSync(SETTINGS_PATH, "utf8");
    const parsed = JSON.parse(raw);

    return {
      mode: parsed && (parsed.mode === "fixed" || parsed.mode === "random") ? parsed.mode : "fixed",
      fixedSound:
        parsed && typeof parsed.fixedSound === "string" && parsed.fixedSound.trim() !== ""
          ? parsed.fixedSound
          : null
    };
  } catch (error) {
    console.error("Kon settings.json niet laden:", error);
    return { ...DEFAULT_SETTINGS };
  }
}

function saveSettings() {
  try {
    fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2), "utf8");
  } catch (error) {
    console.error("Kon settings.json niet opslaan:", error);
  }
}

function buildAppState() {
  const { sounds, error } = loadSoundLibrary();
  const fixedSoundMissing = Boolean(settings.fixedSound) && !sounds.includes(settings.fixedSound);

  return {
    sounds,
    settings: { ...settings },
    meta: {
      soundCount: sounds.length
    },
    errors: {
      soundsFolderMissing: error === "Map ./sounds bestaat niet.",
      noMp3Found: !error && sounds.length === 0,
      fixedSoundMissing,
      message:
        error ||
        (!error && sounds.length === 0 ? "Geen MP3-bestanden gevonden in ./sounds." : null) ||
        (fixedSoundMissing
          ? `Gekozen vast geluid bestaat niet meer: ${settings.fixedSound}`
          : null)
    }
  };
}

function triggerRendererSound(filename, source) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return { ok: false, error: "Geen actief app-venster om geluid af te spelen." };
  }

  mainWindow.webContents.send(IPC_CHANNELS.PLAY_SOUND, {
    ok: true,
    filename,
    source
  });

  return { ok: true };
}

function sendPlaybackError(errorMessage, source) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  mainWindow.webContents.send(IPC_CHANNELS.PLAY_SOUND, {
    ok: false,
    error: errorMessage,
    source
  });
}

function playSound(filename, source = "onbekend") {
  const state = buildAppState();

  if (state.errors.soundsFolderMissing) {
    return { ok: false, error: "Map ./sounds bestaat niet." };
  }

  if (state.errors.noMp3Found) {
    return { ok: false, error: "Geen MP3-bestanden gevonden in ./sounds." };
  }

  if (!filename || !state.sounds.includes(filename)) {
    return { ok: false, error: `Geluid niet gevonden: ${filename || "(leeg)"}` };
  }

  return triggerRendererSound(filename, source);
}

function setMode(mode) {
  if (mode !== "fixed" && mode !== "random") {
    return { ok: false, error: `Ongeldige modus: ${mode}` };
  }

  settings.mode = mode;
  saveSettings();
  return { ok: true, state: buildAppState() };
}

function setFixedSound(filename) {
  const state = buildAppState();

  if (!filename || !state.sounds.includes(filename)) {
    return { ok: false, error: `Geluid niet gevonden: ${filename || "(leeg)"}` };
  }

  settings.fixedSound = filename;
  saveSettings();
  return { ok: true, state: buildAppState() };
}

function resolveSoundForCurrentMode() {
  const state = buildAppState();

  if (state.errors.soundsFolderMissing) {
    return { ok: false, error: "Map ./sounds bestaat niet." };
  }

  if (state.errors.noMp3Found) {
    return { ok: false, error: "Geen MP3-bestanden gevonden in ./sounds." };
  }

  if (settings.mode === "random") {
    const randomIndex = Math.floor(Math.random() * state.sounds.length);
    return { ok: true, filename: state.sounds[randomIndex] };
  }

  if (!settings.fixedSound) {
    return { ok: false, error: "Er is nog geen vast geluid gekozen." };
  }

  if (!state.sounds.includes(settings.fixedSound)) {
    return { ok: false, error: `Gekozen vast geluid bestaat niet meer: ${settings.fixedSound}` };
  }

  return { ok: true, filename: settings.fixedSound };
}

function playCurrentModeSound(source) {
  const resolved = resolveSoundForCurrentMode();
  if (!resolved.ok) {
    sendPlaybackError(resolved.error, source);
    return resolved;
  }

  const result = playSound(resolved.filename, source);
  if (!result.ok) {
    sendPlaybackError(result.error, source);
  }
  return result;
}

function registerIpcHandlers() {
  const handlerMap = {
    [IPC_CHANNELS.GET_APP_STATE]: () => buildAppState(),
    [IPC_CHANNELS.REFRESH_SOUND_LIBRARY]: () => buildAppState(),
    [IPC_CHANNELS.PLAY_SOUND]: (filename) => {
      const result = playSound(filename, "UI testknop");
      if (!result.ok) {
        sendPlaybackError(result.error, "UI testknop");
      }
      return result;
    },
    [IPC_CHANNELS.PLAY_CURRENT_MODE]: () => playCurrentModeSound("UI modus-test"),
    [IPC_CHANNELS.SET_MODE]: (mode) => setMode(mode),
    [IPC_CHANNELS.SET_FIXED_SOUND]: (filename) => setFixedSound(filename)
  };

  Object.entries(handlerMap).forEach(([channel, channelHandler]) => {
    ipcMain.removeHandler(channel);
    ipcMain.handle(channel, (_event, ...args) => safeIpcResult(() => channelHandler(...args)));

    const syncChannel = `${channel}:sync`;
    ipcMain.removeAllListeners(syncChannel);
    ipcMain.on(syncChannel, (event, ...args) => {
      event.returnValue = safeIpcResult(() => channelHandler(...args));
    });
  });
}

function registerGlobalBackquoteShortcut() {
  shortcutRegistered = globalShortcut.register(BACKQUOTE_ACCELERATOR, () => {
    playCurrentModeSound("globalShortcut (`)");
  });

  if (!shortcutRegistered) {
    console.error("Kon globalShortcut voor ` niet registreren.");
  }
}

app.whenReady().then(() => {
  settings = loadSettings();
  saveSettings();

  registerIpcHandlers();
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
