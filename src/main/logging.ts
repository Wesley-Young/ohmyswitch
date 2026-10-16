import { Logger, type LogHandler } from '@fraqjs/kernel';

export const logHandler: LogHandler = ({ level, module, message, error, time }) => {
  const line = `${new Date(time).toISOString()} ${level.toUpperCase()} [${module}] ${message}`;
  if (error === undefined) console[level](line);
  else console[level](line, error);
};

export const globalLogger = new Logger(logHandler, 'ohmyswitch');
