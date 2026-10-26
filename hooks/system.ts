import type { EngineInterface } from 'claude-code'

import type { Alert, Docker, PortState, System } from '../types'

// ---------------------------------------------------------------- thresholds

export const SAMPLE_MS = 5_000
export const DISK_ALERT_BYTES = 10 * 1024 ** 3
export const TEMP_ALERT_C = 90
/** kern.memorystatus_vm_pressure_level: 1 normal, 2 warning, 4 critical. Warning and up is "high". */
export const PRESSURE_ALERT_LEVEL = 2
export const DEV_PORTS = [3000, 3001] as const
/** APFS: the user's data volume. `/` is the sealed system snapshot and reads the same free space less clearly. */
const DATA_VOLUME = '/System/Volumes/Data'
const RUN_TIMEOUT_MS = 4_000

export const DEFAULT_SYSTEM: System = {
  at: 0,
  diskFreeBytes: null,
  diskTotalBytes: null,
  ramUsedBytes: null,
  ramTotalBytes: null,
  swapUsedBytes: null,
  pressure: null,
  cpuPct: null,
  load1: null,
  tempC: null,
  tempHint: null,
  netInBps: null,
  netOutBps: null,
  batteryPct: null,
  batteryState: null,
  docker: null,
  ports: [],
  alerts: [],
}

// ---------------------------------------------------------------- parsers (pure, tested)

/** `df -k <path>`: the last line's 1024-blocks and Available columns. */
export const parseDf = (stdout: string): { freeBytes: number; totalBytes: number } | null => {
  const f = stdout.trim().split('\n').pop()?.trim().split(/\s+/) ?? []
  const total = Number(f[1])
  const free = Number(f[3])
  return Number.isFinite(total) && Number.isFinite(free) && total > 0 ? { freeBytes: free * 1024, totalBytes: total * 1024 } : null
}

/**
 * `netstat -ibn`: bytes in and out summed over the physical `en*` interfaces' link rows. Read from the
 * row's end, since a link row without a MAC address has one column fewer: …Ibytes Opkts Oerrs Obytes Coll.
 */
export const parseNetstat = (stdout: string): { inBytes: number; outBytes: number } | null => {
  let inBytes = 0
  let outBytes = 0
  let isFound = false
  for (const row of stdout.split('\n')) {
    const f = row.trim().split(/\s+/)
    if (!/^en\d+$/.test(f[0] ?? '') || !(f[2] ?? '').startsWith('<Link#') || f.length < 10) continue
    const ib = Number(f[f.length - 5])
    const ob = Number(f[f.length - 2])
    if (!Number.isFinite(ib) || !Number.isFinite(ob)) continue
    inBytes += ib
    outBytes += ob
    isFound = true
  }
  return isFound ? { inBytes, outBytes } : null
}

/** Bytes per second between two counter readings; null across a counter reset or a non-positive gap. */
export const rateOf = (before: number, after: number, dtMs: number): number | null =>
  dtMs > 0 && after >= before ? ((after - before) * 1000) / dtMs : null

/** `pmset -g batt`: `… 87%; discharging; 3:12 remaining …`. A desktop Mac has no battery line. */
export const parseBattery = (stdout: string): { pct: number; state: string } | null => {
  const m = /(\d+)%;\s*([^;]+);/.exec(stdout)
  return m?.[1] && m[2] ? { pct: Number(m[1]), state: m[2].trim() } : null
}

