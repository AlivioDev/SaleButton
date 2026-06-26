const fs = require("fs");
const path = require("path");
const { ipcRenderer } = require("electron");

const playButton = document.getElementById("playButton");
const addMp3Button = document.getElementById("addMp3Button");
const mp3FileInput = document.getElementById("mp3FileInput");
const refreshButton = document.getElementById("refreshButton");
const statusText = document.getElementById("status");
const soundPlayer = document.getElementById("soundPlayer");
const modeFixedInput = document.getElementById("modeFixed");
const modeRandomInput = document.getElementById("modeRandom");
const appStatusText = document.getElementById("appStatus");
const startupToggleInput = document.getElementById("startupToggle");
const startupStateText = document.getElementById("startupState");
const checkUpdatesButton = document.getElementById("checkUpdatesButton");
const updateStatusText = document.getElementById("updateStatusText");
const settingsPanel = document.getElementById("settingsPanel");
const currentModeText = document.getElementById("currentMode");
const currentFixedSoundText = document.getElementById("currentFixedSound");
const soundCountText = document.getElementById("soundCount");
const libraryMessage = document.getElementById("libraryMessage");
const libraryList = document.getElementById("libraryList");

const SOUNDS_DIR = path.join(__dirname, "sounds");
const SETTINGS_PATH = path.join(__dirname, "settings.json");
const DEFAULT_SETTINGS = {
  mode: "fixed",
  fixedSound: null
};

const state = {
  sounds: [],
  mode: "fixed",
  fixedSound: null,
  isPaused: false,
  startupEnabled: false
};

function setStatus(message, isError) {
  statusText.textContent = message;
  statusText.classList.toggle("error", Boolean(isError));
}

function showError(message) {
  setStatus(message, true);
}

function setUpdateStatus(message, isError) {
  updateStatusText.textContent = `Updates: ${message}`;
  updateStatusText.classList.toggle("error", Boolean(isError));
}

function loadSettings() {
  try {
    if (!fs.existsSync(SETTINGS_PATH)) {
      return { ...DEFAULT_SETTINGS };
    }

    const raw = fs.readFileSync(SETTINGS_PATH, "utf8");
    const parsed = JSON.parse(raw);

    return {
      mode: parsed.mode === "random" ? "random" : "fixed",
      fixedSound: typeof parsed.fixedSound === "string" && parsed.fixedSound ? parsed.fixedSound : null
    };
  } catch (error) {
    showError(`Kon settings niet laden: ${error.message}`);
    return { ...DEFAULT_SETTINGS };
  }
}

function saveSettings() {
  try {
    const payload = {
      mode: state.mode,
      fixedSound: state.fixedSound
    };
    fs.writeFileSync(SETTINGS_PATH, JSON.stringify(payload, null, 2), "utf8");
  } catch (error) {
    showError(`Kon settings niet opslaan: ${error.message}`);
  }
}

function loadSoundLibrary() {
  if (!fs.existsSync(SOUNDS_DIR)) {
    state.sounds = [];
    libraryMessage.textContent = "Fout: map ./sounds bestaat niet.";
    return;
  }

  try {
    const items = fs.readdirSync(SOUNDS_DIR);
    state.sounds = items
      .filter((name) => path.extname(name).toLowerCase() === ".mp3")
      .sort((a, b) => a.localeCompare(b));

    if (state.sounds.length === 0) {
      libraryMessage.textContent = "Fout: geen MP3-bestanden gevonden in ./sounds.";
      return;
    }

    if (state.fixedSound && !state.sounds.includes(state.fixedSound)) {
      libraryMessage.textContent = `Fout: gekozen vast geluid bestaat niet meer (${state.fixedSound}).`;
      return;
    }

    libraryMessage.textContent = `${state.sounds.length} MP3-bestand(en) gevonden.`;
  } catch (error) {
    state.sounds = [];
    libraryMessage.textContent = `Fout bij lezen van ./sounds: ${error.message}`;
  }
}

function ensureSoundsDir() {
  if (!fs.existsSync(SOUNDS_DIR)) {
    fs.mkdirSync(SOUNDS_DIR, { recursive: true });
  }
}

function getUniqueTargetPath(fileName) {
  const parsed = path.parse(fileName);
  let index = 0;
  let candidate = path.join(SOUNDS_DIR, fileName);

  while (fs.existsSync(candidate)) {
    index += 1;
    const nextName = `${parsed.name} (${index})${parsed.ext}`;
    candidate = path.join(SOUNDS_DIR, nextName);
  }

  return candidate;
}

