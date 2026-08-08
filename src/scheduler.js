const FIELD_RANGES = {
  minute: [0, 59],
  hour: [0, 23],
  dom: [1, 31],
  month: [1, 12],
  dow: [0, 6]
};

function parseField(field, name) {
  const [min, max] = FIELD_RANGES[name];
  const out = new Set();
  for (const part of String(field).split(',')) {
    const p = part.trim();
    if (p === '*') {
      for (let i = min; i <= max; i += 1) out.add(i);
      continue;
    }
    const star = p.startsWith('*');
    const m = p.match(/^(\d+)(?:-(\d+))?(?:\/(\d+))?$/);
    let a;
    let b;
    let step;
    if (star) {
      const sm = p.match(/^\*\/(\d+)$/);
      if (!sm) throw new Error(`cron 字段 "${part}" 格式错误`);
      a = min;
      b = max;
      step = Number(sm[1]);
    } else {
      if (!m) throw new Error(`cron 字段 "${part}" 格式错误`);
      a = Number(m[1]);
      b = m[2] ? Number(m[2]) : a;
      step = m[3] ? Number(m[3]) : 1;
    }
    if (a < min || b > max || a > b || step < 1) {
      throw new Error(`cron 字段 "${part}" 超出范围 ${min}-${max}`);
    }
    for (let i = a; i <= b; i += step) out.add(i);
  }
  return out;
}

export function parseCron(expr) {
  const parts = String(expr || '').trim().split(/\s+/);
  if (parts.length !== 5) throw new Error('cron 表达式需要 5 段（分 时 日 月 周），例如 0 */6 * * *');
  return {
    minute: parseField(parts[0], 'minute'),
    hour: parseField(parts[1], 'hour'),
    dom: parseField(parts[2], 'dom'),
    month: parseField(parts[3], 'month'),
    dow: parseField(parts[4], 'dow')
  };
}

export function matches(spec, date) {
  const parts = {
    minute: date.getMinutes(),
    hour: date.getHours(),
    dom: date.getDate(),
    month: date.getMonth() + 1,
    dow: date.getDay()
  };
  if (!spec.minute.has(parts.minute)) return false;
  if (!spec.hour.has(parts.hour)) return false;
  if (!spec.month.has(parts.month)) return false;
  const domStar = spec.dom.size >= 31;
  const dowStar = spec.dow.size >= 7;
  if (!domStar && !dowStar) return spec.dom.has(parts.dom) || spec.dow.has(parts.dow);
  if (!domStar) return spec.dom.has(parts.dom);
  if (!dowStar) return spec.dow.has(parts.dow);
  return true;
}

function minuteKey(date) {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}-${date.getHours()}-${date.getMinutes()}`;
}

export class Scheduler {
  constructor() {
    this.jobs = [];
    this.timer = null;
  }

  add(name, expr, fn) {
    const spec = parseCron(expr);
    this.remove(name);
    this.jobs.push({ name, expr, spec, fn, running: false, lastFiredKey: '' });
    return this;
  }

  remove(name) {
    this.jobs = this.jobs.filter((j) => j.name !== name);
  }

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(), 30000);
    this.tick();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  tick() {
    const now = new Date();
    const key = minuteKey(now);
    for (const job of this.jobs) {
      if (job.running || job.lastFiredKey === key) continue;
      if (!matches(job.spec, now)) continue;
      job.lastFiredKey = key;
      job.running = true;
      Promise.resolve()
        .then(() => job.fn())
        .catch((e) => console.error(`[scheduler] ${job.name} 执行失败:`, e))
        .finally(() => {
          job.running = false;
        });
    }
  }

  list() {
    return this.jobs.map((j) => ({ name: j.name, expr: j.expr }));
  }
}
