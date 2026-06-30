# win-button

Eenvoudige Electron desktop-app voor Windows met USB-knop trigger.

> Let op: deze app gebruikt **geen externe API** of internetdienst.
> Alles draait lokaal binnen dezelfde app-map.

## Wat de app doet

- Opent 1 venster.
- Leest automatisch alle `.mp3`-bestanden uit de gebruikers-geluidsmap.
- Toont een geluidsbibliotheek met per bestand:
  - bestandsnaam
  - **Play/Test** knop
  - **Instellen als vast geluid** knop
- Heeft een knop **MP3 toevoegen** waarmee de gebruiker via de Windows bestandskiezer
  MP3-bestanden direct naar de gebruikers-geluidsmap kopieert.
- Speelt hetzelfde geluid af als je op de **`**-toets drukt, ook als het app-venster
  niet actief is (via Electron `globalShortcut`).
- Ondersteunt 2 modi:
  - **Vast geluid** (gekozen bestand)
  - **Random** (willekeurig bestand uit de gebruikers-geluidsmap)
- Slaat modus + vast geluid op in `app.getPath("userData")/settings.json`.
- Draait in systeemvak (tray): sluiten met **X** verbergt de app i.p.v. volledig afsluiten.
- Via **File > Instellingen** open je een apart instellingenvenster.
- Via **File > Controleer op updates** open je het updatevenster.

## Geluidsopslag

- Meegeleverde sounds staan in `./default-sounds` (alleen app/installatie).
- Gebruikerssounds staan in `app.getPath("userData")/sounds`.
- Bij eerste start worden default sounds eenmalig gekopieerd naar de gebruikersmap.
- Daarna wordt niet meer automatisch gesynchroniseerd, zodat verwijderde gebruikersbestanden weg blijven.

## Projectstructuur

```text
.
├── index.html
├── main.js
├── preload.js
├── renderer.js
├── settings.html
├── settings.js
├── assets/
│   └── Sale Button.ico
├── default-sounds/
│   └── *.mp3
├── styles.css
├── package.json
└── build/
    └── installer.nsh
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