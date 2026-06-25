# win-button

Eenvoudige Electron desktop-app voor Windows met USB-knop trigger.

> Let op: deze app gebruikt **geen externe API** of internetdienst.
> Alles draait lokaal binnen dezelfde app-map.

## Wat de app doet

- Opent 1 venster.
- Leest automatisch alle `.mp3`-bestanden uit `./sounds`.
- Toont een geluidsbibliotheek met per bestand:
  - bestandsnaam
  - **Play/Test** knop
  - **Instellen als vast geluid** knop
- Heeft een knop **MP3 toevoegen** waarmee de gebruiker via de Windows bestandskiezer
  MP3-bestanden direct naar `./sounds` kopieert.
- Speelt hetzelfde geluid af als je op de **`**-toets drukt, ook als het app-venster
  niet actief is (via Electron `globalShortcut`).
- Ondersteunt 2 modi:
  - **Vast geluid** (gekozen bestand)
  - **Random** (willekeurig bestand uit `./sounds`)
- Slaat modus + vast geluid op in `settings.json`.

## Projectstructuur

```text
.
├── index.html
├── main.js
├── renderer.js
├── assets/
│   └── icon.ico
├── settings.json (runtime, lokaal)
├── styles.css
├── package.json
└── sounds/
    └── *.mp3
```

## Exacte Windows terminalcommando's om te starten

Voer deze commando's uit in **PowerShell** (of CMD) in de projectmap:

```powershell
npm install
npm start
```

Als `npm` nog niet bestaat op je systeem, installeer eerst Node.js LTS via:
https://nodejs.org/

## Windows installer bouwen (electron-builder)

```powershell
npm run dist
```

Output staat in de map `dist/` (NSIS installer `.exe`).