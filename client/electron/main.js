const { app, BrowserWindow, Menu, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const convStore = require('./store');

const isDev = process.env.NODE_ENV === 'development';

function createWindow() {
  const win = new BrowserWindow({
    width: 1100,
    height: 760,
    minWidth: 720,
    minHeight: 520,
    title: '桌面 AI 助手',
    backgroundColor: '#f5f6f7',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  Menu.setApplicationMenu(null);

  if (isDev) {
    win.loadURL('http://localhost:5173');
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  return win;
}

/**
 * 注册会话相关 IPC
 * 前端通过 window.api.conv.* 调用
 */
function registerConvIpc() {
  ipcMain.handle('conv:list', () => convStore.list());
  ipcMain.handle('conv:get', (_e, id) => convStore.get(id));
  ipcMain.handle('conv:getActiveId', () => convStore.getActiveId());
  ipcMain.handle('conv:setActiveId', (_e, id) => convStore.setActiveId(id));
  ipcMain.handle('conv:create', (_e, payload) => convStore.create(payload || {}));
  ipcMain.handle('conv:update', (_e, id, patch) => convStore.update(id, patch));
  ipcMain.handle('conv:appendMessage', (_e, id, message) =>
    convStore.appendMessage(id, message)
  );
  ipcMain.handle('conv:updateMessage', (_e, id, index, patch) =>
    convStore.updateMessage(id, index, patch)
  );
  ipcMain.handle('conv:remove', (_e, id) => convStore.remove(id));

  // 导出为 Markdown：弹出保存对话框
  ipcMain.handle('conv:exportMarkdown', async (e, id) => {
    const conv = convStore.get(id);
    if (!conv) return { ok: false, error: 'conversation not found' };
    const win = BrowserWindow.fromWebContents(e.sender);
    const defaultName =
      (conv.title || 'conversation').replace(/[\\/:*?"<>|]/g, '_') + '.md';
    const result = await dialog.showSaveDialog(win, {
      title: '导出会话为 Markdown',
      defaultPath: defaultName,
      filters: [{ name: 'Markdown', extensions: ['md'] }]
    });
    if (result.canceled || !result.filePath) {
      return { ok: false, canceled: true };
    }
    const md = convStore.toMarkdown(id);
    try {
      fs.writeFileSync(result.filePath, md, 'utf-8');
      return { ok: true, path: result.filePath };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });
}

app.whenReady().then(() => {
  registerConvIpc();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
