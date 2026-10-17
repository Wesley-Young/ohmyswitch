import { app, dialog } from 'electron';

import type { AppContext } from '../core/kernel.ts';
import { createApp } from './app.ts';
import { applyUserDataOverride, loadConfig } from './config.ts';
import { globalLogger } from './logging.ts';
import { registerAppScheme } from './plugins/protocol/scheme.ts';
import { WindowService } from './plugins/window/service.ts';

// Process-level lifecycle only: the single-instance lock, startup and shutdown. Everything else is a plugin.
applyUserDataOverride();
registerAppScheme();

let ctx: AppContext | undefined;
let stopping = false;

/** Before startup finishes there is nothing to show; the window plugin opens the window when it starts. */
function showWindow() {
  if (ctx?.state === 'started') ctx.resolve(WindowService).show();
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
  app.on('activate', showWindow);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', showWindow);
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
