# MiraxShare Frontend MVP (Phase 1)

React + Vite frontend for a lightweight WebRTC screen sharing flow. This client connects to the local signaling server via WebSocket and negotiates a direct peer connection.

## Run locally
```
npm install
npm run dev
```

Vite will print a local URL (typically `http://localhost:5173`).

## How to test
1. Open `http://localhost:5173/host` in one tab.
2. Copy the room ID.
3. Open `http://localhost:5173/join` in a second tab and paste the room ID.
4. On the host tab, click **Start screen share** and pick a screen/window.
5. The viewer tab should show the shared screen.

## Notes
- Recommended browser: Chrome or Edge (best support for `getDisplayMedia`).
- Backend WebSocket endpoint: `ws://localhost:3000/ws`.
