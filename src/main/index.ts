import { app, dialog } from 'electron';

import { findLink, linkScheme } from '../core/deep-links/link.ts';
import { DeepLinkService } from '../core/deep-links/service.ts';
import type { AppContext } from '../core/kernel.ts';
import { createApp } from './app.ts';
import { applyUserDataOverride, loadConfig } from './config.ts';
import { globalLogger } from './logging.ts';
import { registerAppScheme } from './plugins/protocol/scheme.ts';
import { WindowService } from './plugins/window/service.ts';

// Process-level lifecycle only: the single-instance lock, startup, shutdown and receiving `ohmyswitch://` links.
// Everything else is a plugin.
app.setName('ohmyswitch');
if (process.platform === 'win32') app.setAppUserModelId('io.github.wesley-young.ohmyswitch');
applyUserDataOverride();
registerAppScheme();

let ctx: AppContext | undefined;
let stopping = false;
/** Links that arrive before startup finishes (macOS delivers the launching link this early). */
const queuedLinks: string[] = [];

/** Before startup finishes there is nothing to show; the window plugin opens the window when it starts. */
function showWindow() {
  if (ctx?.state === 'started') ctx.resolve(WindowService).show();
}

function openLink(link: string) {
  if (ctx?.state !== 'started') {
    queuedLinks.push(link);
    return;
  }
  ctx.resolve(DeepLinkService).open(link);
  showWindow();
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
  for (const link of queuedLinks.splice(0)) openLink(link);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  // Only the packaged app registers, so a development build does not take links from the installed one.
  if (app.isPackaged) app.setAsDefaultProtocolClient(linkScheme);
  // macOS hands links to the running app; Windows and Linux start a second instance with the link in argv.
  app.on('open-url', (event, link) => {
    event.preventDefault();
    openLink(link);
  });
  app.on('second-instance', (_event, argv) => {
    const link = findLink(argv);
    if (link) openLink(link);
    else showWindow();
  });
  const launchLink = findLink(process.argv);
  if (launchLink) openLink(launchLink);
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
