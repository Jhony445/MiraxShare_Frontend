const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  getSources: () => ipcRenderer.invoke('desktop:getSources'),
  startSystemAudio: (options = {}) => ipcRenderer.invoke('system-audio:start', options),
  stopSystemAudio: () => ipcRenderer.invoke('system-audio:stop'),
  getSystemAudioStats: () => ipcRenderer.invoke('system-audio:stats'),
  onAudioChunk: (callback) => {
    if (typeof callback !== 'function') {
      return () => {};
    }

    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('system-audio:chunk', listener);
    return () => {
      ipcRenderer.removeListener('system-audio:chunk', listener);
    };
  },
});
