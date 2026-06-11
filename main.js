const { app, BrowserWindow, ipcMain, globalShortcut, Tray, Menu, clipboard, screen, nativeImage } = require('electron');
const path = require('path');
const http = require('http');
const fs = require('fs');
const Store = require('electron-store');

let store = null;
let mainWindow = null;
let tray = null;
let pickerWindow = null;
let isAlwaysOnTop = false;
let screenCapture = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 700,
    minWidth: 800,
    minHeight: 600,
    frame: true,
    backgroundColor: '#1a1a2e',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false
    }
  });

  mainWindow.loadFile('index.html');

  mainWindow.on('close', (e) => {
    if (!app.isQuiting) {
      e.preventDefault();
      mainWindow.hide();
    }
    return false;
  });

  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }
}

function createTray() {
  const iconPath = path.join(__dirname, 'assets', 'tray.png');
  let trayIcon;
  
  try {
    if (fs.existsSync(iconPath)) {
      trayIcon = nativeImage.createFromPath(iconPath);
    } else {
      trayIcon = createTrayIcon();
    }
  } catch (e) {
    trayIcon = createTrayIcon();
  }

  tray = new Tray(trayIcon);
  tray.setToolTip('ColorPicker Pro');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '显示主窗口',
      click: () => {
        mainWindow.show();
        mainWindow.focus();
      }
    },
    {
      label: '屏幕取色',
      accelerator: 'CommandOrControl+Shift+C',
      click: () => startColorPicker()
    },
    {
      label: '窗口置顶',
      type: 'checkbox',
      checked: isAlwaysOnTop,
      click: () => toggleAlwaysOnTop()
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        app.isQuiting = true;
        app.quit();
      }
    }
  ]);

  tray.setContextMenu(contextMenu);

  tray.on('click', () => {
    if (mainWindow.isVisible()) {
      mainWindow.hide();
    } else {
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

function createTrayIcon() {
  const size = 16;
  const canvas = Buffer.alloc(size * size * 4);
  
  for (let i = 0; i < size * size; i++) {
    const x = i % size;
    const y = Math.floor(i / size);
    const idx = i * 4;
    
    const color = getColorFromPosition(x, y, size);
    canvas[idx] = color.r;
    canvas[idx + 1] = color.g;
    canvas[idx + 2] = color.b;
    canvas[idx + 3] = 255;
  }
  
  return nativeImage.createFromBuffer(canvas, { width: size, height: size });
}

function getColorFromPosition(x, y, size) {
  const cx = size / 2;
  const cy = size / 2;
  const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
  
  if (dist < size / 3) {
    return { r: 255, g: 100, b: 100 };
  } else if (dist < size / 2) {
    return { r: 100, g: 255, b: 100 };
  } else {
    return { r: 100, g: 100, b: 255 };
  }
}

function toggleAlwaysOnTop() {
  isAlwaysOnTop = !isAlwaysOnTop;
  mainWindow.setAlwaysOnTop(isAlwaysOnTop, 'floating');
  mainWindow.webContents.send('always-on-top-changed', isAlwaysOnTop);
}

function registerShortcuts() {
  globalShortcut.register('CommandOrControl+Shift+C', () => {
    startColorPicker();
  });

  globalShortcut.register('CommandOrControl+Shift+X', () => {
    if (mainWindow.isVisible()) {
      mainWindow.hide();
    } else {
      mainWindow.show();
      mainWindow.focus();
    }
  });

  globalShortcut.register('CommandOrControl+Shift+T', () => {
    toggleAlwaysOnTop();
  });
}

async function startColorPicker() {
  if (pickerWindow) {
    pickerWindow.close();
    pickerWindow = null;
    return;
  }

  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.bounds;
  const scaleFactor = primaryDisplay.scaleFactor || 1;
  
  pickerWindow = new BrowserWindow({
    width: width,
    height: height,
    x: 0,
    y: 0,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    movable: false,
    fullscreenable: false,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      backgroundThrottling: false
    }
  });

  pickerWindow.setIgnoreMouseEvents(false);
  
  const imageData = await captureScreen();
  screenCapture = imageData;
  
  await pickerWindow.loadFile('picker.html');
  
  pickerWindow.webContents.once('did-finish-load', () => {
    if (pickerWindow && imageData) {
      setTimeout(() => {
        if (pickerWindow) {
          pickerWindow.webContents.send('screen-captured', imageData);
        }
      }, 100);
    }
  });

  pickerWindow.on('closed', () => {
    pickerWindow = null;
    if (mainWindow) {
      mainWindow.webContents.send('picker-closed');
    }
  });
}

async function captureScreen() {
  const displays = screen.getAllDisplays();
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.bounds;

  try {
    const sources = await require('electron').desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: width * 2, height: height * 2 }
    });

    const primarySource = sources.find(s => 
      s.display_id === primaryDisplay.id.toString()
    ) || sources[0];

    if (primarySource) {
      const thumbnail = primarySource.thumbnail;
      return {
        dataUrl: thumbnail.toDataURL(),
        width: thumbnail.getSize().width,
        height: thumbnail.getSize().height,
        displayWidth: width,
        displayHeight: height
      };
    }
  } catch (err) {
    console.error('Capture failed:', err);
  }

  return null;
}

