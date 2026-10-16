import { BrowserWindow, nativeTheme, shell } from 'electron';

import { appOrigin } from './plugins/protocol/scheme.ts';

function openExternal(url: string) {
  if (/^https?:\/\//.test(url)) void shell.openExternal(url);
}

export function createMainWindow() {
  const mac = process.platform === 'darwin';
  const window = new BrowserWindow({
    width: 1120,
    height: 740,
    minWidth: 860,
    minHeight: 560,
    show: false,
    title: 'ohmyswitch',
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#0a0a0a' : '#ffffff',
    ...(mac ? { titleBarStyle: 'hiddenInset' as const, trafficLightPosition: { x: 16, y: 16 } } : {}),
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, spellcheck: false },
  });

  // Only app:// pages load inside the window; http(s) links open in the system browser.
  window.webContents.setWindowOpenHandler(({ url }) => {
    openExternal(url);
    return { action: 'deny' };
  });
  window.webContents.on('will-navigate', (event, url) => {
    if (url.startsWith(`${appOrigin}/`)) return;
    event.preventDefault();
    openExternal(url);
  });

  window.once('ready-to-show', () => window.show());
  void window.loadURL(`${appOrigin}/`);
  return window;
}