/** `sysctl -n vm.loadavg kern.memorystatus_vm_pressure_level`: `{ 4.73 3.45 3.25 }` then `1`. */
export const parseSysctl = (stdout: string): { load1: number | null; pressure: number | null } => {
  const [loadLine = '', pressureLine = ''] = stdout.trim().split('\n')
  const load1 = Number(/\{\s*([\d.]+)/.exec(loadLine)?.[1])
  const pressure = Number(pressureLine.trim())
  return { load1: Number.isFinite(load1) ? load1 : null, pressure: Number.isFinite(pressure) && pressureLine.trim() !== '' ? pressure : null }
}

type Macmon = { tempC: number | null; cpuPct: number | null; ramUsedBytes: number | null; ramTotalBytes: number | null; swapUsedBytes: number | null }

/** `macmon pipe -s 1`: one JSON sample. Apple Silicon only; no sudo. */
export const parseMacmon = (stdout: string): Macmon | null => {
  try {
    const d = JSON.parse(stdout.trim().split('\n')[0] ?? '') as {
      temp?: { cpu_temp_avg?: number | null }
      cpu_usage_pct?: number
      memory?: { ram_total?: number; ram_usage?: number; swap_usage?: number }
    }
    const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
    const cpu = num(d.cpu_usage_pct)
    return {
      tempC: num(d.temp?.cpu_temp_avg),
      cpuPct: cpu === null ? null : cpu * 100,
      ramUsedBytes: num(d.memory?.ram_usage),
      ramTotalBytes: num(d.memory?.ram_total),
      swapUsedBytes: num(d.memory?.swap_usage),
    }
  } catch {
    return null
  }
}

/** `docker ps -a --format {{.State}}`: one state per line. A non-zero exit means the daemon is not running. */
export const parseDocker = (exitCode: number, stdout: string): Docker => {
  if (exitCode !== 0) return 'down'
  const states = stdout.split('\n').map(s => s.trim()).filter(Boolean)
  return { running: states.filter(s => s === 'running').length, total: states.length }
}

/** `curl -w %{http_code}`: any HTTP answer, even a 404, means something listens; `000` means nothing does. */
export const isHttpUp = (code: string) => /^[1-5]\d\d$/.test(code.trim())

export const alertsOf = (s: System): Alert[] => [
  ...(s.diskFreeBytes !== null && s.diskFreeBytes < DISK_ALERT_BYTES ? (['disk'] as const) : []),
  ...(s.pressure !== null && s.pressure >= PRESSURE_ALERT_LEVEL ? (['ram'] as const) : []),
  ...(s.tempC !== null && s.tempC > TEMP_ALERT_C ? (['temp'] as const) : []),
]

export const alertText = (a: Alert, s: System) =>
  a === 'disk'
    ? `Disk low: ${fmtBytes(s.diskFreeBytes)} free`
    : a === 'ram'
      ? `Memory pressure ${pressureLabel(s.pressure)}`
      : `CPU hot: ${Math.round(s.tempC ?? 0)} °C`

// ---------------------------------------------------------------- formatting

export const fmtBytes = (n: number | null) => {
  if (n === null) return '—'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let v = n
  let i = 0
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v >= 100 || i === 0 ? Math.round(v) : v.toFixed(1)} ${units[i]}`
}

export const fmtRate = (bps: number | null) => (bps === null ? '—' : `${fmtBytes(bps)}/s`)

export const pressureLabel = (level: number | null) =>
  level === null ? '—' : level >= 4 ? 'critical' : level >= 2 ? 'high' : 'normal'

// ---------------------------------------------------------------- sampling

type Net = { at: number; inBytes: number; outBytes: number }

function run($: EngineInterface, argv: string[]) {
  return $.process.run(argv, { timeoutMs: RUN_TIMEOUT_MS }).catch(() => null)
}

/**
 * One reading of the machine. Every probe is independent: one that fails (a missing tool, Docker off)
 * leaves its own fields empty and the rest still read. `lastNet` is the previous counter reading, for rates.
 */
export async function sampleSystem($: EngineInterface, lastNet: Net | null): Promise<{ system: System; net: Net | null }> {
  const [at, df, sys, mac, net, batt, docker, ...ports] = await Promise.all([
    $.clock.now(),
    run($, ['df', '-k', DATA_VOLUME]),
    run($, ['sysctl', '-n', 'vm.loadavg', 'kern.memorystatus_vm_pressure_level']),
    run($, ['macmon', 'pipe', '-s', '1', '-i', '200']),
    run($, ['netstat', '-ibn']),
    run($, ['pmset', '-g', 'batt']),
    run($, ['docker', 'ps', '-a', '--format', '{{.State}}']),
    ...DEV_PORTS.map(p => run($, ['curl', '-s', '-o', '/dev/null', '-m', '1', '-w', '%{http_code}', `http://localhost:${p}`])),
  ])
  const disk = df ? parseDf(df.stdout) : null
  const sc = sys ? parseSysctl(sys.stdout) : { load1: null, pressure: null }
  const mm = mac && mac.exitCode === 0 ? parseMacmon(mac.stdout) : null
  const counters = net ? parseNetstat(net.stdout) : null
  const b = batt ? parseBattery(batt.stdout) : null
  const nowNet = counters ? { at, ...counters } : null
  const system: System = {
    at,
    diskFreeBytes: disk?.freeBytes ?? null,
    diskTotalBytes: disk?.totalBytes ?? null,
    ramUsedBytes: mm?.ramUsedBytes ?? null,
    ramTotalBytes: mm?.ramTotalBytes ?? null,
    swapUsedBytes: mm?.swapUsedBytes ?? null,
    pressure: sc.pressure,
    cpuPct: mm?.cpuPct ?? null,
    load1: sc.load1,
    tempC: mm?.tempC ?? null,
    tempHint: mm ? null : 'brew install macmon',
    netInBps: nowNet && lastNet ? rateOf(lastNet.inBytes, nowNet.inBytes, at - lastNet.at) : null,
    netOutBps: nowNet && lastNet ? rateOf(lastNet.outBytes, nowNet.outBytes, at - lastNet.at) : null,
    batteryPct: b?.pct ?? null,
    batteryState: b?.state ?? null,
    docker: docker ? parseDocker(docker.exitCode, docker.stdout) : null,
    ports: DEV_PORTS.map((port, i): PortState => ({ port, isUp: isHttpUp(ports[i]?.stdout ?? '') })),
    alerts: [],
  }
  return { system: { ...system, alerts: alertsOf(system) }, net: nowNet }
}