async function addSelectedMp3Files() {
  const selectedFiles = Array.from(mp3FileInput.files || []);

  if (selectedFiles.length === 0) {
    return;
  }

  try {
    ensureSoundsDir();

    let copiedCount = 0;

    for (const file of selectedFiles) {
      const sourcePath = file.path;
      const fileName = sourcePath ? path.basename(sourcePath) : file.name;
      const extension = path.extname(fileName).toLowerCase();
      if (extension !== ".mp3") {
        continue;
      }

      const targetPath = getUniqueTargetPath(fileName);

      if (sourcePath) {
        fs.copyFileSync(sourcePath, targetPath);
      } else if (typeof file.arrayBuffer === "function") {
        const arrayBuffer = await file.arrayBuffer();
        fs.writeFileSync(targetPath, Buffer.from(arrayBuffer));
      } else {
        continue;
      }

      copiedCount += 1;
    }

    renderUI();

    if (copiedCount === 0) {
      showError("Geen geldige MP3-bestanden geselecteerd.");
      return;
    }
  } catch (error) {
    showError(`MP3 toevoegen mislukt: ${error.message}`);
  } finally {
    // Leegmaken zodat hetzelfde bestand later opnieuw gekozen kan worden.
    mp3FileInput.value = "";
  }
}

function modeLabel(mode) {
  return mode === "random" ? "Random" : "Vast geluid";
}

function renderAppStatus() {
  if (state.isPaused) {
    appStatusText.textContent = "Gepauzeerd";
    appStatusText.classList.add("paused");
    appStatusText.classList.remove("active");
    return;
  }

  appStatusText.textContent = "Actief";
  appStatusText.classList.add("active");
  appStatusText.classList.remove("paused");
}

function renderSummary() {
  renderAppStatus();
  startupToggleInput.checked = state.startupEnabled;
  startupStateText.textContent = state.startupEnabled ? "Ja" : "Nee";
  currentModeText.textContent = modeLabel(state.mode);
  currentFixedSoundText.textContent = state.fixedSound || "(niet gekozen)";
  soundCountText.textContent = String(state.sounds.length);
  modeFixedInput.checked = state.mode === "fixed";
  modeRandomInput.checked = state.mode === "random";
}

function playSound(filename, source) {
  if (!filename) {
    showError("Geen geluidsbestand gekozen.");
    return;
  }

  soundPlayer.src = `./sounds/${encodeURIComponent(filename)}`;
  soundPlayer.currentTime = 0;

  soundPlayer
    .play()
    .catch((error) => {
      showError(`Afspelen mislukt: ${error.message}`);
    });
}

function getCurrentModeSound() {
  if (!fs.existsSync(SOUNDS_DIR)) {
    showError("Map ./sounds bestaat niet.");
    return null;
  }

  if (state.sounds.length === 0) {
    showError("Geen MP3-bestanden gevonden in ./sounds.");
    return null;
  }

  if (state.mode === "random") {
    const index = Math.floor(Math.random() * state.sounds.length);
    return state.sounds[index];
  }

  if (!state.fixedSound) {
    showError("Er is nog geen vast geluid gekozen.");
    return null;
  }

  if (!state.sounds.includes(state.fixedSound)) {
    showError(`Gekozen vast geluid bestaat niet meer: ${state.fixedSound}`);
    return null;
  }

  return state.fixedSound;
}

function playCurrentModeSound(source, respectPause) {
  if (respectPause && state.isPaused) {
    showError("App staat op pauze. Hervat via tray-menu om USB-knop te gebruiken.");
    return;
  }

  const filename = getCurrentModeSound();
  if (!filename) {
    return;
  }
  playSound(filename, source);
}

function setMode(mode) {
  state.mode = mode === "random" ? "random" : "fixed";
  saveSettings();
  renderSummary();
}

function setFixedSound(filename) {
  if (!state.sounds.includes(filename)) {
    showError(`Geluid niet gevonden: ${filename}`);
    return;
  }

  state.fixedSound = filename;
  saveSettings();
  renderUI();
}

