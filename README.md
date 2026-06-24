# win-button

Minimale Electron desktop-app voor Windows.

## Wat deze MVP doet

- Opent 1 venster.
- Heeft een knop **"Test geluid"**.
- Speelt lokaal MP3-bestand af: `sounds/click.mp3`.
- Speelt hetzelfde geluid af als je op de **`**-toets drukt terwijl de app actief is.

## Projectstructuur

```text
.
├── index.html
├── main.js
├── renderer.js
├── styles.css
├── package.json
└── sounds/
    └── click.mp3
```

## Exacte Windows terminalcommando's om te starten

Voer deze commando's uit in **PowerShell** (of CMD) in de projectmap:

```powershell
npm install
npm start
```

Als `npm` nog niet bestaat op je systeem, installeer eerst Node.js LTS via:
https://nodejs.org/