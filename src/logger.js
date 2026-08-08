let sink = null;

export function setLogSink(store) {
  sink = store;
}

function fmt(level, message) {
  const ts = new Date().toLocaleString('zh-CN', { hour12: false });
  console.log(`[${ts}] [${level}] ${message}`);
}

export function log(level, message) {
  fmt(level, message);
  if (sink) sink.addLog(level, message);
}

export const info = (m) => log('info', m);
export const warn = (m) => log('warn', m);
export const error = (m) => log('error', m);
