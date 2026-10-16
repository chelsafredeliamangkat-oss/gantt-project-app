import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { WEEKDAY_FULL_LABELS, WEEKDAY_LABELS } from '../types'
import { createId } from '../lib/id'
import { dayNumber, parseISODate } from '../lib/dates'
import { formatISODateLong, weekdayShort } from '../lib/format'
import { useProject } from '../store/ProjectContext'
import { useSchedule } from '../store/useSchedule'

export function CalendarPanel() {
  const { project, dispatch } = useProject()
  const schedule = useSchedule()
  const [date, setDate] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState('')

  const workingDays = project.calendar.workingDays
  const holidays = project.calendar.holidays

  const holidayNumbers = useMemo(
    () => new Set(holidays.map((holiday) => dayNumber(parseISODate(holiday.date)))),
    [holidays],
  )

  const projectRange = useMemo(() => {
    if (!schedule.projectStart || !schedule.projectFinish) return null
    return {
      start: schedule.projectStart,
      finish: schedule.projectFinish,
      startNum: dayNumber(parseISODate(schedule.projectStart)),
      finishNum: dayNumber(parseISODate(schedule.projectFinish)),
    }
  }, [schedule.projectStart, schedule.projectFinish])

  const holidaysInRange = useMemo(() => {
    if (!projectRange) return []
    return holidays.filter((holiday) => {
      const dayNum = dayNumber(parseISODate(holiday.date))
      return dayNum >= projectRange.startNum && dayNum <= projectRange.finishNum
    })
  }, [holidays, projectRange])

  const toggleDay = (day: number) => {
    const active = workingDays.includes(day)
    if (active && workingDays.length === 1) return
    dispatch({
      type: 'setWorkingDays',
      workingDays: active
        ? workingDays.filter((item) => item !== day)
        : [...workingDays, day],
    })
  }

  const addHoliday = (event: FormEvent) => {
    event.preventDefault()
    if (!date) {
      setError('Pilih tanggal libur terlebih dahulu.')
      return
    }
    if (holidayNumbers.has(dayNumber(parseISODate(date)))) {
      setError('Tanggal tersebut sudah terdaftar sebagai hari libur.')
      return
    }
    dispatch({
      type: 'addHoliday',
      holiday: { id: createId('h'), date, name: name.trim() || 'Hari libur' },
    })
    setDate('')
    setName('')
    setError('')
  }

  const mondayBasedOrder = [1, 2, 3, 4, 5, 6, 0]

  return (
    <section className="panel">
      <div className="panel-grid">
        <div className="panel-column">
          <h3>Hari kerja dalam sepekan</h3>
          <p className="hint">
            Hari yang tidak dicentang diperlakukan sebagai akhir pekan dan tidak dihitung
            dalam durasi tugas.
          </p>
          <div className="weekday-picker">
            {mondayBasedOrder.map((day) => {
              const active = workingDays.includes(day)
              const isLast = active && workingDays.length === 1
              return (
                <label
                  key={day}
                  className={`weekday-chip${active ? ' weekday-chip-active' : ''}`}
                  title={WEEKDAY_FULL_LABELS[day]}
                >
                  <input
                    type="checkbox"
                    checked={active}
                    disabled={isLast}
                    onChange={() => toggleDay(day)}
                  />
                  <span>{WEEKDAY_LABELS[day]}</span>
                </label>
              )
            })}
          </div>
          {workingDays.length === 1 ? (
            <p className="hint">Minimal satu hari kerja harus aktif.</p>
          ) : null}

          <h3>Ringkasan kalender</h3>
          <dl className="stat-list">
            <div>
              <dt>Hari kerja per pekan</dt>
              <dd>{workingDays.length} hari</dd>
            </div>
            <div>
              <dt>Total hari libur khusus</dt>
              <dd>{holidays.length} hari</dd>
            </div>
            <div>
              <dt>Libur dalam rentang proyek</dt>
              <dd>{holidaysInRange.length} hari</dd>
            </div>
            <div>
              <dt>Durasi proyek</dt>
              <dd>
                {schedule.projectStart && schedule.projectFinish
                  ? `${schedule.durationDays} hari kerja (${formatISODateLong(
                      schedule.projectStart,
                    )} – ${formatISODateLong(schedule.projectFinish)})`
                  : '—'}
              </dd>
            </div>
          </dl>
        </div>

        <div className="panel-column">
          <h3>Tambah hari libur</h3>
          <form className="holiday-form" onSubmit={addHoliday}>
            <label className="field">
              <span>Tanggal</span>
              <input
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
              />
            </label>
            <label className="field">
              <span>Keterangan</span>
              <input
                value={name}
                placeholder="mis. Cuti Bersama"
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <button type="submit" className="btn btn-primary">
              Tambah hari libur
            </button>
          </form>
          {error ? <p className="alert alert-error">{error}</p> : null}
          {date ? (
            <p className="hint">
              {formatISODateLong(date)} jatuh pada hari {weekdayShort(parseISODate(date))}.
            </p>
          ) : null}

          <h3>Daftar hari libur</h3>
          {holidays.length === 0 ? (
            <p className="hint">Belum ada hari libur khusus.</p>
          ) : (
            <ul className="holiday-list">
              {holidays.map((holiday) => {
                const dayNum = dayNumber(parseISODate(holiday.date))
                const inRange =
                  projectRange !== null &&
                  dayNum >= projectRange.startNum &&
                  dayNum <= projectRange.finishNum
                return (
                  <li key={holiday.id} className={inRange ? 'holiday-affected' : ''}>
                    <span className="holiday-date">{formatISODateLong(holiday.date)}</span>
                    <span className="holiday-name">{holiday.name}</span>
                    {inRange ? <span className="badge badge-info">dalam proyek</span> : null}
                    <button
                      type="button"
                      className="icon-btn icon-btn-danger"
                      aria-label={`Hapus libur ${holiday.name}`}
                      onClick={() => dispatch({ type: 'removeHoliday', id: holiday.id })}
                    >
                      ✕
                    </button>
                  </li>
                )
              })}
            </ul>
          )}

        </div>
      </div>

      <p className="hint">
        Mengubah kalender langsung menjadwalkan ulang seluruh tugas: durasi, tanggal, dan
        jalur kritis dihitung hanya dari hari kerja.
      </p>
    </section>
  )
}
