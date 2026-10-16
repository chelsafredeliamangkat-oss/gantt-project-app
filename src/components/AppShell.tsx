import { useState } from 'react'
import { useProject } from '../store/ProjectContext'
import { useSchedule } from '../store/useSchedule'
import { formatISODate } from '../lib/format'
import { GanttPanel } from './GanttPanel'
import { TaskTable } from './TaskTable'
import { ResourcePanel } from './ResourcePanel'
import { CalendarPanel } from './CalendarPanel'
import { AnalysisPanel } from './AnalysisPanel'

type TabId = 'gantt' | 'tasks' | 'resources' | 'calendar' | 'analysis'

const TABS: Array<{ id: TabId; label: string; icon: string }> = [
  { id: 'gantt', label: 'Gantt Chart', icon: '▦' },
  { id: 'tasks', label: 'Tugas', icon: '☑' },
  { id: 'resources', label: 'Sumber Daya', icon: '👥' },
  { id: 'calendar', label: 'Kalender', icon: '📅' },
  { id: 'analysis', label: 'Analisis', icon: '📈' },
]

export function AppShell() {
  const { project, dispatch, resetToSeed, clearAll, savedAt } = useProject()
  const schedule = useSchedule()
  const [tab, setTab] = useState<TabId>('gantt')

  const handleReset = () => {
    if (
      window.confirm(
        'Muat ulang data contoh? Seluruh perubahan yang tersimpan akan diganti.',
      )
    ) {
      resetToSeed()
    }
  }

  const handleClear = () => {
    if (window.confirm('Hapus semua data proyek (tugas, anggota, kalender) dan mulai kosong?')) {
      clearAll()
    }
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <span className="brand-mark">G</span>
          <div>
            <h1>Manajemen Proyek Gantt</h1>
            <p className="brand-sub">
              CPM, PERT, sumber daya, dan kalender hari kerja
            </p>
          </div>
        </div>

        <div className="header-meta">
          <label className="inline-field inline-field-wide">
            <span>Nama proyek</span>
            <input
              value={project.projectName}
              onChange={(event) =>
                dispatch({ type: 'setProjectName', name: event.target.value })
              }
            />
          </label>
          <dl className="header-stats">
            <div>
              <dt>Mulai</dt>
              <dd>{schedule.projectStart ? formatISODate(schedule.projectStart) : '—'}</dd>
            </div>
            <div>
              <dt>Selesai</dt>
              <dd>{schedule.projectFinish ? formatISODate(schedule.projectFinish) : '—'}</dd>
            </div>
            <div>
              <dt>Durasi</dt>
              <dd>{schedule.durationDays} hari kerja</dd>
            </div>
          </dl>
          <div className="header-actions">
            <button type="button" className="btn" onClick={handleReset}>
              Muat data contoh
            </button>
            <button type="button" className="btn btn-ghost" onClick={handleClear}>
              Kosongkan
            </button>
          </div>
        </div>
      </header>

      <nav className="tabs" aria-label="Navigasi utama">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`tab${tab === item.id ? ' tab-active' : ''}`}
            aria-current={tab === item.id ? 'page' : undefined}
            onClick={() => setTab(item.id)}
          >
            <span className="tab-icon" aria-hidden="true">
              {item.icon}
            </span>
            {item.label}
          </button>
        ))}
      </nav>

      <main className="app-main">
        {tab === 'gantt' ? <GanttPanel /> : null}
        {tab === 'tasks' ? <TaskTable /> : null}
        {tab === 'resources' ? <ResourcePanel /> : null}
        {tab === 'calendar' ? <CalendarPanel /> : null}
        {tab === 'analysis' ? <AnalysisPanel /> : null}
      </main>

      <footer className="app-footer">
        <span>
          Data disimpan otomatis di localStorage browser
          {savedAt ? ` · terakhir ${new Date(savedAt).toLocaleTimeString('id-ID')}` : ''}.
        </span>
        <span>
          {project.tasks.length} tugas · {project.resources.length} anggota ·{' '}
          {project.calendar.workingDays.length} hari kerja/pekan ·{' '}
          {project.calendar.holidays.length} hari libur
        </span>
      </footer>
    </div>
  )
}
