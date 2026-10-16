import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { RESOURCE_COLORS } from '../types'
import type { Resource } from '../types'
import { Modal } from './Modal'
import { createId } from '../lib/id'
import { dailyRate } from '../lib/costs'
import { formatCurrency, formatCurrencyCompact, formatISODate, round2 } from '../lib/format'
import { useProject } from '../store/ProjectContext'
import { useCosts } from '../store/useCosts'
import { useSchedule } from '../store/useSchedule'

interface DraftState {
  id: string | null
  name: string
  email: string
  role: string
  salary: string
  color: string
}

const EMPTY_DRAFT: DraftState = {
  id: null,
  name: '',
  email: '',
  role: '',
  salary: '10000000',
  color: RESOURCE_COLORS[0] as string,
}

export function ResourcePanel() {
  const { project, dispatch, selectTask } = useProject()
  const schedule = useSchedule()
  const costs = useCosts()
  const [draft, setDraft] = useState<DraftState | null>(null)
  const [error, setError] = useState('')

  const usageById = useMemo(
    () => new Map(costs.rows.map((row) => [row.resourceId, row])),
    [costs.rows],
  )

  const taskName = (taskId: string) =>
    project.tasks.find((task) => task.id === taskId)?.name ?? '(tidak ditemukan)'

  const openNew = () => {
    setError('')
    setDraft({ ...EMPTY_DRAFT, color: RESOURCE_COLORS[project.resources.length % RESOURCE_COLORS.length] as string })
  }

  const openEdit = (resource: Resource) => {
    setError('')
    setDraft({
      id: resource.id,
      name: resource.name,
      email: resource.email,
      role: resource.role,
      salary: String(resource.salary),
      color: resource.color,
    })
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!draft) return
    const name = draft.name.trim()
    if (!name) {
      setError('Nama anggota wajib diisi.')
      return
    }
    if (draft.email.trim() && !draft.email.includes('@')) {
      setError('Format email tidak valid.')
      return
    }
    const salary = Number(draft.salary)
    if (!Number.isFinite(salary) || salary < 0) {
      setError('Gaji harus berupa angka nol atau lebih.')
      return
    }

    const payload = {
      name,
      email: draft.email.trim(),
      role: draft.role.trim(),
      salary: Math.round(salary),
      color: draft.color,
    }

    if (draft.id) {
      dispatch({ type: 'updateResource', id: draft.id, patch: payload })
    } else {
      dispatch({ type: 'addResource', resource: { ...payload, id: createId('r') } })
    }
    setDraft(null)
  }

  const removeResource = (resource: Resource) => {
    const used = project.tasks.filter((task) =>
      task.assignments.some((assignment) => assignment.resourceId === resource.id),
    ).length
    const question =
      used > 0
        ? `Hapus ${resource.name}? Alokasi pada ${used} tugas akan dilepas.`
        : `Hapus ${resource.name}?`
    if (window.confirm(question)) {
      dispatch({ type: 'deleteResource', id: resource.id })
    }
  }

  return (
    <section className="panel">
      <div className="toolbar">
        <div className="toolbar-group">
          <button type="button" className="btn btn-primary" onClick={openNew}>
            + Anggota baru
          </button>
          <span className="muted">
            {project.resources.length} anggota · total biaya{' '}
            {formatCurrencyCompact(costs.totalCost)} · {round2(costs.totalEffortDays)} orang-hari
          </span>
        </div>
      </div>

      {project.resources.length === 0 ? (
        <p className="empty-state">
          Belum ada anggota tim. Daftarkan anggota untuk bisa mengalokasikannya ke tugas.
        </p>
      ) : (
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Nama</th>
                <th>Email</th>
                <th>Peran</th>
                <th className="num">Gaji / bulan</th>
                <th className="num">Tarif / hari</th>
                <th className="num">Tugas</th>
                <th className="num">Orang-hari</th>
                <th className="num">Beban</th>
                <th className="num">Biaya</th>
                <th className="col-actions">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {project.resources.map((resource) => {
                const usage = usageById.get(resource.id)
                return (
                  <tr key={resource.id}>
                    <td>
                      <span className="dot" style={{ background: resource.color }} />
                      <strong>{resource.name}</strong>
                    </td>
                    <td>
                      {resource.email ? (
                        <a href={`mailto:${resource.email}`}>{resource.email}</a>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>{resource.role || '—'}</td>
                    <td className="num">{formatCurrency(resource.salary)}</td>
                    <td className="num">{formatCurrency(dailyRate(resource))}</td>
                    <td className="num">{usage?.taskCount ?? 0}</td>
                    <td className="num">{round2(usage?.effortDays ?? 0)}</td>
                    <td className="num">
                      <div className="load-cell">
                        <span className="progress-track">
                          <span
                            className="progress-fill"
                            style={{
                              width: `${Math.min(100, (usage?.utilization ?? 0) * 100)}%`,
                              background: resource.color,
                            }}
                          />
                        </span>
                        <span className="muted">
                          {Math.round((usage?.utilization ?? 0) * 100)}%
                        </span>
                      </div>
                    </td>
                    <td className="num">{formatCurrency(usage?.cost ?? 0)}</td>
                    <td className="col-actions">
                      <button
                        type="button"
                        className="icon-btn"
                        title="Edit"
                        aria-label={`Edit ${resource.name}`}
                        onClick={() => openEdit(resource)}
                      >
                        ✎
                      </button>
                      <button
                        type="button"
                        className="icon-btn icon-btn-danger"
                        title="Hapus"
                        aria-label={`Hapus ${resource.name}`}
                        onClick={() => removeResource(resource)}
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

      <div className="resource-cards">
        {costs.rows
          .filter((row) => row.tasks.length > 0)
          .map((row) => {
            const resource = project.resources.find((item) => item.id === row.resourceId)
            if (!resource) return null
            return (
              <article className="card" key={row.resourceId}>
                <header>
                  <span className="dot dot-lg" style={{ background: resource.color }} />
                  <h3>{resource.name}</h3>
                  <span className="muted">{resource.role}</span>
                </header>
                <p className="card-meta">
                  {row.taskCount} tugas · {round2(row.effortDays)} orang-hari ·{' '}
                  {formatCurrencyCompact(row.cost)}
                </p>
                <ul className="plain-list">
                  {row.tasks.map((item) => {
                    const entry = schedule.byId.get(item.taskId)
                    return (
                      <li key={item.taskId}>
                        <button
                          type="button"
                          className="link-btn"
                          onClick={() => selectTask(item.taskId)}
                        >
                          {taskName(item.taskId)}
                        </button>
                        <span className="muted">
                          {' '}
                          — {item.allocation}% · {round2(item.effortDays)} hari
                          {entry ? ` · ${formatISODate(entry.startDate)}` : ''}
                        </span>
                      </li>
                    )
                  })}
                </ul>
              </article>
            )
          })}
      </div>

      <p className="hint">
        Tarif harian dihitung dari gaji bulanan dibagi 22 hari kerja. Beban adalah
        perbandingan total orang-hari anggota terhadap durasi proyek.
        {costs.totalEffortDays > 0
          ? ` Rata-rata ${formatCurrency(costs.totalCost / costs.totalEffortDays)} per orang-hari.`
          : ''}
      </p>

      {draft ? (
        <Modal
          title={draft.id ? `Edit anggota: ${draft.name}` : 'Anggota tim baru'}
          onClose={() => setDraft(null)}
          onSubmit={handleSubmit}
          footer={
            <>
              <button type="button" className="btn" onClick={() => setDraft(null)}>
                Batal
              </button>
              <button type="submit" className="btn btn-primary">
                Simpan
              </button>
            </>
          }
        >
          <div className="stack">
            {error ? <p className="alert alert-error">{error}</p> : null}
            <label className="field">
              <span>Nama lengkap</span>
              <input
                value={draft.name}
                autoFocus
                onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                placeholder="mis. Budi Santoso"
              />
            </label>
            <label className="field">
              <span>Email</span>
              <input
                type="email"
                value={draft.email}
                onChange={(event) => setDraft({ ...draft, email: event.target.value })}
                placeholder="nama@perusahaan.com"
              />
            </label>
            <label className="field">
              <span>Peran</span>
              <input
                value={draft.role}
                onChange={(event) => setDraft({ ...draft, role: event.target.value })}
                placeholder="mis. Backend Engineer"
              />
            </label>
            <label className="field">
              <span>Gaji per bulan (Rp)</span>
              <input
                type="number"
                min={0}
                step={500000}
                value={draft.salary}
                onChange={(event) => setDraft({ ...draft, salary: event.target.value })}
              />
            </label>
            <div className="field">
              <span>Warna penanda</span>
              <div className="color-picker">
                {RESOURCE_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    className={`swatch${draft.color === color ? ' swatch-active' : ''}`}
                    style={{ background: color }}
                    aria-label={`Warna ${color}`}
                    onClick={() => setDraft({ ...draft, color })}
                  />
                ))}
                <input
                  type="color"
                  value={draft.color}
                  aria-label="Warna khusus"
                  onChange={(event) => setDraft({ ...draft, color: event.target.value })}
                />
              </div>
            </div>
          </div>
        </Modal>
      ) : null}
    </section>
  )
}
