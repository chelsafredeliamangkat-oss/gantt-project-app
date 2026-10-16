import { WEEKDAY_LABELS } from '../types'
import { addDays, dayNumber, parseISODate, toISODate } from './dates'

const MONTHS_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'Mei',
  'Jun',
  'Jul',
  'Agu',
  'Sep',
  'Okt',
  'Nov',
  'Des',
]

const MONTHS_LONG = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
]

export function weekdayShort(date: Date): string {
  return WEEKDAY_LABELS[date.getDay()] ?? ''
}

export function monthShort(date: Date): string {
  return MONTHS_SHORT[date.getMonth()] ?? ''
}

export function monthLong(date: Date): string {
  return MONTHS_LONG[date.getMonth()] ?? ''
}

/** "5 Jan 2026" */
export function formatDate(date: Date): string {
  return `${date.getDate()} ${monthShort(date)} ${date.getFullYear()}`
}

/** "5 Januari 2026" */
export function formatDateLong(date: Date): string {
  return `${date.getDate()} ${monthLong(date)} ${date.getFullYear()}`
}

/** "Jan 2026" */
export function formatMonthYear(date: Date): string {
  return `${monthShort(date)} ${date.getFullYear()}`
}

export function formatISODate(iso: string): string {
  return formatDate(parseISODate(iso))
}

export function formatISODateLong(iso: string): string {
  return formatDateLong(parseISODate(iso))
}

const numberFormatter = new Intl.NumberFormat('id-ID')

export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return '-'
  return numberFormatter.format(Math.round(value))
}

export function formatCurrency(value: number): string {
  if (!Number.isFinite(value)) return '-'
  return `Rp ${numberFormatter.format(Math.round(value))}`
}

/** Compact currency for tight spaces, e.g. "Rp 18,0 jt". */
export function formatCurrencyCompact(value: number): string {
  if (!Number.isFinite(value)) return '-'
  const abs = Math.abs(value)
  if (abs >= 1_000_000_000) return `Rp ${(value / 1_000_000_000).toFixed(1)} M`
  if (abs >= 1_000_000) return `Rp ${(value / 1_000_000).toFixed(1)} jt`
  return formatCurrency(value)
}

/** Rounds to at most two decimals for display. */
export function round2(value: number): number {
  return Math.round(value * 100) / 100
}

export function isSameDay(a: Date, b: Date): boolean {
  return dayNumber(a) === dayNumber(b)
}

/** ISO date string of `iso` shifted by a number of calendar days. */
export function isoShift(iso: string, calendarDays: number): string {
  return toISODate(addDays(parseISODate(iso), calendarDays))
}
