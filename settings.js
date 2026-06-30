const startupToggle = document.getElementById("startupToggle");
const checkUpdatesButton = document.getElementById("checkUpdatesButton");
const installUpdateButton = document.getElementById("installUpdateButton");
const updateStatusText = document.getElementById("updateStatusText");
const startupSection = document.getElementById("startupSection");
const updatesSection = document.getElementById("updatesSection");

function setUpdateStatus(message, isError) {
  updateStatusText.textContent = `Updates: ${message}`;
  updateStatusText.classList.toggle("error", Boolean(isError));
}

function renderUpdateState(updateState) {
  const status = updateState && updateState.status ? updateState.status : "idle";
  const version = updateState && updateState.version ? ` (v${updateState.version})` : "";
  const percent = updateState && typeof updateState.percent === "number" ? updateState.percent : 0;
  const readyToInstall = Boolean(updateState && updateState.readyToInstall);

  installUpdateButton.disabled = !readyToInstall;

  switch (status) {
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
      setUpdateStatus(`downloaden: ${percent}%`, false);
      break;
    case "update-downloaded":
      setUpdateStatus("update gedownload. Je kunt nu installeren of later doen.", false);
      break;
    case "error":
      setUpdateStatus(updateState && updateState.message ? updateState.message : "onbekende fout.", true);
      break;
    default:
      setUpdateStatus(updateState && updateState.message ? updateState.message : "nog niet gecontroleerd.", false);
      break;
  }
}

startupToggle.addEventListener("change", async () => {
  try {
    const updated = await window.appAPI.setStartupSetting(startupToggle.checked);
    startupToggle.checked = Boolean(updated);
  } catch (error) {
    setUpdateStatus(`Kon opstartinstelling niet opslaan: ${error.message}`, true);
  }
});

checkUpdatesButton.addEventListener("click", async () => {
  try {
    const result = await window.appAPI.checkForUpdates();
    if (!result.ok) {
      setUpdateStatus(result.message || "Updatecontrole mislukt.", true);
      return;
    }

    setUpdateStatus("controle gestart...", false);
  } catch (error) {
    setUpdateStatus(`Updatecontrole mislukt: ${error.message}`, true);
  }
});

installUpdateButton.addEventListener("click", async () => {
  try {
    const result = await window.appAPI.installDownloadedUpdate();
    if (!result.ok) {
      setUpdateStatus(result.message || "Installeren mislukt.", true);
    }
  } catch (error) {
    setUpdateStatus(`Installeren mislukt: ${error.message}`, true);
  }
});

window.appAPI.onUpdateStatus((payload) => {
  renderUpdateState(payload);
});

async function init() {
  const params = new URLSearchParams(window.location.search);
  const section = params.get("section");

  if (section === "updates") {
    updatesSection.scrollIntoView({ behavior: "smooth", block: "start" });
    checkUpdatesButton.focus();
  } else {
    startupSection.scrollIntoView({ behavior: "smooth", block: "start" });
    startupToggle.focus();
  }

  try {
    const startupEnabled = await window.appAPI.getStartupSetting();
    startupToggle.checked = Boolean(startupEnabled);
  } catch (error) {
    setUpdateStatus(`Kon opstartinstelling niet laden: ${error.message}`, true);
  }

  try {
    const updateState = await window.appAPI.getUpdateState();
    renderUpdateState(updateState);
  } catch (error) {
    setUpdateStatus(`Kon update-status niet laden: ${error.message}`, true);
  }
}

init();
