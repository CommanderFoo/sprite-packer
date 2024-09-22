const { app, BrowserWindow, ipcMain, dialog, nativeTheme, webContents } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const sharp = require('sharp');

let store;
let mainWindow;

async function initializeStore() {
  const { default: Store } = await import('electron-store');
  store = new Store();
}

function createWindow() {
  // Increase window size by 20%
  const width = Math.round(1200 * 1.2);
  const height = Math.round(800 * 1.2);

  mainWindow = new BrowserWindow({
    width: width,
    height: height,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      // Add this line to set a Content Security Policy
      contentSecurityPolicy: "default-src 'self'; script-src 'self'"
    },
  });

  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadFile('index.html');

  // Set the theme based on the stored value or system preference
  const isDarkMode = store.get('darkMode', nativeTheme.shouldUseDarkColors);
  nativeTheme.themeSource = isDarkMode ? 'dark' : 'light';
}

// Set the app name
app.name = 'Sprite Packer';

app.whenReady().then(async () => {
  await initializeStore();
  createWindow();

  ipcMain.handle('select-folder', async () => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'] });
    if (result.filePaths[0]) {
      await addRecentFolder(result.filePaths[0]);
    }
    return result.filePaths[0];
  });

  ipcMain.handle('load-images', async (event, folderPath) => {
    const files = await fs.readdir(folderPath);
    const imageFiles = files.filter(file => 
      ['.png', '.jpg', '.jpeg', '.gif'].includes(path.extname(file).toLowerCase())
    );
    const imagesWithStats = await Promise.all(imageFiles.map(async file => {
      const filePath = path.join(folderPath, file);
      const stats = await fs.stat(filePath);
      return {
        path: filePath,
        name: path.parse(file).name,
        stats: {
          size: stats.size,
          birthtime: stats.birthtime,
          mtime: stats.mtime
        }
      };
    }));
    return imagesWithStats;
  });

  ipcMain.handle('pack-texture', async (event, { imagePaths, atlasSize, padding, sortingMethod }) => {
    try {
      console.log('Packing texture in main process:', { imagePaths, atlasSize, padding, sortingMethod });
      const images = await Promise.all(imagePaths.map(async (path) => {
        const buffer = await fs.readFile(path);
        const stats = await fs.stat(path);
        const metadata = await sharp(buffer).metadata();
        return { path, buffer, stats, width: metadata.width, height: metadata.height };
      }));

      // Sort images based on the selected method
      images.sort((a, b) => {
        switch (sortingMethod) {
          case 'fileSize-asc':
            return a.stats.size - b.stats.size;
          case 'fileSize-desc':
            return b.stats.size - a.stats.size;
          case 'name-asc':
            return a.path.localeCompare(b.path);
          case 'name-desc':
            return b.path.localeCompare(a.path);
          case 'updated-asc':
            return a.stats.mtime - b.stats.mtime;
          case 'updated-desc':
            return b.stats.mtime - a.stats.mtime;
          default:
            return 0;
        }
      });

      // Custom packing algorithm
      const packedRects = [];
      let currentX = padding;
      let currentY = padding;
      let rowHeight = 0;

      for (const img of images) {
        const width = img.width + padding * 2;
        const height = img.height + padding * 2;

        if (currentX + width > atlasSize) {
          // Move to the next row
          currentX = padding;
          currentY += rowHeight + padding;
          rowHeight = 0;
        }

        if (currentY + height > atlasSize) {
          console.warn('Unable to pack image:', img.path);
          continue;
        }

        packedRects.push({
          x: currentX,
          y: currentY,
          width: img.width,
          height: img.height,
          data: img
        });

        currentX += width;
        rowHeight = Math.max(rowHeight, height);
      }

      console.log('Packer result:', packedRects);
      return { packedRects, images };
    } catch (error) {
      console.error('Error in pack-texture:', error);
      throw error;
    }
  });

  ipcMain.handle('save-atlas', async (event, { dataUrl, defaultPath }) => {
    const result = await dialog.showSaveDialog({
      defaultPath,
      filters: [{ name: 'PNG', extensions: ['png'] }]
    });
    if (!result.canceled) {
      const base64Data = dataUrl.replace(/^data:image\/png;base64,/, "");
      await fs.writeFile(result.filePath, base64Data, 'base64');
      return result.filePath;
    }
  });

  ipcMain.handle('read-file', async (event, filePath) => {
    return await fs.readFile(filePath);
  });

  ipcMain.handle('get-recent-folders', () => {
    return store.get('recentFolders', []);
  });

  ipcMain.handle('add-recent-folder', (event, folder) => {
    return addRecentFolder(folder);
  });

  ipcMain.handle('toggle-dark-mode', () => {
    const isDarkMode = nativeTheme.shouldUseDarkColors;
    nativeTheme.themeSource = isDarkMode ? 'light' : 'dark';
    store.set('darkMode', !isDarkMode);
    return !isDarkMode;
  });

  ipcMain.handle('get-theme', () => {
    return nativeTheme.shouldUseDarkColors;
  });

  ipcMain.handle('get-file-stats', async (event, filePath) => {
    return await fs.stat(filePath);
  });

  ipcMain.handle('get-image-preview', async (event, filePath) => {
    const buffer = await fs.readFile(filePath);
    const resizedBuffer = await sharp(buffer)
      .resize(50, 50, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .toBuffer();
    return {
      preview: `data:image/png;base64,${resizedBuffer.toString('base64')}`,
      name: path.parse(filePath).name // Return the filename without extension
    };
  });

  // Add these new IPC handlers for atlas zoom functionality
  ipcMain.handle('set-atlas-zoom', (event, zoomFactor) => {
    store.set('atlasZoomFactor', zoomFactor);
    return zoomFactor;
  });

  ipcMain.handle('get-atlas-zoom', () => {
    return store.get('atlasZoomFactor', 0.6); // Change default to 0.6 (60%)
  });

  // Add these new IPC handlers
  ipcMain.handle('save-project', async (event, projectData) => {
    const result = await dialog.showSaveDialog({
      title: 'Save Project',
      defaultPath: 'texture_atlas_project.json',
      filters: [{ name: 'JSON', extensions: ['json'] }]
    });

    if (!result.canceled) {
      await fs.writeFile(result.filePath, JSON.stringify(projectData, null, 2));
      return result.filePath;
    }
  });

  ipcMain.handle('load-project', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Load Project',
      filters: [{ name: 'JSON', extensions: ['json'] }],
      properties: ['openFile']
    });

    if (!result.canceled && result.filePaths.length > 0) {
      const projectData = await fs.readFile(result.filePaths[0], 'utf-8');
      return JSON.parse(projectData);
    }
  });
});

async function addRecentFolder(folder) {
  let recentFolders = store.get('recentFolders', []);
  recentFolders = [folder, ...recentFolders.filter(f => f !== folder)].slice(0, 10);
  store.set('recentFolders', recentFolders);
  return recentFolders;
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});