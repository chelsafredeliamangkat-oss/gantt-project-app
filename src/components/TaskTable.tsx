import { useMemo, useState } from 'react'
import { PRIORITY_LABELS } from '../types'
import { flattenTasks, subtreeIds } from '../lib/hierarchy'
import { formatISODate } from '../lib/format'
import { useProject } from '../store/ProjectContext'
import { useSchedule } from '../store/useSchedule'
import { TaskFormModal } from './TaskFormModal'

export function TaskTable() {
  const { project, dispatch, selectedTaskId, selectTask } = useProject()
  const schedule = useSchedule()
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [formTarget, setFormTarget] = useState<{
    taskId: string | null
    parentId: string | null
  } | null>(null)

  const rows = useMemo(
    () => flattenTasks(project.tasks, { collapsed }),
    [project.tasks, collapsed],
  )

  const nameOf = (taskId: string) =>
    project.tasks.find((task) => task.id === taskId)?.name ?? '(tidak ditemukan)'

  const toggleCollapse = (taskId: string) => {
    setCollapsed((current) => {
      const next = new Set(current)
      if (next.has(taskId)) next.delete(taskId)
      else next.add(taskId)
      return next
    })
  }

  const handleDelete = (taskId: string, name: string, childCount: number) => {
    const question =
      childCount > 0
        ? `Hapus "${name}" beserta ${childCount} sub-tugasnya?`
        : `Hapus tugas "${name}"?`
    if (!window.confirm(question)) return
    const removedIds = new Set(subtreeIds(project.tasks, taskId))
    dispatch({ type: 'deleteTask', id: taskId, withChildren: true })
    if (selectedTaskId && removedIds.has(selectedTaskId)) selectTask(null)
  }

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
          <span className="muted">
            {project.tasks.length} tugas (termasuk sub-tugas)
          </span>
        </div>
        <div className="toolbar-group">
          {collapsed.size > 0 ? (
            <button type="button" className="btn" onClick={() => setCollapsed(new Set())}>
              Buka semua
            </button>
          ) : null}
        </div>
      </div>

      {project.tasks.length === 0 ? (
        <p className="empty-state">
          Belum ada tugas. Tambahkan tugas pertama, atau muat kembali data contoh dari menu
          di bagian atas.
        </p>
      ) : (
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th className="col-name">Nama tugas</th>
                <th>Prioritas</th>
                <th className="num">Durasi</th>
                <th>Mulai</th>
                <th>Selesai</th>
                <th className="num">Float</th>
                <th>Pendahulu</th>
                <th>Tim</th>
                <th className="num">Progress</th>
                <th className="col-actions">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const task = row.task
                const entry = schedule.byId.get(task.id)
                const childCount = project.tasks.filter(
                  (other) => other.parentId === task.id,
                ).length
                return (
                  <tr
                    key={task.id}
                    className={[
                      selectedTaskId === task.id ? 'row-selected' : '',
                      entry?.critical ? 'row-critical' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    onClick={() => selectTask(task.id)}
                  >
                    <td className="col-name">
                      <div
                        className="tree-cell"
                        style={{ paddingLeft: `${row.depth * 18}px` }}
                      >
                        {row.hasChildren ? (
                          <button
                            type="button"
                            className="tree-toggle"
                            aria-label={row.expanded ? 'Tutup sub-tugas' : 'Buka sub-tugas'}
                            onClick={(event) => {
                              event.stopPropagation()
                              toggleCollapse(task.id)
                            }}
                          >
                            {row.expanded ? '▾' : '▸'}
                          </button>
                        ) : (
                          <span className="tree-spacer" />
                        )}
                        <span className="dot" style={{ background: task.color }} />
                        <span className="name-text">{task.name}</span>
                        {entry?.critical ? <span className="critical-dot" title="Jalur kritis" /> : null}
                      </div>
                    </td>
                    <td>
                      <span className={`badge badge-${task.priority}`}>
                        {PRIORITY_LABELS[task.priority]}
                      </span>
                    </td>
                    <td className="num">
                      {entry ? `${entry.duration} hari` : '—'}
                      {row.hasChildren ? <span className="muted"> *</span> : null}
                    </td>
                    <td>{entry ? formatISODate(entry.startDate) : '—'}</td>
                    <td>{entry ? formatISODate(entry.finishDate) : '—'}</td>
                    <td className="num">
                      {entry && !entry.isSummary ? `${entry.totalFloat} hari` : '—'}
                    </td>
                    <td>
                      {task.dependencies.length === 0
                        ? '—'
                        : task.dependencies
                            .map((dependency) => {
                              const suffix = dependency.lag ? `${dependency.lag >= 0 ? '+' : ''}${dependency.lag}` : ''
                              return `${nameOf(dependency.predecessorId)} (${dependency.type}${suffix})`
                            })
                            .join(', ')}
                    </td>
                    <td>
                      {task.assignments.length === 0
                        ? '—'
                        : task.assignments
                            .map((assignment) => {
                              const resource = project.resources.find(
                                (item) => item.id === assignment.resourceId,
                              )
                              return `${resource?.name ?? '?'} (${assignment.allocation}%)`
                            })
                            .join(', ')}
                    </td>
                    <td className="num">
                      <div className="progress-cell">
                        <span className="progress-track">
                          <span
                            className="progress-fill"
                            style={{ width: `${task.progress}%`, background: task.color }}
                          />
                        </span>
                        <span className="muted">{task.progress}%</span>
                      </div>
                    </td>
                    <td className="col-actions">
                      <button
                        type="button"
                        className="icon-btn"
                        title="Tambah sub-tugas"
                        aria-label={`Tambah sub-tugas untuk ${task.name}`}
                        onClick={(event) => {
                          event.stopPropagation()
                          setFormTarget({ taskId: null, parentId: task.id })
                        }}
                      >
                        +
                      </button>
                      <button
                        type="button"
                        className="icon-btn"
                        title="Edit"
                        aria-label={`Edit ${task.name}`}
                        onClick={(event) => {
                          event.stopPropagation()
                          setFormTarget({ taskId: task.id, parentId: null })
                        }}
                      >
                        ✎
                      </button>
                      <button
                        type="button"
                        className="icon-btn"
                        title="Duplikat"
                        aria-label={`Duplikat ${task.name}`}
                        onClick={(event) => {
                          event.stopPropagation()
                          dispatch({ type: 'duplicateTask', id: task.id })
                        }}
                      >
                        ⧉
                      </button>
                      <button
                        type="button"
                        className="icon-btn icon-btn-danger"
                        title="Hapus"
                        aria-label={`Hapus ${task.name}`}
                        onClick={(event) => {
                          event.stopPropagation()
                          handleDelete(task.id, task.name, childCount)
                        }}
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="hint">
        Tanda <strong>*</strong> berarti durasi tugas induk dihitung otomatis dari rentang
        sub-tugasnya.
      </p>

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