function startServer(port) {
  const server = http.createServer((req, res) => {
    let filePath = '.' + req.url;
    if (filePath === './') {
      filePath = './index.html';
    }

    const extname = String(path.extname(filePath)).toLowerCase();
    const mimeTypes = {
      '.html': 'text/html',
      '.js': 'text/javascript',
      '.css': 'text/css',
      '.json': 'application/json',
      '.png': 'image/png',
      '.jpg': 'image/jpg',
      '.gif': 'image/gif',
      '.svg': 'image/svg+xml'
    };

    const contentType = mimeTypes[extname] || 'application/octet-stream';

    fs.readFile(filePath, (error, content) => {
      if (error) {
        if (error.code === 'ENOENT') {
          res.writeHead(404);
          res.end('Not Found');
        } else {
          res.writeHead(500);
          res.end('Server Error: ' + error.code);
        }
      } else {
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(content, 'utf-8');
      }
    });
  });

  server.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
  });
}

app.whenReady().then(() => {
  store = new Store();
  
  createWindow();
  createTray();
  registerShortcuts();
  startServer(5220);
  registerIpcHandlers();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map(x => {
    const hex = x.toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  }).join('');
}

ipcMain.handle('get-pixel-color', async (event, { x, y }) => {
  try {
    const robot = require('robotjs');
    const color = robot.getPixelColor(x, y);
    return { hex: '#' + color, x, y };
  } catch (e) {
    return null;
  }
});

ipcMain.handle('copy-to-clipboard', async (event, text) => {
  clipboard.writeText(text);
  return true;
});

ipcMain.handle('paste-from-clipboard', async () => {
  return clipboard.readText();
});

ipcMain.handle('toggle-always-on-top', async () => {
  toggleAlwaysOnTop();
  return isAlwaysOnTop;
});

ipcMain.handle('start-picker', async () => {
  startColorPicker();
  return true;
});

ipcMain.handle('close-picker', async () => {
  if (pickerWindow) {
    pickerWindow.close();
    pickerWindow = null;
  }
  return true;
});

ipcMain.handle('color-selected', async (event, color) => {
  if (pickerWindow) {
    pickerWindow.close();
    pickerWindow = null;
  }
  if (mainWindow) {
    mainWindow.show();
    mainWindow.focus();
    mainWindow.webContents.send('color-selected', color);
  }
  return true;
});

ipcMain.handle('get-screen-displays', async () => {
  return screen.getAllDisplays();
});

ipcMain.handle('get-mouse-position', async () => {
  return screen.getCursorScreenPoint();
});

ipcMain.handle('get-always-on-top-status', async () => {
  return isAlwaysOnTop;
});

ipcMain.handle('export-data', async (event, data) => {
  return JSON.stringify(data, null, 2);
});

ipcMain.handle('import-data', async (event, jsonString) => {
  try {
    return JSON.parse(jsonString);
  } catch (e) {
    return null;
  }
});

function registerIpcHandlers() {
  ipcMain.handle('store-get', async (event, key, defaultValue) => {
    return store ? store.get(key, defaultValue) : defaultValue;
  });

  ipcMain.handle('store-set', async (event, key, value) => {
    if (store) {
      store.set(key, value);
      return true;
    }
    return false;
  });

  ipcMain.handle('store-delete', async (event, key) => {
    if (store) {
      store.delete(key);
      return true;
    }
    return false;
  });
}
