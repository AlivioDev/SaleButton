const playButton = document.getElementById("playButton");
const statusText = document.getElementById("status");
const sound = document.getElementById("sound");

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

window.addEventListener("keydown", (event) => {
  // USB-knop stuurt de `-toets. We ondersteunen zowel key als code.
  const isBackquoteKey = event.key === "`" || event.code === "Backquote";
  if (!isBackquoteKey) {
    return;
  }

  event.preventDefault();
  playSound("`-toets");
});
