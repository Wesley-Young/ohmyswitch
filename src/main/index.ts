import { Context, type Fiber } from 'cordis';
import { app, dialog } from 'electron';

import { FiberState } from '#core/cordis.ts';
import { findLink, linkScheme } from '#core/deep-links/link.ts';
import type { DeepLinkService } from '#core/deep-links/service.ts';
import { App } from './app.ts';
import { type AppConfig, applyUserDataOverride, loadConfig } from './config.ts';
import { logError, logExporter } from './logging.ts';
import { registerAppScheme } from './plugins/protocol/scheme.ts';
import type { WindowService } from './plugins/window/service.ts';

// Process-level lifecycle only: the single-instance lock, startup, shutdown and receiving `ohmyswitch://` links.
// Everything else is a plugin.
app.setName('ohmyswitch');
if (process.platform === 'win32') app.setAppUserModelId('io.github.wesley-young.ohmyswitch');
applyUserDataOverride();
registerAppScheme();

/** The running app; disposed before quitting. */
let main: Fiber | undefined;
/** The services the process hands windows and links to, while they are available. */
let shell: { deepLinks: DeepLinkService; window: WindowService } | undefined;
/** Links that arrive before startup finishes (macOS delivers the launching link this early). */
const queuedLinks: string[] = [];

/** Before startup finishes there is nothing to show; the window service opens the window when it loads. */
function showWindow() {
  shell?.window.show();
}

function openLink(link: string) {
  if (!shell) {
    queuedLinks.push(link);
    return;
  }
  shell.deepLinks.open(link);
  shell.window.show();
}

/** Startup cannot continue. */
function fail(error: unknown) {
  dialog.showErrorBox('ohmyswitch 启动失败', error instanceof Error ? error.message : String(error));
  app.exit(1);
}

/** The app and what the process needs from it, as one plugin so that one dispose stops everything. */
const Main = {
  name: 'main',
  apply(ctx: Context, config: AppConfig) {
    // Without a core plugin, everything that depends on it waits forever, so its failure ends startup. Harness
    // plugins (those with a plugins.yml entry) may fail on their own; the plugin list shows it.
    // `await()` rethrows the fiber's error, the only public way to read it.
    ctx.on('internal/status', (fiber) => {
      if (fiber.state === FiberState.FAILED && !fiber.entry) fiber.await().catch(fail);
    });
    ctx.plugin(App, config);
    ctx.inject(['deepLinks', 'window'], (ctx) => {
      shell = { deepLinks: ctx.deepLinks, window: ctx.window };
      for (const link of queuedLinks.splice(0)) openLink(link);
      return () => {
        shell = undefined;
      };
    });
  },
};

async function start() {
  const config = loadConfig();
  await app.whenReady();
  const root = new Context();
  root.logger.exporter(logExporter);
  main = root.plugin(Main, config);
  app.on('activate', showWindow);
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

  // Dispose the app before quitting. Dependents unload before the services they use, so in-flight writes finish
  // first.
  app.on('before-quit', (event) => {
    if (!main) return;
    event.preventDefault();
    const fiber = main;
    main = undefined;
    fiber
      .dispose()
      .catch((error: unknown) => logError('Shutdown failed', error))
      .finally(() => app.quit());
  });

  // Plugin failures are logged by cordis; anything else that stops startup is logged here.
  start().catch((error: unknown) => {
    logError('Startup failed', error);
    fail(error);
  });
}
