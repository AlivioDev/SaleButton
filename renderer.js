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
  isPaused: false
};

function setStatus(message, isError) {
  statusText.textContent = message;
  statusText.classList.toggle("error", Boolean(isError));
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
    setStatus(`Kon settings niet laden: ${error.message}`, true);
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
    setStatus(`Kon settings niet opslaan: ${error.message}`, true);
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
      setStatus("Geen geldige MP3-bestanden geselecteerd.", true);
      return;
    }

    setStatus(`${copiedCount} MP3-bestand(en) toegevoegd aan ./sounds.`, false);
  } catch (error) {
    setStatus(`MP3 toevoegen mislukt: ${error.message}`, true);
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
  currentModeText.textContent = modeLabel(state.mode);
  currentFixedSoundText.textContent = state.fixedSound || "(niet gekozen)";
  soundCountText.textContent = String(state.sounds.length);
  modeFixedInput.checked = state.mode === "fixed";
  modeRandomInput.checked = state.mode === "random";
}

function playSound(filename, source) {
  if (!filename) {
    setStatus("Geen geluidsbestand gekozen.", true);
    return;
  }

  soundPlayer.src = `./sounds/${encodeURIComponent(filename)}`;
  soundPlayer.currentTime = 0;

  soundPlayer
    .play()
    .then(() => {
      setStatus(`Geluid afgespeeld: ${filename} (via ${source})`, false);
    })
    .catch((error) => {
      setStatus(`Afspelen mislukt: ${error.message}`, true);
    });
}

function getCurrentModeSound() {
  if (!fs.existsSync(SOUNDS_DIR)) {
    setStatus("Map ./sounds bestaat niet.", true);
    return null;
  }

  if (state.sounds.length === 0) {
    setStatus("Geen MP3-bestanden gevonden in ./sounds.", true);
    return null;
  }

  if (state.mode === "random") {
    const index = Math.floor(Math.random() * state.sounds.length);
    return state.sounds[index];
  }

  if (!state.fixedSound) {
    setStatus("Er is nog geen vast geluid gekozen.", true);
    return null;
  }

  if (!state.sounds.includes(state.fixedSound)) {
    setStatus(`Gekozen vast geluid bestaat niet meer: ${state.fixedSound}`, true);
    return null;
  }

  return state.fixedSound;
}

function playCurrentModeSound(source, respectPause) {
  if (respectPause && state.isPaused) {
    setStatus("App staat op pauze. Hervat via het tray-menu om USB-trigger te gebruiken.", true);
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
  setStatus(`Modus ingesteld op: ${modeLabel(state.mode)}.`, false);
}

function setFixedSound(filename) {
  if (!state.sounds.includes(filename)) {
    setStatus(`Geluid niet gevonden: ${filename}`, true);
    return;
  }

  state.fixedSound = filename;
  saveSettings();
  renderUI();
  setStatus(`Vast geluid ingesteld op: ${filename}`, false);
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
  setStatus("Geluidsbibliotheek vernieuwd.", false);
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

async function init() {
  const loaded = loadSettings();
  state.mode = loaded.mode;
  state.fixedSound = loaded.fixedSound;

  try {
    const paused = await ipcRenderer.invoke("get-pause-state");
    state.isPaused = Boolean(paused);
  } catch (error) {
    setStatus(`Kon pauzestatus niet ophalen: ${error.message}`, true);
  }

  renderUI();
  saveSettings();
  setStatus("Klaar.", false);
}

init();
