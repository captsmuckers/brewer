const { app, BrowserWindow, session, desktopCapturer, ipcMain } = require('electron');
const path = require('path');

let pickerCallback;

function createWindow() {
  const win = new BrowserWindow({
    width: 1920,
    height: 1080,
    title: "Brewer", // Forces the app name
    icon: path.join(__dirname, 'icon.ico'), // Loads your custom logo
    autoHideMenuBar: true, 
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webviewTag: true // MUST be true to allow embedding the Sharkord servers
    }
  });

  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    const allowedPermissions = ['media', 'display-capture'];
    if (allowedPermissions.includes(permission)) {
      callback(true);
    } else {
      callback(false);
    }
  });

  session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
    pickerCallback = callback; 

    desktopCapturer.getSources({ types: ['screen', 'window'], thumbnailSize: { width: 400, height: 400 } }).then((sources) => {
      const sourcesList = sources.map(s => ({
         id: s.id,
         name: s.name,
         thumbnail: s.thumbnail.toDataURL()
      }));

      const pickerWin = new BrowserWindow({
        width: 800,
        height: 600,
        modal: true, 
        parent: win,
        autoHideMenuBar: true,
        webPreferences: {
          preload: path.join(__dirname, 'preload.js'),
          contextIsolation: true
        }
      });

      pickerWin.loadFile('picker.html');

      pickerWin.webContents.once('did-finish-load', () => {
        pickerWin.webContents.send('set-sources', sourcesList);
      });

      pickerWin.on('closed', () => {
        if (pickerCallback) {
          pickerCallback(); 
          pickerCallback = null;
        }
      });

    }).catch((err) => {
      console.error('Error fetching sources:', err);
      if (pickerCallback) pickerCallback(); 
    });
  });

  // Load our custom Discord-style shell instead of a raw URL
  win.loadFile('index.html'); 
}

ipcMain.on('source-selected', (event, sourceId) => {
    desktopCapturer.getSources({ types: ['screen', 'window'] }).then(sources => {
        const selectedSource = sources.find(s => s.id === sourceId);
        if (pickerCallback && selectedSource) {
            pickerCallback({ video: selectedSource });
            pickerCallback = null;
        }
        BrowserWindow.fromWebContents(event.sender).close();
    });
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});