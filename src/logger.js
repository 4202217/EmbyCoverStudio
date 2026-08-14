import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR } from './config.js';

const LOG_DIR = path.join(DATA_DIR, 'logs');
const LOG_FILE = path.join(LOG_DIR, 'app.log');
const LOG_MAX_BYTES = 5 * 1024 * 1024; // 5MB，超过后轮转为 app.log.1

let sink = null;
let logDirReady = false;

export function setLogSink(store) {
  sink = store;
}

function writeFileLog(line) {
  try {
    if (!logDirReady) {
      fs.mkdirSync(LOG_DIR, { recursive: true });
      logDirReady = true;
    }
    fs.appendFileSync(LOG_FILE, line + '\n');
    // 轮转：超过阈值时把当前文件重命名为 .1（保留最近两段）
    const st = fs.statSync(LOG_FILE);
    if (st.size > LOG_MAX_BYTES) {
      fs.renameSync(LOG_FILE, LOG_FILE + '.1');
    }
  } catch {
    // 文件日志失败不影响运行
  }
}

function fmt(level, message) {
  const ts = new Date().toLocaleString('zh-CN', { hour12: false });
  const line = '[' + ts + '] [' + level + '] ' + message;
  console.log(line);
  writeFileLog(line);
}

export function log(level, message) {
  fmt(level, message);
  if (sink) sink.addLog(level, message);
}

export const info = (m) => log('info', m);
export const warn = (m) => log('warn', m);
export const error = (m) => log('error', m);
