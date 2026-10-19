import { type Context, Service } from 'cordis';
import { app, BrowserWindow, nativeTheme, shell } from 'electron';

import icon from '#build/icon.png?asset';
import macIcon from '#build/icon-mac.png?asset';

declare module 'cordis' {
  interface Context {
    window: WindowService;
  }
}

/**
 * Colors of the renderer's TopBar (`--sidebar` and `--sidebar-foreground` in styles.css), so the window controls
 * drawn over it blend in. Keep in sync with styles.css.
 */
function titleBarOverlay() {
  const dark = nativeTheme.shouldUseDarkColors;
  // The TopBar is 48px tall including its 1px bottom border, which the controls leave visible.
  return { color: dark ? '#000000' : '#fafafa', symbolColor: dark ? '#ededed' : '#171717', height: 47 };
}

function openExternal(url: string) {
  if (/^https?:\/\//.test(url)) void shell.openExternal(url);
}

/**
 * The main window. There is at most one; it is created on demand and forgotten once closed. It opens when the
 * service loads, which injecting the protocol orders after app:// is served.
 */
export class WindowService extends Service {
  static readonly inject = ['protocol'];
  /** Where the renderer is served; pages from anywhere else never load inside the window. */
  private readonly origin: string;
  private window: BrowserWindow | undefined;

  constructor(ctx: Context) {
    super(ctx, 'window');
    this.origin = ctx.protocol.origin;
  }

  [Service.init]() {
    this.show();
    return () => this.window?.destroy();
  }

  /** Bring the main window forward, creating it when there is none. */
  show() {
    if (!this.window) {
      this.window = this.create();
      this.window.once('closed', () => {
        this.window = undefined;
      });
      return;
    }
    if (this.window.isMinimized()) this.window.restore();
    this.window.focus();
  }

  private create() {
    const mac = process.platform === 'darwin';
    if (mac) app.dock?.setIcon(macIcon);
    const window = new BrowserWindow({
      width: 1120,
      height: 740,
      minWidth: 860,
      minHeight: 560,
      show: false,
      title: app.name,
      icon,
      backgroundColor: nativeTheme.shouldUseDarkColors ? '#0a0a0a' : '#ffffff',
      // No native title bar: the renderer's TopBar takes its place, with the system window controls drawn over it.
      ...(mac
        ? { titleBarStyle: 'hiddenInset' as const, trafficLightPosition: { x: 16, y: 16 } }
        : { titleBarStyle: 'hidden' as const, titleBarOverlay: titleBarOverlay() }),
      webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, spellcheck: false },
    });

    window.on('page-title-updated', (event) => event.preventDefault());

    if (!mac) {
      const updateOverlay = () => window.setTitleBarOverlay(titleBarOverlay());
      nativeTheme.on('updated', updateOverlay);
      window.once('closed', () => nativeTheme.off('updated', updateOverlay));
    }

    // Only app:// pages load inside the window; http(s) links open in the system browser.
    window.webContents.setWindowOpenHandler(({ url }) => {
      openExternal(url);
      return { action: 'deny' };
    });
    window.webContents.on('will-navigate', (event, url) => {
      if (url.startsWith(`${this.origin}/`)) return;
      event.preventDefault();
      openExternal(url);
    });

    window.once('ready-to-show', () => window.show());
    void window.loadURL(`${this.origin}/`);
    return window;
  }
}
