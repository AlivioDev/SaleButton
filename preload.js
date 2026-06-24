const { contextBridge, ipcRenderer } = require("electron");
const { IPC_CHANNELS } = require("./ipc-channels");

const INVOKE_TIMEOUT_MS = 2500;

function invokeWithTimeout(channel, ...args) {
  return new Promise((resolve, reject) => {
    let isDone = false;

    const timer = setTimeout(() => {
      if (isDone) {
        return;
      }
      isDone = true;
      reject(new Error(`IPC timeout op kanaal: ${channel}`));
    }, INVOKE_TIMEOUT_MS);

    ipcRenderer
      .invoke(channel, ...args)
      .then((result) => {
        if (isDone) {
          return;
        }
        isDone = true;
        clearTimeout(timer);
        resolve(result);
      })
      .catch((error) => {
        if (isDone) {
          return;
        }
        isDone = true;
        clearTimeout(timer);
        reject(error);
      });
  });
}

async function invokeWithFallback(channel, ...args) {
  try {
    return await invokeWithTimeout(channel, ...args);
  } catch (invokeError) {
    try {
      return ipcRenderer.sendSync(`${channel}:sync`, ...args);
    } catch (syncError) {
      throw new Error(
        `IPC invoke + fallback mislukt voor ${channel}: ${invokeError.message}; ${syncError.message}`
      );
    }
  }
}

contextBridge.exposeInMainWorld("electronAPI", {
  getAppState() {
    return invokeWithFallback(IPC_CHANNELS.GET_APP_STATE);
  },
  refreshSoundLibrary() {
    return invokeWithFallback(IPC_CHANNELS.REFRESH_SOUND_LIBRARY);
  },
  playSound(filename) {
    return invokeWithFallback(IPC_CHANNELS.PLAY_SOUND, filename);
  },
  playCurrentMode() {
    return invokeWithFallback(IPC_CHANNELS.PLAY_CURRENT_MODE);
  },
  setMode(mode) {
    return invokeWithFallback(IPC_CHANNELS.SET_MODE, mode);
  },
  setFixedSound(filename) {
    return invokeWithFallback(IPC_CHANNELS.SET_FIXED_SOUND, filename);
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
