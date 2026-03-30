const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };

let minLevel = LEVELS.info;

export function setLevel(level) {
  minLevel = LEVELS[level] ?? LEVELS.info;
}

function log(level, ...args) {
  if (LEVELS[level] < minLevel) return;
  const ts = new Date().toISOString();
  const tag = level.toUpperCase().padEnd(5);
  console.log(`[${ts}] [${tag}]`, ...args);
}

export const debug = (...args) => log('debug', ...args);
export const info = (...args) => log('info', ...args);
export const warn = (...args) => log('warn', ...args);
export const error = (...args) => log('error', ...args);
