const playButton = document.getElementById("playButton");
const addMp3Button = document.getElementById("addMp3Button");
const mp3FileInput = document.getElementById("mp3FileInput");
const refreshButton = document.getElementById("refreshButton");
const openSoundsFolderButton = document.getElementById("openSoundsFolderButton");
const statusText = document.getElementById("status");
const soundPlayer = document.getElementById("soundPlayer");
const modeFixedInput = document.getElementById("modeFixed");
const modeRandomInput = document.getElementById("modeRandom");
const appStatusText = document.getElementById("appStatus");
const currentModeText = document.getElementById("currentMode");
const currentFixedSoundText = document.getElementById("currentFixedSound");
const soundCountText = document.getElementById("soundCount");
const userSoundsPathText = document.getElementById("userSoundsPath");
const libraryMessage = document.getElementById("libraryMessage");
const libraryList = document.getElementById("libraryList");

const state = {
  sounds: [],
  mode: "fixed",
  fixedSound: null,
  isPaused: false,
  userSoundsPath: "",
  fixedSoundMissing: false
};

function showError(message) {
  statusText.textContent = message;
  statusText.classList.add("error");
}

function clearStatus() {
  statusText.textContent = "";
  statusText.classList.remove("error");
}

function applyAppState(appState) {
  state.sounds = Array.isArray(appState.sounds) ? appState.sounds : [];
  state.mode = appState.mode === "random" ? "random" : "fixed";
  state.fixedSound = appState.fixedSound || null;
  state.isPaused = Boolean(appState.isPaused);
  state.userSoundsPath = appState.userSoundsPath || "";
  state.fixedSoundMissing = Boolean(appState.fixedSoundMissing);
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
  currentModeText.textContent = state.mode === "random" ? "Random" : "Vast geluid";
  currentFixedSoundText.textContent = state.fixedSound || "(niet gekozen)";
  soundCountText.textContent = String(state.sounds.length);
  userSoundsPathText.textContent = state.userSoundsPath || "-";

  modeFixedInput.checked = state.mode === "fixed";
  modeRandomInput.checked = state.mode === "random";
}

function renderLibraryMessage() {
  if (state.fixedSoundMissing) {
    libraryMessage.textContent = "Het eerder gekozen vaste geluid bestaat niet meer.";
    return;
  }

  if (state.sounds.length === 0) {
    libraryMessage.textContent = "Geen MP3-bestanden gevonden in de gebruikers-geluidsmap.";
    return;
  }

  libraryMessage.textContent = `${state.sounds.length} MP3-bestand(en) gevonden.`;
}

function playAudioFromPayload(payload) {
  if (!payload || !payload.fileUrl) {
    showError("Afspelen mislukt: geen geldig geluidsbestand.");
    return;
  }

  soundPlayer.src = payload.fileUrl;
  soundPlayer.currentTime = 0;
  soundPlayer.play().catch((error) => {
    showError(`Afspelen mislukt: ${error.message}`);
  });
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

  const playButtonElement = document.createElement("button");
  playButtonElement.type = "button";
  playButtonElement.textContent = "Play/Test";
  playButtonElement.addEventListener("click", async () => {
    const result = await window.appAPI.playSpecificSound(filename);
    if (!result.ok) {
      showError(result.error || "Afspelen mislukt.");
      return;
    }
    clearStatus();
  });
  actions.appendChild(playButtonElement);

  const setFixedButton = document.createElement("button");
  setFixedButton.type = "button";
  setFixedButton.className = "secondary";
  setFixedButton.textContent = "Instellen als vast geluid";
  setFixedButton.addEventListener("click", async () => {
    const result = await window.appAPI.setFixedSound(filename);
    if (!result.ok) {
      showError(result.error || "Instellen vast geluid mislukt.");
      return;
    }
    applyAppState(result.state);
    renderUI();
    clearStatus();
  });
  actions.appendChild(setFixedButton);

  const deleteButton = document.createElement("button");
  deleteButton.type = "button";
  deleteButton.className = "secondary";
  deleteButton.textContent = "Verwijderen";
  deleteButton.addEventListener("click", async () => {
    const result = await window.appAPI.deleteSound(filename);
    if (!result.ok) {
      showError(result.error || "Verwijderen mislukt.");
      return;
    }
    if (result.cancelled) {
      return;
    }
    applyAppState(result.state);
    renderUI();
    clearStatus();
  });
  actions.appendChild(deleteButton);

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
  renderLibraryMessage();
  renderLibrary();
}

async function refreshState() {
  const appState = await window.appAPI.getAppState();
  applyAppState(appState);
  renderUI();
}

playButton.addEventListener("click", async () => {
  const result = await window.appAPI.playCurrentMode();
  if (!result.ok) {
    showError(result.error || "Afspelen mislukt.");
    return;
  }
  clearStatus();
});

refreshButton.addEventListener("click", async () => {
  await refreshState();
  clearStatus();
});

openSoundsFolderButton.addEventListener("click", async () => {
  const result = await window.appAPI.openUserSoundsFolder();
  if (!result.ok) {
    showError(result.error || "Kon geluidsmap niet openen.");
    return;
  }
  clearStatus();
});

addMp3Button.addEventListener("click", () => {
  mp3FileInput.click();
});

mp3FileInput.addEventListener("change", async () => {
  const filePaths = Array.from(mp3FileInput.files || [])
    .map((file) => file.path)
    .filter((filePath) => Boolean(filePath));

  if (filePaths.length === 0) {
    return;
  }

  const result = await window.appAPI.addSoundFiles(filePaths);
  mp3FileInput.value = "";

  if (!result.ok) {
    showError(result.error || "Toevoegen van MP3-bestanden mislukt.");
    return;
  }

  applyAppState(result.state);
  renderUI();
  clearStatus();
});

modeFixedInput.addEventListener("change", async () => {
  if (!modeFixedInput.checked) {
    return;
  }

  const result = await window.appAPI.setMode("fixed");
  if (!result.ok) {
    showError(result.error || "Instellen modus mislukt.");
    return;
  }

  applyAppState(result.state);
  renderUI();
  clearStatus();
});

modeRandomInput.addEventListener("change", async () => {
  if (!modeRandomInput.checked) {
    return;
  }

  const result = await window.appAPI.setMode("random");
  if (!result.ok) {
    showError(result.error || "Instellen modus mislukt.");
    return;
  }

  applyAppState(result.state);
  renderUI();
  clearStatus();
});

window.appAPI.onPlaySound((payload) => {
  playAudioFromPayload(payload);
});

window.appAPI.onPauseChanged((payload) => {
  state.isPaused = Boolean(payload && payload.isPaused);
  renderSummary();
});

async function init() {
  try {
    await refreshState();
    clearStatus();
  } catch (error) {
    showError(`Initialisatie mislukt: ${error.message}`);
  }
}

init();
