import { contextBridge, ipcRenderer } from 'electron';
import type { DramaAPI } from '../shared/ipc';
const api: Record<string, unknown> = {};
for (const name of [
  'initial',
  'create',
  'open',
  'recent',
  'openRecent',
  'read',
  'commit',
  'importAssets',
  'exportProject',
  'importProject',
  'backup',
  'backups',
  'restore',
  'repair',
  'saveText',
  'importMetrics',
  'release',
  'openExternal',
])
  api[name] = (...args: unknown[]) => ipcRenderer.invoke('drama:' + name, ...args);
api.onCloseRequest = (callback: () => Promise<boolean>) => {
  const listener = () => {
    void callback().then((ok) => ipcRenderer.send('drama:close-response', ok));
  };
  ipcRenderer.on('drama:close-request', listener);
  return () => ipcRenderer.removeListener('drama:close-request', listener);
};
contextBridge.exposeInMainWorld('drama', api as unknown as DramaAPI);
