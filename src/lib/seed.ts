import {
  DATA_VERSION,
  DEFAULT_WORKING_DAYS,
  TASK_COLORS,
  RESOURCE_COLORS,
} from '../types'
import type { CalendarConfig, Task, ProjectData, Resource } from '../types'
import { addDays, startOfWeek, toISODate } from './dates'
import { computeSchedule } from './schedule'

interface SeedTask {
  id: string
  name: string
  parentId: string | null
  duration: number
  /* [predecessorId, type, lag] tuples, or null for a task with no predecessor. */
  deps: Array<[string, 'FS' | 'SS', number]> | null
  priority: Task['priority']
  color: string
  progress: number
  description: string
  assignments: Array<[string, number]>
  pert?: [number, number, number]
}

const SEED_RESOURCES: Resource[] = [
  {
    id: 'r-rina',
    name: 'Rina Wijaya',
    email: 'rina.wijaya@example.com',
    role: 'Project Manager',
    salary: 18_000_000,
    color: RESOURCE_COLORS[0] as string,
  },
  {
    id: 'r-budi',
    name: 'Budi Santoso',
    email: 'budi.santoso@example.com',
    role: 'Backend Engineer',
    salary: 15_500_000,
    color: RESOURCE_COLORS[1] as string,
  },
  {
    id: 'r-sari',
    name: 'Sari Dewi',
    email: 'sari.dewi@example.com',
    role: 'UI/UX Designer',
    salary: 13_000_000,
    color: RESOURCE_COLORS[2] as string,
  },
  {
    id: 'r-andi',
    name: 'Andi Pratama',
    email: 'andi.pratama@example.com',
    role: 'Frontend Engineer',
    salary: 14_500_000,
    color: RESOURCE_COLORS[3] as string,
  },
  {
    id: 'r-maya',
    name: 'Maya Lestari',
    email: 'maya.lestari@example.com',
    role: 'QA Engineer',
    salary: 12_000_000,
    color: RESOURCE_COLORS[4] as string,
  },
]

