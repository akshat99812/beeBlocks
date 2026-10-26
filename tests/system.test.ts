import { expect, test } from 'claude-code/testing'

import { quoteForHour } from '../hooks/quotes'
import {
  DEFAULT_SYSTEM,
  alertsOf,
  fmtBytes,
  isHttpUp,
  parseBattery,
  parseDf,
  parseDocker,
  parseMacmon,
  parseNetstat,
  parseSysctl,
  rateOf,
} from '../hooks/system'

const GB = 1024 ** 3

test('df reads free and total from the last line', () => {
  const out = 'Filesystem 1024-blocks Used Available Capacity iused ifree %iused Mounted on\n/dev/disk3s5 239362496 200000000 8370144 96% 1 2 1% /System/Volumes/Data\n'
  expect(parseDf(out)).toEqual({ freeBytes: 8370144 * 1024, totalBytes: 239362496 * 1024 })
  expect(parseDf('garbage')).toBeNull()
})

test('netstat sums the en* link rows, with or without a MAC column, and skips lo0 and address rows', () => {
  const out = [
    'Name  Mtu   Network       Address            Ipkts Ierrs     Ibytes    Opkts Oerrs     Obytes  Coll',
    'lo0   16384 <Link#1>                       100     0       9999      100     0       9999     0',
    'en0   1500  <Link#11>     aa:bb:cc:dd:ee:ff  10    0       1000      20      0       2000     0',
    'en0   1500  192.168.1     192.168.1.5        10    -       1000      20      -       2000     -',
    'en5   1500  <Link#12>                        1     0       500       1       0       50       0',
  ].join('\n')
  expect(parseNetstat(out)).toEqual({ inBytes: 1500, outBytes: 2050 })
  expect(parseNetstat('')).toBeNull()
})

test('rates are per second and null across a counter reset', () => {
  expect(rateOf(1000, 6000, 5000)).toBe(1000)
  expect(rateOf(6000, 1000, 5000)).toBeNull()
  expect(rateOf(0, 10, 0)).toBeNull()
})

test('battery, sysctl, docker and curl outputs', () => {
  expect(parseBattery(" -InternalBattery-0 (id=1)\t87%; discharging; 3:12 remaining present: true")).toEqual({ pct: 87, state: 'discharging' })
  expect(parseBattery('Now drawing from AC Power')).toBeNull()
  expect(parseSysctl('{ 4.73 3.45 3.25 }\n4\n')).toEqual({ load1: 4.73, pressure: 4 })
  expect(parseDocker(1, '')).toBe('down')
  expect(parseDocker(0, 'running\nexited\nrunning\n')).toEqual({ running: 2, total: 3 })
  expect([isHttpUp('404'), isHttpUp('000'), isHttpUp('')]).toEqual([true, false, false])
})

test('macmon JSON gives temp, cpu % and memory; bad JSON gives null', () => {
  const out = JSON.stringify({ cpu_usage_pct: 0.25, temp: { cpu_temp_avg: 71.9 }, memory: { ram_total: 8 * GB, ram_usage: 6 * GB, swap_usage: GB } })
  expect(parseMacmon(out)).toEqual({ tempC: 71.9, cpuPct: 25, ramUsedBytes: 6 * GB, ramTotalBytes: 8 * GB, swapUsedBytes: GB })
  expect(parseMacmon('not json')).toBeNull()
})

test('alerts fire past each threshold and not at it', () => {
  expect(alertsOf(DEFAULT_SYSTEM)).toEqual([])
  expect(alertsOf({ ...DEFAULT_SYSTEM, diskFreeBytes: 9 * GB, pressure: 2, tempC: 91 })).toEqual(['disk', 'ram', 'temp'])
  expect(alertsOf({ ...DEFAULT_SYSTEM, diskFreeBytes: 10 * GB, pressure: 1, tempC: 90 })).toEqual([])
})

test('bytes format to one decimal under 100 of a unit', () => {
  expect([fmtBytes(null), fmtBytes(512), fmtBytes(8.2 * GB), fmtBytes(228 * GB)]).toEqual(['—', '512 B', '8.2 GB', '228 GB'])
})

test('the quote is stable within an hour and changes the next hour', () => {
  expect(quoteForHour(0)).toEqual(quoteForHour(3_599_999))
  expect(quoteForHour(0)).not.toEqual(quoteForHour(3_600_000))
})
