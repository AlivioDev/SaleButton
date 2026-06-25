const playButton = document.getElementById("playButton");
const refreshButton = document.getElementById("refreshButton");
const statusText = document.getElementById("status");
const soundPlayer = document.getElementById("soundPlayer");
const modeFixedInput = document.getElementById("modeFixed");
const modeRandomInput = document.getElementById("modeRandom");
const currentModeText = document.getElementById("currentMode");
const currentFixedSoundText = document.getElementById("currentFixedSound");
const soundCountText = document.getElementById("soundCount");
const libraryMessage = document.getElementById("libraryMessage");
const libraryList = document.getElementById("libraryList");
const electronAPI = window.electronAPI;

let removeMainListener = null;
let appState = {
  sounds: [],
  settings: {
    mode: "fixed",
    fixedSound: null
  },
  errors: {
    soundsFolderMissing: false,
    noMp3Found: false,
    fixedSoundMissing: false,
    message: null
  },
  meta: {
    soundCount: 0
  }
};

function hasRequiredElectronAPI() {
  return Boolean(
    electronAPI &&
      typeof electronAPI.getAppState === "function" &&
      typeof electronAPI.refreshSoundLibrary === "function" &&
      typeof electronAPI.playSound === "function" &&
      typeof electronAPI.playCurrentMode === "function" &&
      typeof electronAPI.setMode === "function" &&
      typeof electronAPI.setFixedSound === "function" &&
      typeof electronAPI.onPlaySoundRequested === "function"
  );
}

/**
 * Speelt een lokaal MP3-bestand af uit ./sounds.
 */
function playSound(filename, triggerSource) {
  soundPlayer.src = `./sounds/${encodeURIComponent(filename)}`;
  soundPlayer.currentTime = 0;

  soundPlayer
    .play()
    .then(() => {
      setStatus(`Geluid afgespeeld: ${filename} (via ${triggerSource})`, false);
    })
    .catch((error) => {
      setStatus(`Afspelen mislukt: ${error.message}`, true);
      console.error("Kon geluid niet afspelen:", error);
    });
}

function setStatus(message, isError) {
  statusText.textContent = message;
  statusText.classList.toggle("error", Boolean(isError));
}

async function runApiCall(label, apiCall) {
  try {
    const result = await apiCall();
    if (result === undefined || result === null) {
      throw new Error("Lege respons van main process.");
    }
    return result;
  } catch (error) {
    const message = error && error.message ? error.message : "Onbekende fout.";
    setStatus(`${label} mislukt: ${message}`, true);
    return null;
  }
}

function modeLabel(mode) {
  return mode === "random" ? "Random" : "Vast geluid";
}

function renderSummary() {
  currentModeText.textContent = modeLabel(appState.settings.mode);
  currentFixedSoundText.textContent = appState.settings.fixedSound || "(niet gekozen)";
  soundCountText.textContent = String(appState.meta.soundCount || 0);

  modeFixedInput.checked = appState.settings.mode === "fixed";
  modeRandomInput.checked = appState.settings.mode === "random";
}

function renderLibraryMessage() {
  if (appState.errors.soundsFolderMissing) {
    libraryMessage.textContent = "Fout: map ./sounds bestaat niet.";
    return;
  }

  if (appState.errors.noMp3Found) {
    libraryMessage.textContent = "Fout: geen MP3-bestanden gevonden in ./sounds.";
    return;
  }

  if (appState.errors.fixedSoundMissing) {
    libraryMessage.textContent = `Waarschuwing: vast geluid ontbreekt (${appState.settings.fixedSound}).`;
    return;
  }

  libraryMessage.textContent = `${appState.sounds.length} MP3-bestand(en) gevonden.`;
}

