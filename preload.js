const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getPixelColor: (x, y) => ipcRenderer.invoke('get-pixel-color', { x, y }),
  copyToClipboard: (text) => ipcRenderer.invoke('copy-to-clipboard', text),
  pasteFromClipboard: () => ipcRenderer.invoke('paste-from-clipboard'),
  storeGet: (key, defaultValue) => ipcRenderer.invoke('store-get', key, defaultValue),
  storeSet: (key, value) => ipcRenderer.invoke('store-set', key, value),
  storeDelete: (key) => ipcRenderer.invoke('store-delete', key),
  toggleAlwaysOnTop: () => ipcRenderer.invoke('toggle-always-on-top'),
  startPicker: () => ipcRenderer.invoke('start-picker'),
  closePicker: () => ipcRenderer.invoke('close-picker'),
  colorSelected: (color) => ipcRenderer.invoke('color-selected', color),
  getScreenDisplays: () => ipcRenderer.invoke('get-screen-displays'),
  getMousePosition: () => ipcRenderer.invoke('get-mouse-position'),
  getAlwaysOnTopStatus: () => ipcRenderer.invoke('get-always-on-top-status'),
  exportData: (data) => ipcRenderer.invoke('export-data', data),
  importData: (jsonString) => ipcRenderer.invoke('import-data', jsonString),
  
  onColorSelected: (callback) => {
    ipcRenderer.on('color-selected', (event, color) => callback(color));
  },
  
  onPickerClosed: (callback) => {
    ipcRenderer.on('picker-closed', () => callback());
  },
  
  onAlwaysOnTopChanged: (callback) => {
    ipcRenderer.on('always-on-top-changed', (event, isOnTop) => callback(isOnTop));
  },
  
  onScreenCaptured: (callback) => {
    ipcRenderer.on('screen-captured', (event, data) => callback(data));
  },
  
  removeAllListeners: () => {
    ipcRenderer.removeAllListeners('color-selected');
    ipcRenderer.removeAllListeners('picker-closed');
    ipcRenderer.removeAllListeners('always-on-top-changed');
    ipcRenderer.removeAllListeners('screen-captured');
  }
});
