import { useMemo, useState } from 'react'
import { flattenTasks } from '../lib/hierarchy'
import type { SortMode } from '../lib/hierarchy'
import { formatISODate, formatNumber, formatCurrency, round2 } from '../lib/format'
import { taskCost } from '../lib/costs'
import { useProject } from '../store/ProjectContext'
import { useSchedule } from '../store/useSchedule'
import { GanttChart } from './GanttChart'
import { TaskFormModal } from './TaskFormModal'
import { PRIORITY_LABELS } from '../types'

const ZOOM_LEVELS = [
  { label: 'Ringkas', value: 14 },
  { label: 'Normal', value: 26 },
  { label: 'Detail', value: 40 },
]

export function GanttPanel() {
  const { project, dispatch, selectedTaskId, selectTask } = useProject()
  const schedule = useSchedule()
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [sort, setSort] = useState<SortMode>('manual')
  const [dayWidth, setDayWidth] = useState(26)
  const [criticalOnly, setCriticalOnly] = useState(false)
  const [showProgress, setShowProgress] = useState(true)
  const [formTarget, setFormTarget] = useState<{ taskId: string | null; parentId: string | null } | null>(
    null,
  )

  const rows = useMemo(
    () => flattenTasks(project.tasks, { collapsed, sort }),
    [project.tasks, collapsed, sort],
  )

  const selected = selectedTaskId
    ? project.tasks.find((task) => task.id === selectedTaskId) ?? null
    : null
  const selectedEntry = selected ? schedule.byId.get(selected.id) : undefined

  const toggleCollapse = (taskId: string) => {
    setCollapsed((current) => {
      const next = new Set(current)
      if (next.has(taskId)) next.delete(taskId)
      else next.add(taskId)
      return next
    })
  }

  const collapseAll = () => {
    const parents = project.tasks
      .filter((task) => project.tasks.some((other) => other.parentId === task.id))
      .map((task) => task.id)
    setCollapsed(new Set(parents))
  }

  const nameOf = (taskId: string) =>
    project.tasks.find((task) => task.id === taskId)?.name ?? '(tidak ditemukan)'

  return (
    <section className="panel">
      <div className="toolbar">
        <div className="toolbar-group">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setFormTarget({ taskId: null, parentId: null })}
          >
            + Tugas baru
          </button>
          <button type="button" className="btn" onClick={collapseAll}>
            Tutup semua
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => setCollapsed(new Set())}
            disabled={collapsed.size === 0}
          >
            Buka semua
          </button>
        </div>

        <div className="toolbar-group">
          <label className="inline-field">
            <span>Urutan</span>
            <select value={sort} onChange={(event) => setSort(event.target.value as SortMode)}>
              <option value="manual">Sesuai struktur</option>
              <option value="start">Tanggal mulai</option>
              <option value="priority">Prioritas</option>
            </select>
          </label>
          <label className="inline-field">
            <span>Zoom</span>
            <select
              value={dayWidth}
              onChange={(event) => setDayWidth(Number(event.target.value))}
            >
              {ZOOM_LEVELS.map((level) => (
                <option key={level.value} value={level.value}>
                  {level.label}
                </option>
              ))}
            </select>
          </label>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={criticalOnly}
              onChange={(event) => setCriticalOnly(event.target.checked)}
            />
            <span>Fokus jalur kritis</span>
          </label>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={showProgress}
              onChange={(event) => setShowProgress(event.target.checked)}
            />
            <span>Progress</span>
          </label>
        </div>
      </div>

      {schedule.errors.length > 0 ? (
        <p className="alert alert-error">
          {schedule.errors.map((message) => (
            <span key={message}>{message} </span>
          ))}
        </p>
      ) : null}
      {schedule.warnings.length > 0 ? (
        <p className="alert alert-warning">
          {schedule.warnings.map((message) => (
            <span key={message}>{message} </span>
          ))}
        </p>
      ) : null}

      <div className="gantt-wrap">
        <GanttChart
          rows={rows}
          schedule={schedule}
          dayWidth={dayWidth}
          highlightCritical={criticalOnly}
          showProgress={showProgress}
          selectedTaskId={selectedTaskId}
          onSelect={selectTask}
          onToggleCollapse={toggleCollapse}
          onEdit={(taskId) => setFormTarget({ taskId, parentId: null })}
        />
      </div>

      <div className="legend">
        <span className="legend-item">
          <span className="legend-swatch legend-bar" /> Bar tugas (isi penuh = progress 100%)
        </span>
        <span className="legend-item">
          <span className="legend-swatch legend-summary" /> Tugas induk / ringkasan
        </span>
        <span className="legend-item">
          <span className="legend-swatch legend-critical" /> Jalur kritis
        </span>
        <span className="legend-item">
          <span className="legend-swatch legend-weekend" /> Akhir pekan
        </span>
        <span className="legend-item">
          <span className="legend-swatch legend-holiday" /> Hari libur
        </span>
        <span className="legend-item">
          <span className="legend-swatch legend-arrow" /> Keterkaitan (FS/SS)
        </span>
      </div>

      {selected && selectedEntry ? (
        <div className="details-card">
          <header>
            <span className="dot dot-lg" style={{ background: selected.color }} />
            <h3>{selected.name}</h3>
            <span className={`badge badge-${selected.priority}`}>
              {PRIORITY_LABELS[selected.priority]}
            </span>
            {selectedEntry.critical ? (
              <span className="badge badge-critical">Jalur kritis</span>
            ) : null}
            <div className="details-actions">
              <button
                type="button"
                className="btn"
                onClick={() => setFormTarget({ taskId: selected.id, parentId: null })}
              >
                Edit
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setFormTarget({ taskId: null, parentId: selected.id })}
              >
                + Sub-tugas
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => {
                  const children = project.tasks.filter((task) => task.parentId === selected.id)
                  const question =
                    children.length > 0
                      ? `Hapus "${selected.name}" beserta ${children.length} sub-tugasnya?`
                      : `Hapus tugas "${selected.name}"?`
                  if (window.confirm(question)) {
                    dispatch({ type: 'deleteTask', id: selected.id, withChildren: true })
                    selectTask(null)
                  }
                }}
              >
                Hapus
              </button>
            </div>
          </header>

          {selected.description ? <p className="details-desc">{selected.description}</p> : null}

          <dl className="stat-list stat-list-wide">
            <div>
              <dt>Mulai</dt>
              <dd>{formatISODate(selectedEntry.startDate)}</dd>
            </div>
            <div>
              <dt>Selesai</dt>
              <dd>{formatISODate(selectedEntry.finishDate)}</dd>
            </div>
            <div>
              <dt>Durasi</dt>
              <dd>
                {formatNumber(selectedEntry.duration)} hari kerja
                {selectedEntry.isSummary ? ' (dari sub-tugas)' : ''}
              </dd>
            </div>
            <div>
              <dt>Total float</dt>
              <dd>{round2(selectedEntry.totalFloat)} hari</dd>
            </div>
            <div>
              <dt>Progress</dt>
              <dd>{selected.progress}%</dd>
            </div>
            <div>
              <dt>Estimasi biaya</dt>
              <dd>{formatCurrency(taskCost(selected, project.resources, selectedEntry.duration))}</dd>
            </div>
          </dl>

          <div className="details-columns">
            <div>
              <h4>Pendahulu</h4>
              {selected.dependencies.length === 0 ? (
                <p className="hint">Tidak ada pendahulu.</p>
              ) : (
                <ul className="plain-list">
                  {selected.dependencies.map((dependency) => (
                    <li key={dependency.id}>
                      {nameOf(dependency.predecessorId)}
                      <span className="muted">
                        {' '}
                        — {dependency.type === 'FS' ? 'Finish to Start' : 'Start to Start'}
                        {dependency.lag !== 0
                          ? `, jeda ${dependency.lag >= 0 ? '+' : ''}${dependency.lag} hari`
                          : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <h4>Anggota tim</h4>
              {selected.assignments.length === 0 ? (
                <p className="hint">Belum ada anggota yang dialokasikan.</p>
              ) : (
                <ul className="plain-list">
                  {selected.assignments.map((assignment) => {
                    const resource = project.resources.find(
                      (item) => item.id === assignment.resourceId,
                    )
                    return (
                      <li key={assignment.resourceId}>
                        <span className="dot" style={{ background: resource?.color ?? '#94a3b8' }} />
                        {resource?.name ?? '(tidak ditemukan)'}
                        <span className="muted"> — {assignment.allocation}%</span>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          </div>
        </div>
      ) : (
        <p className="hint">
          Klik salah satu bar untuk melihat detail, atau tarik bar untuk menggeser jadwal.
        </p>
      )}

      {formTarget ? (
        <TaskFormModal
          taskId={formTarget.taskId}
          defaultParentId={formTarget.parentId}
          onClose={() => setFormTarget(null)}
        />
      ) : null}
    </section>
  )
}