const SEED_TASKS: SeedTask[] = [
  {
    id: 'p-inisiasi',
    name: '1. Inisiasi',
    parentId: null,
    duration: 0,
    deps: null,
    priority: 'high',
    color: TASK_COLORS[0] as string,
    progress: 0,
    description: 'Tahap pembukaan proyek dan penyelarasan dengan pemangku kepentingan.',
    assignments: [],
  },
  {
    id: 't-charter',
    name: 'Project Charter',
    parentId: 'p-inisiasi',
    duration: 3,
    deps: null,
    priority: 'high',
    color: TASK_COLORS[0] as string,
    progress: 100,
    description: 'Menyusun dokumen charter: tujuan, ruang lingkup, dan kriteria sukses.',
    assignments: [['r-rina', 100]],
    pert: [2, 3, 5],
  },
  {
    id: 't-stakeholder',
    name: 'Analisis Stakeholder',
    parentId: 'p-inisiasi',
    duration: 2,
    deps: [['t-charter', 'FS', 0]],
    priority: 'medium',
    color: TASK_COLORS[0] as string,
    progress: 100,
    description: 'Memetakan pemangku kepentingan dan kebutuhan komunikasinya.',
    assignments: [['r-rina', 100]],
    pert: [1, 2, 4],
  },
  {
    id: 'p-desain',
    name: '2. Desain',
    parentId: null,
    duration: 0,
    deps: null,
    priority: 'high',
    color: TASK_COLORS[1] as string,
    progress: 0,
    description: 'Tahap perancangan kebutuhan, antarmuka, arsitektur, dan data.',
    assignments: [],
  },
  {
    id: 't-requirements',
    name: 'Pengumpulan Kebutuhan',
    parentId: 'p-desain',
    duration: 5,
    deps: [['t-stakeholder', 'FS', 0]],
    priority: 'high',
    color: TASK_COLORS[1] as string,
    progress: 60,
    description: 'Wawancara pengguna dan penyusunan daftar kebutuhan fungsional.',
    assignments: [
      ['r-rina', 50],
      ['r-sari', 50],
    ],
    pert: [4, 5, 8],
  },
  {
    id: 't-wireframe',
    name: 'Wireframe UX',
    parentId: 'p-desain',
    duration: 4,
    deps: [['t-requirements', 'SS', 2]],
    priority: 'medium',
    color: TASK_COLORS[1] as string,
    progress: 0,
    description: 'Rancangan low-fidelity untuk alur layar utama. Mulai 2 hari setelah analisis kebutuhan.',
    assignments: [['r-sari', 100]],
    pert: [3, 4, 7],
  },
  {
    id: 't-architecture',
    name: 'Arsitektur Sistem',
    parentId: 'p-desain',
    duration: 4,
    deps: [['t-requirements', 'FS', 0]],
    priority: 'high',
    color: TASK_COLORS[1] as string,
    progress: 0,
    description: 'Menetapkan arsitektur aplikasi, teknologi, dan kontrak API.',
    assignments: [
      ['r-budi', 60],
      ['r-andi', 40],
    ],
    pert: [3, 4, 6],
  },
  {
    id: 't-dbdesign',
    name: 'Desain Basis Data',
    parentId: 'p-desain',
    duration: 3,
    deps: [['t-architecture', 'FS', 0]],
    priority: 'high',
    color: TASK_COLORS[1] as string,
    progress: 0,
    description: 'ERD, normalisasi, dan skrip migrasi awal.',
    assignments: [['r-budi', 100]],
    pert: [2, 3, 5],
  },
  {
    id: 'p-pengembangan',
    name: '3. Pengembangan',
    parentId: null,
    duration: 0,
    deps: null,
    priority: 'high',
    color: TASK_COLORS[2] as string,
    progress: 0,
    description: 'Tahap implementasi backend, frontend, dan integrasinya.',
    assignments: [],
  },
  {
    id: 't-backend',
    name: 'API Backend',
    parentId: 'p-pengembangan',
    duration: 10,
    deps: [['t-dbdesign', 'FS', 0]],
    priority: 'high',
    color: TASK_COLORS[2] as string,
    progress: 0,
    description: 'Implementasi endpoint, autentikasi, dan logika bisnis.',
    assignments: [
      ['r-budi', 80],
      ['r-andi', 20],
    ],
    pert: [8, 10, 16],
  },
  {
    id: 't-frontend',
    name: 'Antarmuka Frontend',
    parentId: 'p-pengembangan',
    duration: 12,
    deps: [['t-backend', 'SS', 2]],
    priority: 'medium',
    color: TASK_COLORS[2] as string,
    progress: 0,
    description: 'Implementasi halaman dan komponen UI. Mulai 2 hari setelah API backend dimulai.',
    assignments: [
      ['r-andi', 80],
      ['r-sari', 20],
    ],
    pert: [10, 12, 20],
  },
  {
    id: 't-integration',
    name: 'Integrasi Frontend & Backend',
    parentId: 'p-pengembangan',
    duration: 4,
    deps: [['t-backend', 'FS', 0]],
    priority: 'high',
    color: TASK_COLORS[2] as string,
    progress: 0,
    description: 'Menyambungkan UI ke API, penanganan error, dan penyempurnaan.',
    assignments: [
      ['r-budi', 50],
      ['r-andi', 50],
    ],
    pert: [3, 4, 8],
  },
  {
    id: 'p-pengujian',
    name: '4. Pengujian',
    parentId: null,
    duration: 0,
    deps: null,
    priority: 'high',
    color: TASK_COLORS[3] as string,
    progress: 0,
    description: 'Tahap verifikasi mutu dan penerimaan pengguna.',
    assignments: [],
  },
  {
    id: 't-testplan',
    name: 'Penyusunan Test Plan',
    parentId: 'p-pengujian',
    duration: 2,
    deps: [['t-requirements', 'FS', 0]],
    priority: 'medium',
    color: TASK_COLORS[3] as string,
    progress: 0,
    description: 'Strategi pengujian, kasus uji, dan kriteria lulus.',
    assignments: [['r-maya', 100]],
    pert: [1, 2, 3],
  },
  {
    id: 't-testing',
    name: 'Pengujian Fungsional',
    parentId: 'p-pengujian',
    duration: 6,
    deps: [['t-integration', 'FS', 0]],
    priority: 'high',
    color: TASK_COLORS[3] as string,
    progress: 0,
    description: 'Eksekusi test case, pelaporan, dan verifikasi perbaikan bug.',
    assignments: [
      ['r-maya', 70],
      ['r-andi', 30],
    ],
    pert: [5, 6, 11],
  },
  {
    id: 't-uat',
    name: 'User Acceptance Test',
    parentId: 'p-pengujian',
    duration: 4,
    deps: [['t-testing', 'FS', 0]],
    priority: 'high',
    color: TASK_COLORS[3] as string,
    progress: 0,
    description: 'Pengujian oleh pengguna kunci dan tanda tangan penerimaan.',
    assignments: [
      ['r-maya', 50],
      ['r-rina', 50],
    ],
    pert: [3, 4, 7],
  },
  {
    id: 'p-rilis',
    name: '5. Rilis',
    parentId: null,
    duration: 0,
    deps: null,
    priority: 'medium',
    color: TASK_COLORS[4] as string,
    progress: 0,
    description: 'Tahap peluncuran dan evaluasi pasca rilis.',
    assignments: [],
  },
  {
    id: 't-releaseprep',
    name: 'Persiapan Rilis',
    parentId: 'p-rilis',
    duration: 2,
    deps: [['t-uat', 'FS', 0]],
    priority: 'medium',
    color: TASK_COLORS[4] as string,
    progress: 0,
    description: 'Checklist rilis, panduan deploy, dan pelatihan singkat pengguna.',
    assignments: [['r-rina', 100]],
    pert: [1, 2, 4],
  },
  {
    id: 't-golive',
    name: 'Go Live',
    parentId: 'p-rilis',
    duration: 1,
    deps: [['t-releaseprep', 'FS', 0]],
    priority: 'high',
    color: TASK_COLORS[4] as string,
    progress: 0,
    description: 'Deploy ke produksi dan pemantauan intensif hari pertama.',
    assignments: [
      ['r-rina', 50],
      ['r-budi', 25],
      ['r-andi', 25],
    ],
    pert: [1, 1, 3],
  },
  {
    id: 't-postlaunch',
    name: 'Evaluasi Pasca Rilis',
    parentId: 'p-rilis',
    duration: 3,
    deps: [['t-golive', 'SS', 1]],
    priority: 'low',
    color: TASK_COLORS[4] as string,
    progress: 0,
    description: 'Pemantauan metrik, retrospektif, dan daftar perbaikan lanjutan.',
    assignments: [['r-rina', 50]],
    pert: [2, 3, 6],
  },
]

