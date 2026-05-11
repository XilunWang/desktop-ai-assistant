const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('appInfo', {
  platform: process.platform,
  versions: process.versions
});

/**
 * 会话存储 API
 * 在渲染层用：window.api.conv.list() 等
 */
const conv = {
  list: () => ipcRenderer.invoke('conv:list'),
  get: (id) => ipcRenderer.invoke('conv:get', id),
  getActiveId: () => ipcRenderer.invoke('conv:getActiveId'),
  setActiveId: (id) => ipcRenderer.invoke('conv:setActiveId', id),
  create: (payload) => ipcRenderer.invoke('conv:create', payload),
  update: (id, patch) => ipcRenderer.invoke('conv:update', id, patch),
  appendMessage: (id, message) =>
    ipcRenderer.invoke('conv:appendMessage', id, message),
  updateMessage: (id, index, patch) =>
    ipcRenderer.invoke('conv:updateMessage', id, index, patch),
  remove: (id) => ipcRenderer.invoke('conv:remove', id),
  exportMarkdown: (id) => ipcRenderer.invoke('conv:exportMarkdown', id)
};

contextBridge.exposeInMainWorld('api', { conv });
