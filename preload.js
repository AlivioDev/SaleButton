const { contextBridge, ipcRenderer } = require("electron");
const { IPC_CHANNELS } = require("./ipc-channels");

contextBridge.exposeInMainWorld("electronAPI", {
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
