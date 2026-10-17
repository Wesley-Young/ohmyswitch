import { type Exporter, Logger, type LoggerType } from 'cordis';
import log from 'electron-log/node';

import { join } from 'node:path';
import { inspect } from 'node:util';

const describe = (value: unknown) =>
  value instanceof Error ? (value.stack ?? value.message) : inspect(value, { depth: 4, breakLength: Infinity });

const line = (type: LoggerType, name: string, text: string, time = Date.now()) =>
  `${new Date(time).toISOString()} ${type.toUpperCase()} [${name}] ${text}`;

// electron-log only carries lines formatted here: to the console, and to a file once `openLogFile` names one. The
// Node entry is used because the Electron one registers IPC handlers.
log.transports.console.format = '{text}';
log.transports.file.format = '{text}';
log.transports.file.level = false;

/**
 * Also write logs to `ohmyswitch.log` in `dir`; past 5 MB it becomes `ohmyswitch.old.log`. Writes are synchronous,
 * so the message explaining a startup failure is on disk before the process exits. Only the instance holding the
 * single-instance lock may call this, so two processes never rotate the same file.
 */
export function openLogFile(dir: string) {
  const file = log.transports.file;
  file.resolvePathFn = () => join(dir, 'ohmyswitch.log');
  file.maxSize = 5 * 1024 * 1024;
  file.writeOptions = { ...file.writeOptions, mode: 0o600 };
  file.level = 'debug';
}

/** Writes cordis log messages to the console and the log file, with errors as stack traces. */
export const logExporter: Exporter = {
  colors: false,
  formatters: { o: describe, O: describe },
  export(message) {
    log[message.type](line(message.type, message.name, Logger.format(logExporter, message), message.ts));
  },
};

/** For the process itself, before or outside the plugin tree. */
export function logError(message: string, error?: unknown) {
  log.error(line('error', 'ohmyswitch', error === undefined ? message : `${message}: ${describe(error)}`));
}
