const path = require('path');
const fs = require('fs');
const {
  app,
  BrowserWindow,
  ipcMain,
  desktopCapturer,
  session,
  shell,
  webContents,
} = require('electron');

// ponytail: the window loads the deployed web app, so web changes ship without a new installer.
// Only changes under electron/ or native/ need a rebuild of the .exe.
const APP_URL = process.env.VITE_DEV_SERVER_URL || 'https://miraxshare.netlify.app';
const APP_ORIGIN = new URL(APP_URL).origin;

function isAppUrl(url) {
  try {
    return new URL(url).origin === APP_ORIGIN;
  } catch (_err) {
    return false;
  }
}

function openExternal(url) {
  if (/^https?:\/\//i.test(url)) {
    void shell.openExternal(url);
  }
}

function offlinePageUrl() {
  const html = `<!doctype html><meta charset="utf-8"><title>MiraxShare</title>
<body style="margin:0;height:100vh;display:grid;place-items:center;background:#313338;color:#dbdee1;font-family:system-ui,sans-serif">
<div style="text-align:center">
<p>Sin conexión · No connection</p>
<button onclick="location.href='${APP_URL}'" style="border:0;border-radius:6px;padding:8px 16px;background:#5865f2;color:#fff;font:inherit;cursor:pointer">Reintentar · Retry</button>
</div>`;
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}

const systemAudioState = {
  addon: null,
  callbackInstalled: false,
  started: false,
  subscribers: new Set(),
};

function resolveSystemAudioAddonPath() {
  const nativeDirs = [
    path.join(__dirname, 'native'),
    path.join(process.resourcesPath || '', 'app.asar.unpacked', 'electron', 'native'),
  ];

  for (const nativeDir of nativeDirs) {
    if (!nativeDir || !fs.existsSync(nativeDir)) continue;

    const pointerFile = path.join(nativeDir, 'system_audio.current.json');
    if (fs.existsSync(pointerFile)) {
      try {
        const pointer = JSON.parse(fs.readFileSync(pointerFile, 'utf8'));
        if (pointer?.file) {
          const pointedPath = path.join(nativeDir, pointer.file);
          if (fs.existsSync(pointedPath)) {
            return pointedPath;
          }
        }
      } catch (_err) {
        // Ignore pointer parse errors and continue with fallback lookup.
      }
    }

    const versioned = fs
      .readdirSync(nativeDir)
      .filter((name) => /^system_audio-.*\.node$/i.test(name))
      .map((name) => ({
        name,
        fullPath: path.join(nativeDir, name),
        mtimeMs: fs.statSync(path.join(nativeDir, name)).mtimeMs,
      }))
      .sort((a, b) => b.mtimeMs - a.mtimeMs);

    if (versioned.length > 0) {
      return versioned[0].fullPath;
    }

    const legacyPath = path.join(nativeDir, 'system_audio.node');
    if (fs.existsSync(legacyPath)) {
      return legacyPath;
    }
  }

  return null;
}

function loadSystemAudioAddon() {
  if (systemAudioState.addon) {
    return systemAudioState.addon;
  }

  const addonPath = resolveSystemAudioAddonPath();
  if (!addonPath) {
    throw new Error('System audio addon not found. Run `npm run build:native` before Electron.');
  }

  // eslint-disable-next-line global-require, import/no-dynamic-require
  systemAudioState.addon = require(addonPath);
  return systemAudioState.addon;
}

function toArrayBuffer(value) {
  if (!value) return null;
  const bytes = Buffer.isBuffer(value)
    ? value
    : value instanceof Uint8Array
      ? Buffer.from(value)
      : Buffer.from(value);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

function broadcastSystemAudioChunk(chunk) {
  const pcm = toArrayBuffer(chunk?.pcm);
  if (!pcm) return;

  const payload = {
    pcm,
    sampleRate: chunk.sampleRate,
    channels: chunk.channels,
    frameCount: chunk.frameCount,
    sequence: chunk.sequence,
    timestampMs: chunk.timestampMs,
  };

  for (const id of Array.from(systemAudioState.subscribers)) {
    const target = webContents.fromId(id);
    if (!target || target.isDestroyed()) {
      systemAudioState.subscribers.delete(id);
      continue;
    }
    try {
      target.send('system-audio:chunk', payload);
    } catch (_err) {
      systemAudioState.subscribers.delete(id);
    }
  }
}

function ensureSystemAudioCallbackInstalled() {
  const addon = loadSystemAudioAddon();
  if (systemAudioState.callbackInstalled) {
    return;
  }

  addon.setChunkCallback((chunk) => {
    broadcastSystemAudioChunk(chunk);
  });
  systemAudioState.callbackInstalled = true;
}

function maybeStopSystemAudio() {
  if (systemAudioState.subscribers.size > 0 || !systemAudioState.started) {
    return;
  }

  if (!systemAudioState.addon) {
    systemAudioState.started = false;
    return;
  }

  try {
    systemAudioState.addon.stop();
  } catch (_err) {
    // Ignore stop errors during cleanup.
  }
  systemAudioState.started = false;
}

function registerSystemAudioSubscriber(webContentsId) {
  if (typeof webContentsId !== 'number') return;
  systemAudioState.subscribers.add(webContentsId);
}

function unregisterSystemAudioSubscriber(webContentsId) {
  if (typeof webContentsId !== 'number') return;
  systemAudioState.subscribers.delete(webContentsId);
  maybeStopSystemAudio();
}

function createMainWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 720,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  const wcId = win.webContents.id;

  // The preload exposes native APIs, so the window never leaves the app origin; other links open in the browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (isAppUrl(url)) return;
    event.preventDefault();
    openExternal(url);
  });
  win.webContents.on('did-fail-load', (_event, errorCode, _description, _url, isMainFrame) => {
    // -3 is ERR_ABORTED: a navigation replaced by another one, not a real failure.
    if (!isMainFrame || errorCode === -3) return;
    win.loadURL(offlinePageUrl());
  });

  win.loadURL(APP_URL);
  if (process.env.VITE_DEV_SERVER_URL) {
    win.webContents.openDevTools({ mode: 'detach' });
  }
  win.on('closed', () => {
    unregisterSystemAudioSubscriber(wcId);
  });
}

