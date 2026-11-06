# NODRUS — app de escritorio

El mismo NODRUS del Lab, como programa de Windows, con lo que el navegador no permite:

- **Spout**: lo que está al aire sale como fuente «NODRUS» para Resolume, TouchDesigner, OBS o MadMapper (por GPU).
- **OSC** de entrada y salida (ver direcciones abajo).
- **Celular por wifi**, sin internet: «📱 Control» muestra un QR con la dirección local.
- **Salida en el proyector**: «⧉ Salida» se abre a pantalla completa en la otra pantalla.

Todo se configura en el botón **🖥 Escritorio** de la barra.

## Usar

- Programa listo: `dist/NODRUS-0.1.0-portable.exe` (un solo archivo, no se instala).
- La primera vez Windows pregunta por el **firewall**: permití «redes privadas» para que el celular se pueda conectar.
- Windows puede avisar «aplicación desconocida» (no está firmada): «Más información → Ejecutar de todos modos».

## Desarrollo

```
npm install
node node_modules/electron/install.js   # npm 11 no corre el script de Electron solo
NODRUS-dev.cmd                          # abre la app sin empaquetar
npm test                                # prueba automática (Spout, OSC, celular)
npm run dist                            # arma el .exe portable en dist/
```

Si se corre desde la terminal de VS Code hay que quitar la variable `ELECTRON_RUN_AS_NODE` (el `.cmd` ya lo hace).

## OSC

Entrada (puerto 9000 por defecto): `/nodrus/go` · `/nodrus/scene 1–16` · `/nodrus/next` · `/nodrus/prev` · `/nodrus/black [0/1]` · `/nodrus/strobe 0/1` · `/nodrus/tap` · `/nodrus/bpm 120` · `/nodrus/xf 0–1` · `/nodrus/deck A/B` · `/nodrus/fade 0/0.5/1/2/4` · `/nodrus/random` · `/nodrus/vary` · `/nodrus/overlay [0/1]` · `/nodrus/ctl/1…8 valor` (0–1; pad XY: `x y`)

Salida (a 127.0.0.1:9001 por defecto): `/nodrus/audio nivel graves medios agudos` (30 por segundo) · `/nodrus/beat n` · `/nodrus/scene n` · `/nodrus/xf valor`

Spout usa [`@napolab/texture-bridge`](https://github.com/naporin0624/electron-texture-bridge) (MIT).
