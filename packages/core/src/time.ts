export type Weekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

export interface LocalParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: Weekday;
  /** HH:MM no fuso local. */
  hhmm: string;
  /** YYYY-MM-DD no fuso local. */
  dateKey: string;
}

const WD: Record<string, Weekday> = {
  Mon: 'mon',
  Tue: 'tue',
  Wed: 'wed',
  Thu: 'thu',
  Fri: 'fri',
  Sat: 'sat',
  Sun: 'sun',
};
const fmtCache = new Map<string, Intl.DateTimeFormat>();

function formatter(tz: string): Intl.DateTimeFormat {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      weekday: 'short',
    });
    fmtCache.set(tz, f);
  }
  return f;
}

/** Componentes de data/hora no fuso IANA (correto em transições de horário de verão). */
export function localParts(date: Date, tz: string): LocalParts {
  const parts: Record<string, string> = {};
  for (const p of formatter(tz).formatToParts(date)) parts[p.type] = p.value;
  const hour = Number(parts.hour) % 24;
  const minute = Number(parts.minute);
  const year = Number(parts.year);
  const month = Number(parts.month);
  const day = Number(parts.day);
  return {
    year,
    month,
    day,
    hour,
    minute,
    weekday: WD[parts.weekday as string] as Weekday,
    hhmm: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
    dateKey: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
  };
}

/** HH:MM dentro de [start,end) com suporte a janelas que cruzam a meia-noite. */
export function inTimeWindow(hhmm: string, start: string, end: string): boolean {
  if (start === end) return true;
  return start < end ? hhmm >= start && hhmm < end : hhmm >= start || hhmm < end;
}

function parseCronField(field: string, min: number, max: number): Set<number> {
  const out = new Set<number>();
  for (const part of field.split(',')) {
    const [rangePart, stepPart] = part.split('/') as [string, string | undefined];
    const step = stepPart === undefined ? 1 : Number(stepPart);
    if (!Number.isInteger(step) || step < 1) throw new Error(`passo inválido: ${part}`);
    let lo: number;
    let hi: number;
    if (rangePart === '*') {
      lo = min;
      hi = max;
    } else if (rangePart.includes('-')) {
      const [a, b] = rangePart.split('-').map(Number) as [number, number];
      lo = a;
      hi = b;
    } else {
      lo = Number(rangePart);
      hi = stepPart === undefined ? lo : max;
    }
    if (!Number.isInteger(lo) || !Number.isInteger(hi) || lo < min || hi > max || lo > hi) {
      throw new Error(`campo cron inválido: ${field}`);
    }
    for (let v = lo; v <= hi; v += step) out.add(v);
  }
  return out;
}

export interface CronSpec {
  minute: Set<number>;
  hour: Set<number>;
  dom: Set<number>;
  month: Set<number>;
  dow: Set<number>;
  domAny: boolean;
  dowAny: boolean;
}

export function parseCron(expr: string): CronSpec {
  const f = expr.trim().split(/\s+/);
  if (f.length !== 5) throw new Error('cron deve ter 5 campos');
  const [mi, h, dom, mo, dow] = f as [string, string, string, string, string];
  const dowSet = parseCronField(dow, 0, 7);
  if (dowSet.has(7)) {
    dowSet.delete(7);
    dowSet.add(0);
  }
  return {
    minute: parseCronField(mi, 0, 59),
    hour: parseCronField(h, 0, 23),
    dom: parseCronField(dom, 1, 31),
    month: parseCronField(mo, 1, 12),
    dow: dowSet,
    domAny: dom === '*',
    dowAny: dow === '*',
  };
}

const DOW_NUM: Record<Weekday, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };

/** Cron avaliado no horário de parede do fuso (semântica Vixie para dom/dow). */
export function cronMatches(spec: CronSpec, date: Date, tz: string): boolean {
  const p = localParts(date, tz);
  if (!spec.minute.has(p.minute) || !spec.hour.has(p.hour) || !spec.month.has(p.month)) return false;
  const domOk = spec.dom.has(p.day);
  const dowOk = spec.dow.has(DOW_NUM[p.weekday]);
  if (spec.domAny && spec.dowAny) return true;
  if (spec.domAny) return dowOk;
  if (spec.dowAny) return domOk;
  return domOk || dowOk;
}

/** Próximas ocorrências (busca minuto a minuto, limitada). */
export function nextCronRuns(
  expr: string,
  tz: string,
  from: Date,
  count: number,
  horizonMinutes = 60 * 24 * 366,
): Date[] {
  const spec = parseCron(expr);
  const out: Date[] = [];
  const start = Math.ceil(from.getTime() / 60000) * 60000;
  for (let i = 0; i < horizonMinutes && out.length < count; i++) {
    const d = new Date(start + i * 60000);
    if (cronMatches(spec, d, tz)) out.push(d);
  }
  return out;
}
