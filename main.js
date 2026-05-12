const { app, BrowserWindow } = require('electron');
const { exec } = require('child_process');
const path = require('path');

let serverProcess = null;
let mainWindow = null;

function startServer() {
    serverProcess = exec('node server.js', { cwd: __dirname });
    serverProcess.stdout.on('data', (data) => console.log(data));
    serverProcess.stderr.on('data', (data) => console.error(data));
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 720,
        webPreferences: { nodeIntegration: false, contextIsolation: true }
    });
    mainWindow.loadURL('http://localhost:3000');
}

app.whenReady().then(() => {
    startServer();
    setTimeout(createWindow, 1000);
});

app.on('window-all-closed', () => {
    if (serverProcess) serverProcess.kill();
    app.quit();
});