/** Monday two weeks ago: the demo project is already underway. */
export function seedAnchor(today: Date = new Date()): Date {
  return addDays(startOfWeek(today), -14)
}

function buildHolidays(anchor: Date): CalendarConfig['holidays'] {
  const year = anchor.getFullYear()
  return [
    { id: 'h-tahun-baru', date: `${year}-01-01`, name: 'Tahun Baru' },
    { id: 'h-kemerdekaan', date: `${year}-08-17`, name: 'Hari Kemerdekaan RI' },
    { id: 'h-natal', date: `${year}-12-25`, name: 'Hari Natal' },
    { id: 'h-tahun-baru-2', date: `${year + 1}-01-01`, name: `Tahun Baru ${year + 1}` },
    {
      id: 'h-offsite',
      date: toISODate(addDays(anchor, 24)),
      name: 'Company Offsite',
    },
    {
      id: 'h-cuti-bersama',
      date: toISODate(addDays(anchor, 45)),
      name: 'Cuti Bersama',
    },
  ]
}

/**
 * Demo project. Every task is pinned to the anchor date; the real dates then
 * come out of the CPM forward pass, which keeps the sample data consistent with
 * whatever the scheduler computes.
 */
export function createSeedProject(today: Date = new Date()): ProjectData {
  const anchor = seedAnchor(today)
  const anchorISO = toISODate(anchor)

  const tasks: Task[] = SEED_TASKS.map((seed) => ({
    id: seed.id,
    name: seed.name,
    description: seed.description,
    duration: seed.duration,
    startDate: anchorISO,
    priority: seed.priority,
    color: seed.color,
    progress: seed.progress,
    parentId: seed.parentId,
    dependencies: (seed.deps ?? []).map(([predecessorId, type, lag], index) => ({
      id: `d-${seed.id}-${index}`,
      predecessorId,
      type,
      lag,
    })),
    assignments: seed.assignments.map(([resourceId, allocation]) => ({
      resourceId,
      allocation,
    })),
    optimistic: seed.pert?.[0] ?? null,
    mostLikely: seed.pert?.[1] ?? null,
    pessimistic: seed.pert?.[2] ?? null,
  }))

  const calendar: CalendarConfig = {
    workingDays: [...DEFAULT_WORKING_DAYS],
    holidays: buildHolidays(anchor),
  }

  const project: ProjectData = {
    version: DATA_VERSION,
    projectName: 'Implementasi Aplikasi Manajemen Proyek',
    tasks,
    resources: SEED_RESOURCES.map((resource) => ({ ...resource })),
    calendar,
  }

  return withComputedStartDates(project)
}

/**
 * Writes the scheduler's start date back onto each task so the stored
 * constraint matches what the CPM pass derives from the dependencies.
 */
export function withComputedStartDates(project: ProjectData): ProjectData {
  const result = computeSchedule(project.tasks, project.calendar)
  if (result.byId.size === 0) return project

  return {
    ...project,
    tasks: project.tasks.map((task) => {
      const schedule = result.byId.get(task.id)
      if (!schedule) return task
      return { ...task, startDate: schedule.startDate }
    }),
  }
}

export function createEmptyProject(projectName = 'Proyek Baru'): ProjectData {
  return {
    version: DATA_VERSION,
    projectName,
    tasks: [],
    resources: [],
    calendar: {
      workingDays: [...DEFAULT_WORKING_DAYS],
      holidays: [],
    },
  }
}