function createSoundCard(filename) {
  const card = document.createElement("article");
  card.className = `sound-card${state.fixedSound === filename ? " is-fixed" : ""}`;

  if (state.fixedSound === filename) {
    const badge = document.createElement("span");
    badge.className = "badge";
    badge.textContent = "Vast geluid";
    card.appendChild(badge);
  }

  const name = document.createElement("p");
  name.className = "sound-name";
  name.textContent = filename;
  card.appendChild(name);

  const actions = document.createElement("div");
  actions.className = "card-actions";

  const playTestButton = document.createElement("button");
  playTestButton.type = "button";
  playTestButton.textContent = "Play/Test";
  playTestButton.addEventListener("click", () => {
    playSound(filename, "Play/Test knop");
  });
  actions.appendChild(playTestButton);

  const setFixedButton = document.createElement("button");
  setFixedButton.type = "button";
  setFixedButton.className = "secondary";
  setFixedButton.textContent = "Instellen als vast geluid";
  setFixedButton.addEventListener("click", () => {
    setFixedSound(filename);
  });
  actions.appendChild(setFixedButton);

  card.appendChild(actions);
  return card;
}

function renderLibrary() {
  libraryList.innerHTML = "";
  state.sounds.forEach((filename) => {
    libraryList.appendChild(createSoundCard(filename));
  });
}

function renderUI() {
  renderSummary();
  loadSoundLibrary();
  renderSummary();
  renderLibrary();
}

playButton.addEventListener("click", () => {
  playCurrentModeSound("Test huidige modus", false);
});

refreshButton.addEventListener("click", () => {
  renderUI();
});

addMp3Button.addEventListener("click", () => {
  mp3FileInput.click();
});

mp3FileInput.addEventListener("change", () => {
  addSelectedMp3Files();
});

modeFixedInput.addEventListener("change", () => {
  if (modeFixedInput.checked) {
    setMode("fixed");
  }
});

modeRandomInput.addEventListener("change", () => {
  if (modeRandomInput.checked) {
    setMode("random");
  }
});

ipcRenderer.on("usb-trigger", () => {
  renderUI();
  playCurrentModeSound("`-toets", true);
});

ipcRenderer.on("pause-state-changed", (_event, payload) => {
  state.isPaused = Boolean(payload && payload.isPaused);
  renderSummary();
});

ipcRenderer.on("open-settings", () => {
  settingsPanel.scrollIntoView({ behavior: "smooth", block: "start" });
  startupToggleInput.focus();
});

ipcRenderer.on("update-status", (_event, payload) => {
  const updateState = payload && payload.status ? payload.status : "unknown";
  const version = payload && payload.version ? ` (v${payload.version})` : "";

  switch (updateState) {
    case "checking-for-update":
      setUpdateStatus("controleert op updates...", false);
      break;
    case "update-available":
      setUpdateStatus(`update beschikbaar${version}. Kies Nu installeren of Later.`, false);
      break;
    case "update-not-available":
      setUpdateStatus("geen update beschikbaar.", false);
      break;
    case "download-progress":
      setUpdateStatus(`downloaden: ${payload.percent || 0}%`, false);
      break;
    case "update-downloaded":
      setUpdateStatus("update gedownload. Bevestig installatie om te herstarten.", false);
      break;
    case "error":
      setUpdateStatus(`fout: ${payload.message || "onbekend"}`, true);
      break;
    default:
      setUpdateStatus("onbekende update-status.", true);
      break;
  }
});

startupToggleInput.addEventListener("change", async () => {
  try {
    const updatedValue = await ipcRenderer.invoke("set-startup-setting", startupToggleInput.checked);
    state.startupEnabled = Boolean(updatedValue);
    renderSummary();
  } catch (error) {
    showError(`Kon opstartinstelling niet aanpassen: ${error.message}`);
    renderSummary();
  }
});

checkUpdatesButton.addEventListener("click", async () => {
  try {
    const result = await ipcRenderer.invoke("check-for-updates");
    if (!result || !result.ok) {
      setUpdateStatus(result && result.message ? result.message : "updatecontrole mislukt.", true);
      return;
    }

    setUpdateStatus("controle gestart...", false);
  } catch (error) {
    setUpdateStatus(`fout: ${error.message}`, true);
  }
});

async function init() {
  const loaded = loadSettings();
  state.mode = loaded.mode;
  state.fixedSound = loaded.fixedSound;

  try {
    const paused = await ipcRenderer.invoke("get-pause-state");
    state.isPaused = Boolean(paused);
  } catch (error) {
    showError(`Kon pauzestatus niet ophalen: ${error.message}`);
  }

  try {
    const startupEnabled = await ipcRenderer.invoke("get-startup-setting");
    state.startupEnabled = Boolean(startupEnabled);
  } catch (error) {
    showError(`Kon opstartinstelling niet ophalen: ${error.message}`);
  }

  renderUI();
  saveSettings();
  setStatus("", false);
  setUpdateStatus("nog niet gecontroleerd.", false);
}

init();
