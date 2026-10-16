import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import {
  PRIORITY_LABELS,
  PRIORITY_ORDER,
  TASK_COLORS,
} from '../types'
import type { Assignment, Dependency, Priority, Task } from '../types'
import { Modal } from './Modal'
import { hasChildren, subtreeIds, wouldCreateCycle } from '../lib/hierarchy'
import { createId } from '../lib/id'
import { TODAY_ISO } from '../lib/dates'
import { formatISODate } from '../lib/format'
import { useProject } from '../store/ProjectContext'
import { useSchedule } from '../store/useSchedule'

interface TaskFormModalProps {
  /** null creates a new task. */
  taskId: string | null
  defaultParentId?: string | null
  onClose: () => void
}

interface DependencyDraft {
  id: string
  predecessorId: string
  type: Dependency['type']
  lag: number
}

interface FormState {
  name: string
  description: string
  parentId: string | null
  priority: Priority
  color: string
  duration: number
  startDate: string
  progress: number
  optimistic: string
  mostLikely: string
  pessimistic: string
  dependencies: DependencyDraft[]
  assignments: Assignment[]
}

export function TaskFormModal({ taskId, defaultParentId = null, onClose }: TaskFormModalProps) {
  const { project, dispatch } = useProject()
  const schedule = useSchedule()
  const existing = taskId ? project.tasks.find((task) => task.id === taskId) ?? null : null
  const [error, setError] = useState('')

  const isSummary = existing ? hasChildren(project.tasks, existing.id) : false
  const computed = existing ? schedule.byId.get(existing.id) : undefined

  const [form, setForm] = useState<FormState>(() => ({
    name: existing?.name ?? '',
    description: existing?.description ?? '',
    parentId: existing ? existing.parentId : defaultParentId,
    priority: existing?.priority ?? 'medium',
    color: existing?.color ?? (TASK_COLORS[0] as string),
    duration: existing?.duration && existing.duration > 0 ? existing.duration : 3,
    startDate: existing?.startDate ?? schedule.projectStart ?? TODAY_ISO,
    progress: existing?.progress ?? 0,
    optimistic: existing?.optimistic != null ? String(existing.optimistic) : '',
    mostLikely: existing?.mostLikely != null ? String(existing.mostLikely) : '',
    pessimistic: existing?.pessimistic != null ? String(existing.pessimistic) : '',
    dependencies: (existing?.dependencies ?? []).map((dependency) => ({
      id: dependency.id,
      predecessorId: dependency.predecessorId,
      type: dependency.type,
      lag: dependency.lag,
    })),
    assignments: (existing?.assignments ?? []).map((assignment) => ({ ...assignment })),
  }))

  const patch = (values: Partial<FormState>) => setForm((current) => ({ ...current, ...values }))

  const parentOptions = useMemo(() => {
    const blocked = taskId ? new Set(subtreeIds(project.tasks, taskId)) : new Set<string>()
    return project.tasks.filter((task) => !blocked.has(task.id))
  }, [project.tasks, taskId])

  const predecessorOptions = useMemo(() => {
    const blocked = taskId ? new Set(subtreeIds(project.tasks, taskId)) : new Set<string>()
    // Summaries are derived, so they cannot drive another task.
    return project.tasks.filter(
      (task) => !blocked.has(task.id) && !hasChildren(project.tasks, task.id),
    )
  }, [project.tasks, taskId])

  const addDependency = () => {
    const used = new Set(form.dependencies.map((dependency) => dependency.predecessorId))
    const candidate = predecessorOptions.find((task) => !used.has(task.id))
    if (!candidate) return
    patch({
      dependencies: [
        ...form.dependencies,
        { id: createId('d'), predecessorId: candidate.id, type: 'FS', lag: 0 },
      ],
    })
  }

  const updateDependency = (id: string, values: Partial<DependencyDraft>) => {
    patch({
      dependencies: form.dependencies.map((dependency) =>
        dependency.id === id ? { ...dependency, ...values } : dependency,
      ),
    })
  }

  const removeDependency = (id: string) => {
    patch({ dependencies: form.dependencies.filter((dependency) => dependency.id !== id) })
  }

  const toggleAssignment = (resourceId: string, checked: boolean) => {
    patch({
      assignments: checked
        ? [...form.assignments, { resourceId, allocation: 100 }]
        : form.assignments.filter((assignment) => assignment.resourceId !== resourceId),
    })
  }

  const updateAllocation = (resourceId: string, allocation: number) => {
    patch({
      assignments: form.assignments.map((assignment) =>
        assignment.resourceId === resourceId
          ? { ...assignment, allocation: Math.min(100, Math.max(1, Math.round(allocation) || 1)) }
          : assignment,
      ),
    })
  }

  const toNumberOrNull = (value: string): number | null => {
    if (value.trim() === '') return null
    const parsed = Number(value)
    return Number.isFinite(parsed) ? Math.round(parsed) : null
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const name = form.name.trim()
    if (!name) {
      setError('Nama tugas wajib diisi.')
      return
    }
    if (!isSummary && (!Number.isFinite(form.duration) || form.duration < 1)) {
      setError('Durasi minimal 1 hari kerja.')
      return
    }
    if (form.parentId && taskId && wouldCreateCycle(project.tasks, taskId, form.parentId)) {
      setError('Tugas induk tidak boleh berada di dalam sub-tugasnya sendiri.')
      return
    }
    const duplicate = form.dependencies.find(
      (dependency, index) =>
        form.dependencies.findIndex(
          (other) =>
            other.predecessorId === dependency.predecessorId && other.type === dependency.type,
        ) !== index,
    )
    if (duplicate) {
      setError('Ada keterkaitan pendahulu yang sama dua kali.')
      return
    }

    const payload: Omit<Task, 'id'> = {
      name,
      description: form.description.trim(),
      parentId: form.parentId,
      priority: form.priority,
      color: form.color,
      duration: isSummary ? 0 : Math.max(1, Math.round(form.duration)),
      startDate: form.startDate,
      progress: Math.min(100, Math.max(0, Math.round(form.progress))),
      dependencies: form.dependencies.map((dependency) => ({
        id: dependency.id,
        predecessorId: dependency.predecessorId,
        type: dependency.type,
        lag: Math.round(dependency.lag) || 0,
      })),
      assignments: form.assignments,
      optimistic: toNumberOrNull(form.optimistic),
      mostLikely: toNumberOrNull(form.mostLikely),
      pessimistic: toNumberOrNull(form.pessimistic),
    }

    if (existing) {
      dispatch({ type: 'updateTask', id: existing.id, patch: payload })
    } else {
      dispatch({ type: 'addTask', task: { ...payload, id: createId('t') } })
    }
    onClose()
  }

  return (
    <Modal
      title={existing ? `Edit tugas: ${existing.name}` : 'Tambah tugas'}
      onClose={onClose}
      wide
      onSubmit={handleSubmit}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Batal
          </button>
          <button type="submit" className="btn btn-primary">
            {existing ? 'Simpan perubahan' : 'Tambah tugas'}
          </button>
        </>
      }
    >
      <div className="task-form">
        {error ? <p className="alert alert-error">{error}</p> : null}

        <div className="form-grid">
          <div className="form-col">
            <label className="field">
              <span>Nama tugas</span>
              <input
                value={form.name}
                onChange={(event) => patch({ name: event.target.value })}
                placeholder="mis. Pengujian Fungsional"
                autoFocus
              />
            </label>

            <label className="field">
              <span>Deskripsi</span>
              <textarea
                rows={2}
                value={form.description}
                onChange={(event) => patch({ description: event.target.value })}
                placeholder="Keterangan singkat"
              />
            </label>

            <label className="field">
              <span>Tugas induk (sub-tugas dari)</span>
              <select
                value={form.parentId ?? ''}
                onChange={(event) => patch({ parentId: event.target.value || null })}
              >
                <option value="">— Tanpa induk (level teratas) —</option>
                {parentOptions.map((task) => (
                  <option key={task.id} value={task.id}>
                    {task.name}
                  </option>
                ))}
              </select>
            </label>

            <div className="field-row">
              <label className="field">
                <span>Durasi (hari kerja)</span>
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={isSummary ? '' : form.duration}
                  disabled={isSummary}
                  onChange={(event) => patch({ duration: Number(event.target.value) })}
                />
              </label>
              <label className="field">
                <span>Tanggal mulai</span>
                <input
                  type="date"
                  value={form.startDate}
                  onChange={(event) => patch({ startDate: event.target.value })}
                />
              </label>
            </div>
            {isSummary ? (
              <p className="hint">
                Tugas ini punya sub-tugas, sehingga durasi dan tanggalnya dihitung
                otomatis dari rentang sub-tugas.
              </p>
            ) : null}

            <div className="field-row">
              <label className="field">
                <span>Prioritas</span>
                <select
                  value={form.priority}
                  onChange={(event) => patch({ priority: event.target.value as Priority })}
                >
                  {PRIORITY_ORDER.map((priority) => (
                    <option key={priority} value={priority}>
                      {PRIORITY_LABELS[priority]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Progress ({form.progress}%)</span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={form.progress}
                  onChange={(event) => patch({ progress: Number(event.target.value) })}
                />
              </label>
            </div>

            <div className="field">
              <span>Warna indikator</span>
              <div className="color-picker">
                {TASK_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    className={`swatch${form.color === color ? ' swatch-active' : ''}`}
                    style={{ background: color }}
                    aria-label={`Warna ${color}`}
                    onClick={() => patch({ color })}
                  />
                ))}
                <input
                  type="color"
                  value={form.color}
                  onChange={(event) => patch({ color: event.target.value })}
                  aria-label="Warna khusus"
                />
              </div>
            </div>

            <fieldset className="fieldset">
              <legend>Estimasi PERT (hari kerja, opsional)</legend>
              <div className="field-row field-row-3">
                <label className="field">
                  <span>Optimistis</span>
                  <input
                    type="number"
                    min={1}
                    placeholder="otomatis"
                    value={form.optimistic}
                    onChange={(event) => patch({ optimistic: event.target.value })}
                  />
                </label>
                <label className="field">
                  <span>Paling mungkin</span>
                  <input
                    type="number"
                    min={1}
                    placeholder="otomatis"
                    value={form.mostLikely}
                    onChange={(event) => patch({ mostLikely: event.target.value })}
                  />
                </label>
                <label className="field">
                  <span>Pesimistis</span>
                  <input
                    type="number"
                    min={1}
                    placeholder="otomatis"
                    value={form.pessimistic}
                    onChange={(event) => patch({ pessimistic: event.target.value })}
                  />
                </label>
              </div>
            </fieldset>
          </div>

          <div className="form-col">
            <fieldset className="fieldset">
              <legend>Pendahulu &amp; jeda</legend>
              {form.dependencies.length === 0 ? (
                <p className="hint">Belum ada pendahulu. Tugas mulai sesuai tanggalnya.</p>
              ) : null}
              {form.dependencies.map((dependency) => (
                <div className="dependency-row" key={dependency.id}>
                  <select
                    value={dependency.predecessorId}
                    aria-label="Tugas pendahulu"
                    onChange={(event) =>
                      updateDependency(dependency.id, { predecessorId: event.target.value })
                    }
                  >
                    {predecessorOptions.map((task) => (
                      <option key={task.id} value={task.id}>
                        {task.name}
                      </option>
                    ))}
                  </select>
                  <select
                    value={dependency.type}
                    aria-label="Jenis keterkaitan"
                    onChange={(event) =>
                      updateDependency(dependency.id, {
                        type: event.target.value as Dependency['type'],
                      })
                    }
                  >
                    <option value="FS">Finish to Start</option>
                    <option value="SS">Start to Start</option>
                  </select>
                  <input
                    type="number"
                    step={1}
                    className="lag-input"
                    aria-label="Jeda hari"
                    title="Jeda (lag) dalam hari kerja, boleh negatif"
                    value={dependency.lag}
                    onChange={(event) =>
                      updateDependency(dependency.id, { lag: Number(event.target.value) })
                    }
                  />
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label="Hapus keterkaitan"
                    onClick={() => removeDependency(dependency.id)}
                  >
                    ×
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="btn btn-ghost"
                onClick={addDependency}
                disabled={predecessorOptions.length === 0}
              >
                + Tambah pendahulu
              </button>
              <p className="hint">Jeda dihitung dalam hari kerja (boleh negatif).</p>
            </fieldset>

            <fieldset className="fieldset">
              <legend>Alokasi anggota tim</legend>
              {project.resources.length === 0 ? (
                <p className="hint">
                  Belum ada anggota tim. Tambahkan dulu di tab Sumber Daya.
                </p>
              ) : null}
              {project.resources.map((resource) => {
                const assignment = form.assignments.find(
                  (item) => item.resourceId === resource.id,
                )
                return (
                  <div className="assignment-row" key={resource.id}>
                    <label className="checkbox">
                      <input
                        type="checkbox"
                        checked={Boolean(assignment)}
                        onChange={(event) => toggleAssignment(resource.id, event.target.checked)}
                      />
                      <span className="dot" style={{ background: resource.color }} />
                      <span>
                        <strong>{resource.name}</strong>
                        <em>{resource.role}</em>
                      </span>
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={100}
                      step={5}
                      className="allocation-input"
                      aria-label={`Alokasi ${resource.name} (%)`}
                      disabled={!assignment}
                      value={assignment?.allocation ?? ''}
                      onChange={(event) =>
                        updateAllocation(resource.id, Number(event.target.value))
                      }
                    />
                    <span className="percent">%</span>
                  </div>
                )
              })}
            </fieldset>

            {existing ? (
              <div className="panel-muted">
                <h4>Hasil perhitungan penjadwalan</h4>
                <dl className="stat-list">
                  <div>
                    <dt>Mulai (otomatis)</dt>
                    <dd>
                      {computed ? formatISODate(computed.startDate) : '—'}
                    </dd>
                  </div>
                  <div>
                    <dt>Selesai (otomatis)</dt>
                    <dd>
                      {computed ? formatISODate(computed.finishDate) : '—'}
                    </dd>
                  </div>
                  <div>
                    <dt>Total float</dt>
                    <dd>{computed ? `${computed.totalFloat} hari` : '—'}</dd>
                  </div>
                  <div>
                    <dt>Status</dt>
                    <dd>{computed?.critical ? 'Kritis' : 'Tidak kritis'}</dd>
                  </div>
                </dl>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </Modal>
  )
}
