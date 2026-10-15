import { app, BrowserWindow, ipcMain, dialog, protocol, net, shell } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';
import {
  createProject,
  openProject,
  readProject,
  commitChanges,
  closeProject,
  session,
  errorResult,
} from './projects/project-service';
import { atomicWrite, inside } from './projects/manifest';
import { createBackup, listBackups, restoreBackup, hashFile } from './projects/backup';
import { exportProject, importProject } from './projects/archive';
import { importAsset, resolveAsset } from './assets/asset-service';
import { HandlePermissions } from './ipc/permissions';
import { queueOpenRequest, drainOpenRequests } from './desktop/open-requests';
import { exportRelease } from './projects/release-export';
import { ok, err, ChangeSchema, ScopeSchema, uid, type Result } from '../shared/model';
import { parseMetrics } from '../domain/distribution/metrics';
import type { OpenedProject } from '../shared/ipc';
const windows = new Map<number, { win: BrowserWindow; handle?: string; allowClose: boolean }>();
const permissions = new HandlePermissions();
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'drama',
    privileges: { secure: true, standard: true, supportFetchAPI: true, stream: true },
  },
]);
const recentFile = () => path.join(app.getPath('userData'), 'recent.json');
function recent(): { name: string; path: string }[] {
  try {
    return z
      .array(z.object({ name: z.string(), path: z.string() }))
      .parse(JSON.parse(fs.readFileSync(recentFile(), 'utf8')));
  } catch {
    return [];
  }
}
function remember(handle: string) {
  const s = session(handle);
  atomicWrite(
    recentFile(),
    JSON.stringify(
      [
        { path: s.file, name: readName(handle) },
        ...recent().filter((r) => r.path !== s.file),
      ].slice(0, 20),
    ),
  );
}
function readName(h: string) {
  return path.basename(session(h).file, '.aidrama');
}
async function info(h: string): Promise<Result<OpenedProject>> {
  const r = await readProject(h);
  return r.ok ? ok({ handle: h, snapshot: r.value }) : r;
}
function makeWindow(handle?: string) {
  const win = new BrowserWindow({
    width: 1536,
    height: 1000,
    minWidth: 1000,
    minHeight: 700,
    title: '幕作 · AI Drama Studio',
    backgroundColor: '#101218',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  const senderId = win.webContents.id;
  const state = { win, handle, allowClose: false };
  windows.set(win.webContents.id, state);
  if (handle) permissions.grant(win.webContents.id, handle);
  win.on('ready-to-show', () => win.show());
  win.on('close', (event) => {
    if (state.handle && !state.allowClose) {
      event.preventDefault();
      win.webContents.send('drama:close-request');
    }
  });
  win.on('closed', () => {
    permissions.revoke(senderId);
    windows.delete(senderId);
    if (state.handle) void closeProject(state.handle);
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event, url) => {
    if (url !== win.webContents.getURL()) event.preventDefault();
  });
  if (process.env.ELECTRON_RENDERER_URL) void win.loadURL(process.env.ELECTRON_RENDERER_URL);
  else void win.loadFile(path.join(__dirname, '../renderer/index.html'));
  return state;
}
async function attach(sender: number, handle: string) {
  const w = windows.get(sender)!;
  if (w.handle && w.handle !== handle) {
    makeWindow(handle);
    remember(handle);
    return err('OTHER_WINDOW', '專案已在新視窗開啟');
  }
  w.handle = handle;
  permissions.grant(sender, handle);
  remember(handle);
  return info(handle);
}
async function openFile(file: string, sender?: number) {
  const canonical = fs.existsSync(file) ? fs.realpathSync(file) : file;
  for (const w of windows.values())
    if (w.handle && session(w.handle).file === canonical) {
      w.win.show();
      w.win.focus();
      return sender === w.win.webContents.id
        ? info(w.handle)
        : err('OTHER_WINDOW', '專案已在另一視窗開啟');
    }
  const r = await openProject(file);
  if (!r.ok) return r;
  if (sender) return attach(sender, r.value);
  makeWindow(r.value);
  remember(r.value);
  return info(r.value);
}
function handlers() {
  const handle = (name: string, fn: (sender: number, ...args: any[]) => Promise<unknown>) =>
    ipcMain.handle('drama:' + name, async (event, ...args) => {
      try {
        if (!windows.has(event.sender.id) || event.senderFrame !== event.sender.mainFrame)
          return err('DENIED', '不允許此視窗操作');
        return await fn(event.sender.id, ...args);
      } catch (e) {
        return errorResult(e);
      }
    });
  const requireHandle = (sender: number, h: unknown) => {
    const value = z.uuid().parse(h);
    if (!permissions.check(sender, value)) throw Error('不允許操作其他專案');
    return value;
  };
  const win = (sender: number) => windows.get(sender)!.win;
  handle('initial', async (sender) => {
    const h = windows.get(sender)!.handle;
    return h ? info(h) : ok(null);
  });
  handle('recent', async () => ok(recent()));
  handle('create', async (sender, name) => {
    const n = z.string().min(1).max(200).parse(name);
    const r = await dialog.showSaveDialog(win(sender), {
      title: '建立劇集專案',
      defaultPath: n.replace(/[\\/:*?"<>|]/g, '_') + '.aidrama',
      filters: [{ name: 'AI Drama 專案', extensions: ['aidrama'] }],
    });
    if (r.canceled || !r.filePath) return err('CANCELLED', '已取消');
    const created = await createProject(r.filePath, n);
    return created.ok ? attach(sender, created.value) : created;
  });
  handle('open', async (sender) => {
    const r = await dialog.showOpenDialog(win(sender), {
      properties: ['openFile'],
      filters: [{ name: 'AI Drama 專案', extensions: ['aidrama'] }],
    });
    return r.canceled ? err('CANCELLED', '已取消') : openFile(r.filePaths[0], sender);
  });
  handle('openRecent', async (sender, file) => {
    const f = z.string().parse(file);
    if (!recent().some((r) => r.path === f)) throw Error('專案不在最近清單');
    return openFile(f, sender);
  });
  handle('read', async (sender, h) => readProject(requireHandle(sender, h)));
  handle('commit', async (sender, h, changes) =>
    commitChanges(requireHandle(sender, h), z.array(ChangeSchema).max(1000).parse(changes)),
  );
  handle('importAssets', async (sender, h) => {
    h = requireHandle(sender, h);
    const r = await dialog.showOpenDialog(win(sender), {
      properties: ['openFile', 'multiSelections'],
      title: '匯入素材',
    });
    if (r.canceled) return err('CANCELLED', '已取消');
    for (const f of r.filePaths) {
      const imported = await importAsset(h, f);
      if (!imported.ok) return imported;
    }
    return readProject(h);
  });
  handle('exportProject', async (sender, h) => {
    h = requireHandle(sender, h);
    const d = await dialog.showSaveDialog(win(sender), {
      defaultPath: readName(h) + '.aidrama.zip',
      filters: [{ name: '完整專案', extensions: ['zip'] }],
    });
    if (d.canceled || !d.filePath) return err('CANCELLED', '已取消');
    const r = await exportProject(h, d.filePath);
    return r.ok ? ok(d.filePath) : r;
  });
  handle('importProject', async (sender) => {
    const zip = await dialog.showOpenDialog(win(sender), {
      properties: ['openFile'],
      filters: [{ name: '完整專案', extensions: ['zip'] }],
    });
    if (zip.canceled) return err('CANCELLED', '已取消');
    const destination = await dialog.showOpenDialog(win(sender), {
      properties: ['openDirectory', 'createDirectory'],
      title: '選擇匯入父目錄',
    });
    if (destination.canceled) return err('CANCELLED', '已取消');
    const r = await importProject(
      zip.filePaths[0],
      path.join(destination.filePaths[0], '劇集-' + uid().slice(0, 8)),
    );
    return r.ok ? attach(sender, r.value) : r;
  });
  handle('backup', async (sender, h) => {
    h = requireHandle(sender, h);
    const r = await createBackup(h);
    return r.ok ? ok(r.value.createdAt) : r;
  });
  handle('backups', async (sender, h) => ok(listBackups(requireHandle(sender, h))));
  handle('restore', async (sender, h, id) =>
    restoreBackup(requireHandle(sender, h), z.uuid().parse(id)),
  );
  handle('repair', async (sender, h, id) => {
    h = requireHandle(sender, h);
    const target = resolveAsset(h, z.uuid().parse(id));
    const data = await readProject(h);
    if (!data.ok) return data;
    const asset = data.value.assets.find((a) => a.id === id)!;
    const d = await dialog.showOpenDialog(win(sender), {
      title: '選擇原始素材（內容必須相同）',
      properties: ['openFile'],
    });
    if (d.canceled) return err('CANCELLED', '已取消');
    if ((await hashFile(d.filePaths[0])) !== asset.sha256)
      throw Error('內容不同，請改用匯入新素材建立版本');
    await fs.promises.copyFile(d.filePaths[0], target);
    return readProject(h);
  });
  handle('saveText', async (sender, name, text) => {
    const n = z.string().max(200).parse(name),
      t = z
        .string()
        .max(20 * 1024 ** 2)
        .parse(text);
    if (!/\.(json|csv|md|srt|vtt|txt)$/.test(n) || n !== path.basename(n))
      throw Error('不支援的匯出格式');
    const d = await dialog.showSaveDialog(win(sender), { defaultPath: n });
    if (d.canceled || !d.filePath) return err('CANCELLED', '已取消');
    atomicWrite(d.filePath, t);
    return ok(d.filePath);
  });
  handle('importMetrics', async (sender, h) => {
    h = requireHandle(sender, h);
    const d = await dialog.showOpenDialog(win(sender), {
      properties: ['openFile'],
      filters: [{ name: '數據 CSV', extensions: ['csv'] }],
    });
    if (d.canceled) return err('CANCELLED', '已取消');
    if (fs.statSync(d.filePaths[0]).size > 20 * 1024 ** 2) throw Error('CSV 檔過大');
    const parsed = parseMetrics(fs.readFileSync(d.filePaths[0], 'utf8'));
    if (!parsed.ok) return parsed;
    const consent = await dialog.showMessageBox(win(sender), {
      type: 'question',
      message: `將匯入 ${parsed.value.length} 筆數據`,
      detail: JSON.stringify(parsed.value.slice(0, 3), null, 2),
      buttons: ['取消', '匯入'],
      defaultId: 0,
      cancelId: 0,
    });
    if (consent.response !== 1) return err('CANCELLED', '已取消');
    const current = await readProject(h);
    if (!current.ok) return current;
    const all = [...current.value.metrics, ...parsed.value];
    const rows = [...new Map(all.map((r) => [JSON.stringify(r), r])).values()];
    return commitChanges(h, [{ type: 'records', collection: 'metrics', rows }]);
  });
  handle('release', async (sender, h, scope) => {
    h = requireHandle(sender, h);
    const sc = ScopeSchema.parse(scope);
    const d = await dialog.showSaveDialog(win(sender), {
      defaultPath: readName(h) + '-發行包.zip',
    });
    if (d.canceled || !d.filePath) return err('CANCELLED', '已取消');
    return exportRelease(h, sc, d.filePath);
  });
  handle('openExternal', async (_, url) => {
    const u = new URL(z.string().max(2048).parse(url));
    if (u.protocol !== 'https:' || u.username || u.password) throw Error('只允許 HTTPS 工具網址');
    await shell.openExternal(u.toString());
    return ok(undefined);
  });
  ipcMain.on('drama:close-response', (e, allowed) => {
    const state = windows.get(e.sender.id);
    if (state && allowed === true) {
      state.allowClose = true;
      state.win.close();
    }
  });
}
app.on('open-file', (e, file) => {
  e.preventDefault();
  queueOpenRequest(file);
  if (app.isReady())
    void drainOpenRequests(async (f) => {
      await openFile(f);
    });
});
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', (_, argv) => {
    for (const arg of argv) queueOpenRequest(arg);
    void drainOpenRequests(async (f) => {
      await openFile(f);
    });
  });
  app.whenReady().then(async () => {
    fs.mkdirSync(app.getPath('userData'), { recursive: true });
    protocol.handle('drama', async (request) => {
      try {
        const u = new URL(request.url);
        const file = resolveAsset(u.hostname, u.pathname.slice(1));
        return net.fetch(pathToFileURL(file).toString(), { headers: request.headers });
      } catch {
        return new Response('Asset unavailable', { status: 404 });
      }
    });
    handlers();
    for (const arg of process.argv.slice(1)) queueOpenRequest(arg);
    await drainOpenRequests(async (file) => {
      const r = await openFile(file);
      if (!r.ok) dialog.showErrorBox('無法開啟專案', r.error.message);
    });
    if (!windows.size) makeWindow();
  });
}
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
app.on('activate', () => {
  if (!windows.size) makeWindow();
});