function setupPermissions() {
  const allowedPermissions = new Set(['media', 'display-capture', 'fullscreen']);
  session.defaultSession.setPermissionRequestHandler((wc, permission, callback, details) => {
    const requestingUrl = details?.requestingUrl || wc.getURL();
    callback(allowedPermissions.has(permission) && isAppUrl(requestingUrl));
  });

  if (typeof session.defaultSession.setDisplayMediaRequestHandler === 'function') {
    session.defaultSession.setDisplayMediaRequestHandler((_request, callback) => {
      desktopCapturer
        .getSources({
          types: ['screen', 'window'],
          thumbnailSize: { width: 320, height: 180 },
          fetchWindowIcons: true,
        })
        .then((sources) => {
          callback({ video: sources[0] || null, audio: 'none' });
        })
        .catch(() => callback({ video: null, audio: 'none' }));
    });
  }
}

function setupIpc() {
  ipcMain.handle('desktop:getSources', async () => {
    const sources = await desktopCapturer.getSources({
      types: ['screen', 'window'],
      thumbnailSize: { width: 320, height: 180 },
      fetchWindowIcons: true,
    });

    return sources.map((source) => ({
      id: source.id,
      name: source.name,
      displayId: source.display_id,
      kind: source.id.startsWith('screen:') ? 'screen' : 'window',
    }));
  });

  ipcMain.handle('system-audio:start', async (event, options = {}) => {
    registerSystemAudioSubscriber(event.sender.id);
    try {
      const addon = loadSystemAudioAddon();
      ensureSystemAudioCallbackInstalled();

      if (!systemAudioState.started) {
        addon.start({
          targetSampleRate: options.targetSampleRate || 48000,
          channels: options.channels || 2,
          frameMs: options.frameMs || 20,
        });

        await new Promise((resolve) => setTimeout(resolve, 100));
        const stats = addon.getStats();
        if (!stats.running && stats.lastError) {
          throw new Error(stats.lastError);
        }

        systemAudioState.started = true;
      }

      return addon.getStats();
    } catch (error) {
      unregisterSystemAudioSubscriber(event.sender.id);
      throw error;
    }
  });

  ipcMain.handle('system-audio:stop', async (event) => {
    unregisterSystemAudioSubscriber(event.sender.id);
    if (systemAudioState.addon) {
      return systemAudioState.addon.getStats();
    }

    return {
      running: false,
      capturedInputFrames: 0,
      emittedOutputFrames: 0,
      emittedChunks: 0,
      droppedChunks: 0,
      silentInputFrames: 0,
      inputSampleRate: 0,
      outputSampleRate: 0,
      outputChannels: 0,
      chunkFrameMs: 0,
      lastError: '',
    };
  });

  ipcMain.handle('system-audio:stats', async () => {
    if (!systemAudioState.addon) {
      return {
        running: false,
        capturedInputFrames: 0,
        emittedOutputFrames: 0,
        emittedChunks: 0,
        droppedChunks: 0,
        silentInputFrames: 0,
        inputSampleRate: 0,
        outputSampleRate: 0,
        outputChannels: 0,
        chunkFrameMs: 0,
        lastError: '',
      };
    }

    return systemAudioState.addon.getStats();
  });
}

app.whenReady().then(() => {
  setupPermissions();
  setupIpc();
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  maybeStopSystemAudio();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  systemAudioState.subscribers.clear();
  maybeStopSystemAudio();
});
