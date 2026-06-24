const { contextBridge, ipcRenderer } = require("electron");
const { IPC_CHANNELS } = require("./ipc-channels");

contextBridge.exposeInMainWorld("electronAPI", {
  getAppState() {
    return ipcRenderer.invoke(IPC_CHANNELS.GET_APP_STATE);
  },
  refreshSoundLibrary() {
    return ipcRenderer.invoke(IPC_CHANNELS.REFRESH_SOUND_LIBRARY);
  },
  playSound(filename) {
    return ipcRenderer.invoke(IPC_CHANNELS.PLAY_SOUND, filename);
  },
  playCurrentMode() {
    return ipcRenderer.invoke(IPC_CHANNELS.PLAY_CURRENT_MODE);
  },
  setMode(mode) {
    return ipcRenderer.invoke(IPC_CHANNELS.SET_MODE, mode);
  },
  setFixedSound(filename) {
    return ipcRenderer.invoke(IPC_CHANNELS.SET_FIXED_SOUND, filename);
  },
  /**
   * Luister veilig naar verzoeken uit het main process.
   * Geeft een cleanup-functie terug om de listener te verwijderen.
   */
  onPlaySoundRequested(callback) {
    if (typeof callback !== "function") {
      throw new TypeError("onPlaySoundRequested verwacht een callback-functie.");
    }

    const listener = (_event, payload) => {
      callback(payload);
    };

    ipcRenderer.on(IPC_CHANNELS.PLAY_SOUND, listener);

    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.PLAY_SOUND, listener);
    };
  }
});
