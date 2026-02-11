# MiraxShare Frontend + Electron (Windows)

MiraxShare is a React + Vite frontend for WebRTC screen sharing, now prepared to run as an Electron desktop app on Windows.

## Environment

Create `.env.local` from `.env.example` if you want to override defaults:

```bash
VITE_WS_URL=wss://miraxshare-backend.onrender.com/ws
VITE_WINDOWS_DOWNLOAD_URL=https://github.com/Jhony445/MiraxShare_Frontend/releases/latest/download/MiraxShare-Setup.exe
```

If no env is provided, the app already falls back to the same Render WS URL.

## Web dev

```bash
npm install
npm run dev
```

Then open:
- `http://localhost:5173/host`
- `http://localhost:5173/join`

## Electron dev

```bash
npm run build:native
npm run dev:electron
```

This starts Vite and opens Electron with the same frontend.
The native step builds the Windows WASAPI loopback addon used for stable system audio capture.

### Native addon requirements (Windows)

- Visual Studio 2022 Build Tools (Desktop development with C++)
- Windows 10/11 SDK
- Python 3.x

To validate native audio capture only:

```bash
npm run test:system-audio
```

This writes `artifacts/system-audio-test.wav`.

## Build web

```bash
npm run build:web
```

## Build Electron installer (NSIS)

```bash
npm run build:electron:release
```

Outputs are generated in `release/` and copied to:

`D:\Proyectos\MiraxShare_download\`

## Runtime behavior

- Web mode keeps browser flow (`getDisplayMedia`) for compatibility.
- Electron mode uses `desktopCapturer + getUserMedia(chromeMediaSourceId)` for screen/window capture.
- Electron uses `HashRouter` so routing works with `file://` (`#/host`, `#/join`).
- Electron host now adds native WASAPI loopback system audio to the same WebRTC stream as video.
- Host applies high-quality Opus settings for system audio (stereo, FEC, higher target bitrate, no DTX).
- Landing page includes a Windows download button for installer distribution.
