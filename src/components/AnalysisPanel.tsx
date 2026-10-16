import { useMemo } from 'react'
import { formatISODate, round2 } from '../lib/format'
import { useProject } from '../store/ProjectContext'
import { usePert, useSchedule } from '../store/useSchedule'
import { PertChart } from './PertChart'

export function AnalysisPanel() {
  const { project, selectTask } = useProject()
  const schedule = useSchedule()
  const pert = usePert()

  const tasksById = useMemo(
    () => new Map(project.tasks.map((task) => [task.id, task])),
    [project.tasks],
  )

  const leafEntries = useMemo(
    () =>
      schedule.leafIds
        .map((id) => schedule.byId.get(id))
        .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
        .sort((a, b) => a.startOrdinal - b.startOrdinal || a.name.localeCompare(b.name)),
    [schedule],
  )

  const criticalEntries = useMemo(
    () =>
      schedule.criticalPath
        .map((id) => schedule.byId.get(id))
        .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry)),
    [schedule],
  )

  /** Critical chain with the running duration total precomputed. */
  const criticalSteps = useMemo(
    () =>
      criticalEntries.map((entry, index) => ({
        entry,
        cumulative: criticalEntries
          .slice(0, index + 1)
          .reduce((sum, item) => sum + item.duration, 0),
      })),
    [criticalEntries],
  )

  const calendarDays = useMemo(() => {
    if (!schedule.projectStart || !schedule.projectFinish) return 0
    const start = new Date(schedule.projectStart)
    const finish = new Date(schedule.projectFinish)
    return Math.round((finish.getTime() - start.getTime()) / 86_400_000) + 1
  }, [schedule.projectStart, schedule.projectFinish])

  if (!schedule.projectStart || leafEntries.length === 0) {
    return (
      <section className="panel">
        <p className="empty-state">
          Belum ada tugas yang bisa dianalisis. Tambahkan tugas terlebih dahulu.
        </p>
        {schedule.errors.length > 0 ? (
          <p className="alert alert-error">{schedule.errors.join(' ')}</p>
        ) : null}
      </section>
    )
  }

  return (
    <section className="panel">
      <div className="stat-cards">
        <article className="stat-card">
          <span className="stat-label">Mulai proyek</span>
          <strong>{formatISODate(schedule.projectStart)}</strong>
        </article>
        <article className="stat-card">
          <span className="stat-label">Selesai proyek</span>
          <strong>{formatISODate(schedule.projectFinish as string)}</strong>
        </article>
        <article className="stat-card">
          <span className="stat-label">Durasi</span>
          <strong>{schedule.durationDays} hari kerja</strong>
          <small>{calendarDays} hari kalender</small>
        </article>
        <article className="stat-card">
          <span className="stat-label">Jalur kritis</span>
          <strong>{schedule.criticalPath.length} tugas</strong>
          <small>{schedule.criticalDurationDays} hari kerja</small>
        </article>
        <article className="stat-card">
          <span className="stat-label">Estimasi PERT (TE)</span>
          <strong>{round2(pert.expectedDuration)} hari kerja</strong>
          <small>simpangan baku {round2(pert.projectStandardDeviation)} hari</small>
        </article>
        <article className="stat-card">
          <span className="stat-label">Keyakinan pada rencana</span>
          <strong>{Math.round(pert.probabilityWithinPlan * 1000) / 10}%</strong>
          <small>peluang selesai ≤ {schedule.durationDays} hari kerja</small>
        </article>
      </div>

      <h3>Jalur kritis (Critical Path)</h3>
      {criticalEntries.length === 0 ? (
        <p className="hint">Tidak ada rangkaian kritis yang terdeteksi.</p>
      ) : (
        <ol className="critical-path">
          {criticalSteps.map(({ entry, cumulative }) => (
            <li key={entry.taskId}>
              <button type="button" className="link-btn" onClick={() => selectTask(entry.taskId)}>
                {entry.name}
              </button>
              <span className="muted">
                {' '}
                — {entry.duration} hari, {formatISODate(entry.startDate)} →{' '}
                {formatISODate(entry.finishDate)}, kumulatif {cumulative} hari
              </span>
            </li>
          ))}
        </ol>
      )}
      <p className="hint">
        Tugas pada jalur kritis memiliki total float 0 hari: keterlambatan satu hari akan
        menunda seluruh proyek.
      </p>

      <h3>Diagram PERT</h3>
      <PertChart tasks={project.tasks} schedule={schedule} estimates={pert.estimates} />

      <h3>Jadwal CPM per tugas</h3>
      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>Tugas</th>
              <th className="num">Durasi</th>
              <th>ES (mulai tercepat)</th>
              <th>EF (selesai tercepat)</th>
              <th>LS (mulai terlambat)</th>
              <th>LF (selesai terlambat)</th>
              <th className="num">Total float</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {leafEntries.map((entry) => (
              <tr
                key={entry.taskId}
                className={entry.critical ? 'row-critical' : ''}
                onClick={() => selectTask(entry.taskId)}
              >
                <td>{entry.name}</td>
                <td className="num">{entry.duration}</td>
                <td>{formatISODate(entry.startDate)}</td>
                <td>{formatISODate(entry.finishDate)}</td>
                <td className="num">{entry.lateStart}</td>
                <td className="num">{entry.lateFinish}</td>
                <td className="num">{entry.totalFloat}</td>
                <td>
                  {entry.critical ? (
                    <span className="badge badge-critical">Kritis</span>
                  ) : (
                    <span className="badge badge-idle">Ada float</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="hint">
        ES/EF/LS/LF ditampilkan sebagai indeks hari kerja relatif terhadap awal kalender
        perhitungan, sedangkan tanggalnya sudah dikonversi ke kalender nyata.
      </p>

      <h3>Estimasi PERT per tugas</h3>
      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>Tugas</th>
              <th className="num">Optimistis (O)</th>
              <th className="num">Paling mungkin (M)</th>
              <th className="num">Pesimistis (P)</th>
              <th className="num">TE = (O+4M+P)/6</th>
              <th className="num">Simpangan baku</th>
              <th className="num">Variansi</th>
            </tr>
          </thead>
          <tbody>
            {leafEntries.map((entry) => {
              const estimate = pert.estimates.get(entry.taskId)
              const task = tasksById.get(entry.taskId)
              const explicit =
                task?.optimistic != null || task?.mostLikely != null || task?.pessimistic != null
              return (
                <tr key={entry.taskId} className={entry.critical ? 'row-critical' : ''}>
                  <td>
                    {entry.name}
                    {explicit ? null : <span className="muted"> (perkiraan otomatis)</span>}
                  </td>
                  <td className="num">{estimate?.optimistic ?? '—'}</td>
                  <td className="num">{estimate?.mostLikely ?? '—'}</td>
                  <td className="num">{estimate?.pessimistic ?? '—'}</td>
                  <td className="num">{fmt(estimate?.expected)}</td>
                  <td className="num">{fmt(estimate?.standardDeviation)}</td>
                  <td className="num">{fmt(estimate?.variance)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="hint">
        TE memakai rumus PERT (O + 4M + P) / 6 dan simpangan baku (P − O) / 6. Variansi
        ditambahkan sepanjang jalur kritis untuk memperkirakan risiko jadwal. Bila kolom
        estimasi dibiarkan kosong, nilainya diturunkan dari durasi (80% dan 150%).
      </p>
    </section>
  )
}

/** Renders an optional number with at most two decimals. */
function fmt(value: number | undefined): string {
  return value === undefined ? '—' : String(round2(value))
}
