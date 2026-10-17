import { type Exporter, Logger, type LoggerType } from 'cordis';

import { inspect } from 'node:util';

const describe = (value: unknown) =>
  value instanceof Error ? (value.stack ?? value.message) : inspect(value, { depth: 4, breakLength: Infinity });

const line = (type: LoggerType, name: string, text: string, time = Date.now()) =>
  `${new Date(time).toISOString()} ${type.toUpperCase()} [${name}] ${text}`;

/** Writes cordis log messages to the console, with errors as stack traces. */
export const logExporter: Exporter = {
  colors: false,
  formatters: { o: describe, O: describe },
  export(message) {
    console[message.type](line(message.type, message.name, Logger.format(logExporter, message), message.ts));
  },
};

/** For the process itself, before or outside the plugin tree. */
export function logError(message: string, error?: unknown) {
  console.error(line('error', 'ohmyswitch', error === undefined ? message : `${message}: ${describe(error)}`));
}
