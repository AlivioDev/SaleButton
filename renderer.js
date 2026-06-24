const playButton = document.getElementById("playButton");
const statusText = document.getElementById("status");
const sound = document.getElementById("sound");
let removeMainListener = null;

/**
 * Speelt het lokale MP3-bestand af vanaf het begin.
 */
function playSound(triggerSource) {
  // Reset zodat snelle herhalingen opnieuw hoorbaar starten.
  sound.currentTime = 0;

  sound
    .play()
    .then(() => {
      statusText.textContent = `Geluid afgespeeld via: ${triggerSource}`;
    })
    .catch((error) => {
      statusText.textContent = `Afspelen mislukt: ${error.message}`;
      console.error("Kon geluid niet afspelen:", error);
    });
}

playButton.addEventListener("click", () => {
  playSound("Test geluid-knop");
});

if (window.electronAPI && typeof window.electronAPI.onPlaySoundRequested === "function") {
  removeMainListener = window.electronAPI.onPlaySoundRequested((payload) => {
    const source = payload && payload.source ? payload.source : "main process";
    playSound(source);
  });
} else {
  console.warn("electronAPI.onPlaySoundRequested is niet beschikbaar.");
}

window.addEventListener("beforeunload", () => {
  if (typeof removeMainListener === "function") {
    removeMainListener();
    removeMainListener = null;
  }
});