function createSoundCard(filename) {
  const card = document.createElement("article");
  const isFixedSound = appState.settings.fixedSound === filename;

  card.className = `sound-card${isFixedSound ? " is-fixed" : ""}`;

  if (isFixedSound) {
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
  playTestButton.addEventListener("click", async () => {
    const result = await runApiCall("Play/Test", () => electronAPI.playSound(filename));
    if (!result) {
      return;
    }
    if (!result.ok) {
      setStatus(result.error, true);
    }
  });
  actions.appendChild(playTestButton);

  const setFixedButton = document.createElement("button");
  setFixedButton.type = "button";
  setFixedButton.className = "secondary";
  setFixedButton.textContent = "Instellen als vast geluid";
  setFixedButton.addEventListener("click", async () => {
    const result = await runApiCall("Vast geluid instellen", () =>
      electronAPI.setFixedSound(filename)
    );
    if (!result) {
      return;
    }
    if (!result.ok) {
      setStatus(result.error, true);
      return;
    }

    appState = result.state;
    renderUI();
    setStatus(`Vast geluid ingesteld op: ${filename}`, false);
  });
  actions.appendChild(setFixedButton);

  card.appendChild(actions);
  return card;
}

function renderLibrary() {
  libraryList.innerHTML = "";

  if (!appState.sounds.length) {
    return;
  }

  appState.sounds.forEach((filename) => {
    libraryList.appendChild(createSoundCard(filename));
  });
}

function renderUI() {
  renderSummary();
  renderLibraryMessage();
  renderLibrary();
}

async function refreshAppState() {
  const refreshedState = await runApiCall("Vernieuwen", () => electronAPI.refreshSoundLibrary());
  if (!refreshedState) {
    return;
  }
  appState = refreshedState;
  renderUI();
}

function disableInteractiveUI() {
  playButton.disabled = true;
  refreshButton.disabled = true;
  modeFixedInput.disabled = true;
  modeRandomInput.disabled = true;
}

function bindUIEvents() {
  playButton.addEventListener("click", async () => {
    const result = await runApiCall("Test huidige modus", () => electronAPI.playCurrentMode());
    if (!result) {
      return;
    }
    if (!result.ok) {
      setStatus(result.error, true);
    }
  });

  refreshButton.addEventListener("click", async () => {
    await refreshAppState();
    setStatus("Geluidsbibliotheek vernieuwd.", false);
  });

  modeFixedInput.addEventListener("change", async () => {
    if (!modeFixedInput.checked) {
      return;
    }

    const result = await runApiCall("Modus instellen", () => electronAPI.setMode("fixed"));
    if (!result) {
      return;
    }
    if (!result.ok) {
      setStatus(result.error, true);
      return;
    }

    appState = result.state;
    renderUI();
    setStatus("Modus ingesteld op: Vast geluid.", false);
  });

  modeRandomInput.addEventListener("change", async () => {
    if (!modeRandomInput.checked) {
      return;
    }

    const result = await runApiCall("Modus instellen", () => electronAPI.setMode("random"));
    if (!result) {
      return;
    }
    if (!result.ok) {
      setStatus(result.error, true);
      return;
    }

    appState = result.state;
    renderUI();
    setStatus("Modus ingesteld op: Random.", false);
  });

  removeMainListener = electronAPI.onPlaySoundRequested((payload) => {
    if (!payload || !payload.ok) {
      const errorMessage = payload && payload.error ? payload.error : "Onbekende afspeelfout.";
      setStatus(errorMessage, true);
      return;
    }

    const source = payload.source || "main process";
    playSound(payload.filename, source);
  });
}

async function init() {
  setStatus("Initialiseren...", false);

  if (!hasRequiredElectronAPI()) {
    disableInteractiveUI();
    setStatus(
      "Initialisatie mislukt: preload/IPC API niet beschikbaar. Herstart de app volledig.",
      true
    );
    console.error("electronAPI ontbreekt of is onvolledig:", electronAPI);
    return;
  }

  bindUIEvents();
  const initialState = await runApiCall("Initialisatie", () => electronAPI.getAppState());
  if (!initialState) {
    return;
  }
  appState = initialState;
  renderUI();
  setStatus("Klaar.", false);
}

init().catch((error) => {
  setStatus(`Initialisatie mislukt: ${error.message}`, true);
});

window.addEventListener("beforeunload", () => {
  if (typeof removeMainListener === "function") {
    removeMainListener();
    removeMainListener = null;
  }
});
