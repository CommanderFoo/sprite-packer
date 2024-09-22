const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  loadImages: (folderPath) => ipcRenderer.invoke('load-images', folderPath),
  packTexture: (options) => ipcRenderer.invoke('pack-texture', options),
  saveAtlas: (options) => ipcRenderer.invoke('save-atlas', options),
  readFile: (filePath) => ipcRenderer.invoke('read-file', filePath),
  getRecentFolders: () => ipcRenderer.invoke('get-recent-folders'),
  addRecentFolder: (folder) => ipcRenderer.invoke('add-recent-folder', folder),
  toggleDarkMode: () => ipcRenderer.invoke('toggle-dark-mode'),
  getTheme: () => ipcRenderer.invoke('get-theme'),
  getFileStats: (filePath) => ipcRenderer.invoke('get-file-stats', filePath),
  getImagePreview: (filePath) => ipcRenderer.invoke('get-image-preview', filePath),
  setAtlasZoom: (zoomFactor) => ipcRenderer.invoke('set-atlas-zoom', zoomFactor),
  getAtlasZoom: () => ipcRenderer.invoke('get-atlas-zoom'),
});