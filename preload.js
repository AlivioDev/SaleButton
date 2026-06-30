const { contextBridge, ipcRenderer } = require("electron");

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

function on(channel, callback) {
  if (typeof callback !== "function") {
    throw new TypeError("Callback functie is verplicht.");
  }

  const listener = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, listener);

  return () => {
    ipcRenderer.removeListener(channel, listener);
  };
}

contextBridge.exposeInMainWorld("appAPI", {
  getAppState() {
    return ipcRenderer.invoke(CHANNELS.GET_APP_STATE);
  },
  refreshSounds() {
    return ipcRenderer.invoke(CHANNELS.REFRESH_SOUNDS);
  },
  playCurrentMode() {
    return ipcRenderer.invoke(CHANNELS.PLAY_CURRENT_MODE);
  },
  playSpecificSound(filename) {
    return ipcRenderer.invoke(CHANNELS.PLAY_SPECIFIC_SOUND, filename);
  },
  setMode(mode) {
    return ipcRenderer.invoke(CHANNELS.SET_MODE, mode);
  },
  setFixedSound(filename) {
    return ipcRenderer.invoke(CHANNELS.SET_FIXED_SOUND, filename);
  },
  addSoundFiles(filePaths) {
    return ipcRenderer.invoke(CHANNELS.ADD_SOUND_FILES, filePaths);
  },
  deleteSound(filename) {
    return ipcRenderer.invoke(CHANNELS.DELETE_SOUND, filename);
  },
  openUserSoundsFolder() {
    return ipcRenderer.invoke(CHANNELS.OPEN_USER_SOUNDS_FOLDER);
  },
  getStartupSetting() {
    return ipcRenderer.invoke(CHANNELS.GET_STARTUP_SETTING);
  },
  setStartupSetting(enabled) {
    return ipcRenderer.invoke(CHANNELS.SET_STARTUP_SETTING, enabled);
  },
  checkForUpdates() {
    return ipcRenderer.invoke(CHANNELS.CHECK_FOR_UPDATES);
  },
  getUpdateState() {
    return ipcRenderer.invoke(CHANNELS.GET_UPDATE_STATE);
  },
  installDownloadedUpdate() {
    return ipcRenderer.invoke(CHANNELS.INSTALL_DOWNLOADED_UPDATE);
  },
  onPlaySound(callback) {
    return on(CHANNELS.PLAY_SOUND, callback);
  },
  onPauseChanged(callback) {
    return on(CHANNELS.PAUSE_CHANGED, callback);
  },
  onUpdateStatus(callback) {
    return on(CHANNELS.UPDATE_STATUS, callback);
  }
});
