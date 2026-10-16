import { beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'
import { STORAGE_KEY } from './types'
import type { ProjectData } from './types'
import { createWorkCalendar } from './lib/calendar'
import { parseISODate } from './lib/dates'

function readStored(): ProjectData {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) throw new Error('data proyek belum tersimpan')
  return JSON.parse(raw) as ProjectData
}

function storedTask(taskId: string) {
  const task = readStored().tasks.find((item) => item.id === taskId)
  if (!task) throw new Error(`tugas ${taskId} tidak ditemukan`)
  return task
}

describe('Aplikasi manajemen proyek Gantt', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('memuat data contoh dan menyimpannya ke localStorage', () => {
    render(<App />)

    expect(
      screen.getByDisplayValue('Implementasi Aplikasi Manajemen Proyek'),
    ).toBeInTheDocument()

    const stored = readStored()
    expect(stored.tasks.length).toBeGreaterThan(10)
    expect(stored.resources).toHaveLength(5)
    // Seed memakai hari kerja Senin-Jumat dan sudah dijadwalkan oleh CPM.
    expect(stored.calendar.workingDays).toEqual([1, 2, 3, 4, 5])
    const charter = stored.tasks.find((task) => task.id === 't-charter')
    expect(charter?.startDate).not.toBe('')
  })

  it('menggambar bar Gantt beserta ringkasan fase', () => {
    render(<App />)

    expect(screen.getByRole('button', { name: /Project Charter/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Pengujian Fungsional/ })).toBeInTheDocument()
    expect(screen.getByText('Jalur kritis')).toBeInTheDocument()
  })

  it('menambah tugas baru lewat form', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: '+ Tugas baru' }))
    await user.type(screen.getByLabelText('Nama tugas'), 'Pelatihan Pengguna')
    await user.click(screen.getByRole('button', { name: 'Tambah tugas' }))

    expect(screen.queryByLabelText('Nama tugas')).not.toBeInTheDocument()
    expect(readStored().tasks.some((task) => task.name === 'Pelatihan Pengguna')).toBe(true)
    expect(screen.getByRole('button', { name: /Pelatihan Pengguna/ })).toBeInTheDocument()
  })

  it('menolak tugas tanpa nama', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: '+ Tugas baru' }))
    await user.click(screen.getByRole('button', { name: 'Tambah tugas' }))

    expect(screen.getByText('Nama tugas wajib diisi.')).toBeInTheDocument()
    expect(screen.getByLabelText('Nama tugas')).toBeInTheDocument()
  })

  it('membuat sub-tugas di bawah tugas induk yang dipilih', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Tugas' }))
    await user.click(
      screen.getByRole('button', { name: 'Tambah sub-tugas untuk Analisis Stakeholder' }),
    )
    await user.type(screen.getByLabelText('Nama tugas'), 'Ringkasan Rapat')
    await user.click(screen.getByRole('button', { name: 'Tambah tugas' }))

    const created = readStored().tasks.find((task) => task.name === 'Ringkasan Rapat')
    expect(created?.parentId).toBe('t-stakeholder')
  })

  it('menampilkan tabel tugas dan mengubah progress', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Tugas' }))

    expect(screen.getByRole('table')).toBeInTheDocument()
    expect(screen.getAllByText('Project Charter').length).toBeGreaterThan(0)

    await user.click(screen.getByRole('button', { name: 'Edit Project Charter' }))
    // Slider progress memakai event "input" di React (bukan "change").
    fireEvent.input(screen.getByLabelText(/^Progress/), { target: { value: '80' } })
    expect(screen.getByText('Progress (80%)')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Simpan perubahan' }))

    expect(readStored().tasks.find((task) => task.id === 't-charter')?.progress).toBe(80)
  })

  it('mendaftarkan anggota tim baru', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Sumber Daya' }))
    await user.click(screen.getByRole('button', { name: '+ Anggota baru' }))
    await user.type(screen.getByLabelText('Nama lengkap'), 'Dewi Anggraini')
    await user.type(screen.getByLabelText('Peran'), 'Business Analyst')
    await user.click(screen.getByRole('button', { name: 'Simpan' }))

    const stored = readStored()
    expect(stored.resources.some((resource) => resource.name === 'Dewi Anggraini')).toBe(true)
    expect(screen.getAllByText('Dewi Anggraini').length).toBeGreaterThan(0)
  })

  it('menghitung ulang durasi saat hari kerja diubah', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Kalender' }))

    const friday = screen.getByRole('checkbox', { name: 'Jum' })
    expect(friday).toBeChecked()
    expect(screen.getByText('5 hari')).toBeInTheDocument()

    await user.click(friday)

    expect(screen.getByRole('checkbox', { name: 'Jum' })).not.toBeChecked()
    expect(screen.getByText('4 hari')).toBeInTheDocument()
    expect(readStored().calendar.workingDays).toEqual([1, 2, 3, 4])
  })

  it('menambah hari libur khusus', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Kalender' }))
    await user.type(screen.getByLabelText('Tanggal'), '2026-12-24')
    await user.type(screen.getByLabelText('Keterangan'), 'Cuti Bersama Natal')
    await user.click(screen.getByRole('button', { name: 'Tambah hari libur' }))

    expect(readStored().calendar.holidays.some((holiday) => holiday.date === '2026-12-24')).toBe(
      true,
    )
    expect(screen.getByText('Cuti Bersama Natal')).toBeInTheDocument()
  })

  it('menampilkan jalur kritis dan estimasi PERT', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Analisis' }))

    expect(screen.getByText('Jalur kritis (Critical Path)')).toBeInTheDocument()
    expect(screen.getByText('Estimasi PERT per tugas')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Diagram jaringan PERT' })).toBeInTheDocument()
    expect(screen.getAllByText('Kritis').length).toBeGreaterThan(0)
  })

  it('memuat kembali data tersimpan alih-alih data contoh', async () => {
    const user = userEvent.setup()
    const first = render(<App />)
    await user.click(screen.getByRole('button', { name: '+ Tugas baru' }))
    await user.type(screen.getByLabelText('Nama tugas'), 'Tugas Persisten')
    await user.click(screen.getByRole('button', { name: 'Tambah tugas' }))
    first.unmount()

    render(<App />)

    expect(readStored().tasks.some((task) => task.name === 'Tugas Persisten')).toBe(true)
    expect(screen.getByRole('button', { name: /Tugas Persisten/ })).toBeInTheDocument()
  })

  it('menggeser bar Gantt memindahkan tugas dan melewati akhir pekan', () => {
    render(<App />)
    const before = storedTask('t-stakeholder').startDate

    // dayWidth default 26px; geser 4 hari kalender (Kamis -> Senin).
    const bar = screen.getByRole('button', { name: /Analisis Stakeholder/ })
    fireEvent.pointerDown(bar, { clientX: 400, button: 0 })
    fireEvent.pointerMove(window, { clientX: 400 + 4 * 26 })
    fireEvent.pointerUp(window)

    const after = storedTask('t-stakeholder').startDate
    expect(after).not.toBe(before)
    const calendar = createWorkCalendar(readStored().calendar)
    expect(
      calendar.countWorkingDays(parseISODate(before), parseISODate(after)),
    ).toBe(2)
  })

  it('menarik ujung bar mengubah durasi dalam hari kerja', () => {
    render(<App />)
    expect(storedTask('t-stakeholder').duration).toBe(2)

    const handle = screen.getByRole('separator', { name: /Ubah durasi Analisis Stakeholder/ })
    fireEvent.pointerDown(handle, { clientX: 500, button: 0 })
    fireEvent.pointerMove(window, { clientX: 500 + 3 * 26 })
    fireEvent.pointerUp(window)

    // +3 hari kalender dari Jumat = Senin -> 1 hari kerja tambahan.
    expect(storedTask('t-stakeholder').duration).toBe(3)
  })

  it('menggeser tugas induk ikut menggeser sub-tugasnya', () => {
    render(<App />)
    const childBefore = storedTask('t-charter').startDate

    const bar = screen.getByRole('button', { name: /^1\. Inisiasi/ })
    fireEvent.pointerDown(bar, { clientX: 300, button: 0 })
    fireEvent.pointerMove(window, { clientX: 300 + 7 * 26 })
    fireEvent.pointerUp(window)

    expect(storedTask('t-charter').startDate).not.toBe(childBefore)
    expect(storedTask('t-stakeholder').startDate).not.toBe(childBefore)
  })
})
