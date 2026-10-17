import { app, BrowserWindow, dialog } from 'electron';

import { createApp } from './app.ts';
import { applyUserDataOverride, loadConfig } from './config.ts';
import type { AppContext } from './kernel.ts';
import { globalLogger } from './logging.ts';
import { registerAppScheme } from './plugins/protocol/scheme.ts';
import { createMainWindow } from './window.ts';

applyUserDataOverride();
registerAppScheme();

let ctx: AppContext | undefined;
let stopping = false;

function focusOrCreateWindow() {
  const [window] = BrowserWindow.getAllWindows();
  if (!window) {
    createMainWindow();
    return;
  }
  if (window.isMinimized()) window.restore();
  window.focus();
}

async function start() {
  await app.whenReady();
  try {
    ctx = createApp(loadConfig());
    await ctx.start();
  } catch (error) {
    globalLogger.error('Startup failed', error);
    dialog.showErrorBox('ohmyswitch 启动失败', error instanceof Error ? error.message : String(error));
    app.exit(1);
    return;
  }
  createMainWindow();
  app.on('activate', focusOrCreateWindow);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', focusOrCreateWindow);
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
  // Stop the kernel before quitting so in-flight writes finish and services are disposed.
  app.on('before-quit', (event) => {
    if (!ctx || stopping) return;
    event.preventDefault();
    stopping = true;
    ctx
      .stop()
      .catch((error: unknown) => globalLogger.error('Shutdown failed', error))
      .finally(() => {
        ctx = undefined;
        app.quit();
      });
  });
  void start();
}
