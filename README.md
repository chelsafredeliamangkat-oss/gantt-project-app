# Manajemen Proyek Gantt

Aplikasi manajemen proyek berbasis **Gantt Chart** yang lengkap: penjadwalan otomatis
(CPM), jalur kritis, diagram jaringan PERT, manajemen sumber daya, dan kalender hari
kerja. Dibangun dengan **React + TypeScript + Vite**, seluruh data disimpan di
**localStorage** sehingga tidak butuh backend.

![tech](https://img.shields.io/badge/React-19-61dafb) ![tech](https://img.shields.io/badge/TypeScript-6-3178c6) ![tech](https://img.shields.io/badge/Vite-8-646cff)

---

## Daftar isi

- [Fitur](#fitur)
- [Cara install & menjalankan](#cara-install--menjalankan)
- [Panduan pemakaian](#panduan-pemakaian)
- [Cara kerja penjadwalan](#cara-kerja-penjadwalan)
- [Struktur proyek](#struktur-proyek)
- [Data contoh (seed)](#data-contoh-seed)
- [Teknologi](#teknologi)
- [Catatan & batasan](#catatan--batasan)

---

## Fitur

### 1. Task management

- Tambah, edit, duplikat, dan hapus tugas (hapus satu atau beserta sub-tugasnya).
- **Sub-tugas (parent–child)** tanpa batas kedalaman. Tugas yang punya sub-tugas
  berubah menjadi **tugas induk/ringkasan**: durasi dan tanggalnya dihitung otomatis
  dari rentang anak-anaknya.
- Atribut tugas: nama, deskripsi, **durasi dalam hari kerja**, tanggal mulai,
  **prioritas (Low / Medium / High)**, **warna indikator**, progress 0–100%,
  dan estimasi PERT (optimistis / paling mungkin / pesimistis).
- Tabel tugas dengan kolom tanggal mulai & selesai hasil perhitungan, total float,
  pendahulu, anggota tim, dan progress.

### 2. Predecessors & timeline display

- Dua jenis keterkaitan dengan **jeda (lag) dalam hari kerja** (boleh negatif):
  - **Finish to Start (FS)** — penerus mulai setelah pendahulu selesai.
  - **Start to Start (SS)** — penerus mulai seiring pendahulu mulai.
- **Gantt chart** dengan bar tugas berwarna, bar bergaris untuk tugas induk, panah
  dependensi, garis "hari ini", shading akhir pekan & hari libur, serta header bulan/hari.
- **Drag & drop**: tarik bar untuk memindahkan jadwal, tarik ujung bar untuk
  mengubah durasi. Menarik tugas induk sekaligus menggeser seluruh sub-tugasnya.
- Zoom (Ringkas / Normal / Detail), urutan (struktur, tanggal mulai, prioritas),
  collapse/expand sub-tugas, toggle progress, dan mode "fokus jalur kritis".

### 3. Resource management

- Pendaftaran anggota tim: **nama, email, peran, gaji** bulanan, dan warna penanda.
- **Alokasi anggota ke setiap tugas** beserta persentase alokasi (1–100%).
- Ringkasan per anggota: jumlah tugas, **orang-hari**, beban relatif terhadap durasi
  proyek, dan **biaya** (gaji bulanan ÷ 22 hari kerja × orang-hari).

### 4. Kalender proyek

- Pengaturan **hari kerja dalam sepekan** (default Senin–Jumat; bisa diubah, misal
  minggu–kamis).
- Penambahan **hari libur khusus** (tanggal + keterangan). Hari libur yang jatuh pada
  hari kerja akan mengurangi durasi, sementara yang jatuh pada akhir pekan diabaikan.
- **Semua perhitungan durasi hanya memakai hari kerja** — akhir pekan dan hari libur
  otomatis dilompati. Mengubah kalender langsung menjadwalkan ulang seluruh tugas.

### 5. Analisis proyek

- **Jalur kritis (Critical Path)** — daftar berurutan tugas dengan total float 0 hari,
  lengkap dengan durasi kumulatif.
- Tabel **CPM** per tugas: ES, EF, LS, LF, total float, dan status kritis.
- **Diagram PERT** berbentuk jaringan aktivitas (activity-on-node) dengan node berwarna
  merah untuk jalur kritis.
- Tabel **estimasi PERT** per tugas: O, M, P, `TE = (O + 4M + P) / 6`, simpangan baku
  `(P − O) / 6`, dan variansi.
- Ringkasan proyek: durasi hari kerja & hari kalender, panjang jalur kritis, durasi
  harapan PERT, simpangan baku proyek, dan **probabilitas menyelesaikan proyek** dalam
  rencana deterministik.

---

## Cara install & menjalankan

Prasyarat: **Node.js 20+** dan npm.

```bash
# 1. Install dependensi
npm install

# 2. Jalankan mode pengembangan (http://localhost:5173)
npm run dev

# 3. Build untuk produksi (hasilnya di folder dist/)
npm run build

# 4. Pratinjau hasil build (http://localhost:4173)
npm run preview
```

Perintah lain:

```bash
npm run typecheck   # cek tipe TypeScript (tsc -b)
npm test            # jalankan seluruh test (Vitest)
npm run test:watch  # test mode watch
npm run lint        # lint (Oxlint)
```

Seluruh perintah di atas harus lolos tanpa error.

---

## Panduan pemakaian

| Tab | Isi |
| --- | --- |
| **Gantt Chart** | Grafik Gantt: bar tugas, panah dependensi, drag & resize, zoom, dan panel detail tugas terpilih. |
| **Tugas** | Tabel seluruh tugas beserta sub-tugas; tambah/edit/duplikat/hapus. |
| **Sumber Daya** | Daftar anggota tim, tarif harian, beban kerja, biaya, dan kartu tugas per anggota. |
| **Kalender** | Atur hari kerja sepekan dan kelola hari libur khusus. |
| **Analisis** | Jalur kritis, diagram & tabel PERT, dan tabel jadwal CPM. |

**Langkah cepat:**

1. Buka tab **Gantt Chart** — aplikasi sudah terisi data contoh proyek berjalan.
2. Klik bar tugas untuk melihat detail di bawah grafik, atau klik ganda untuk mengedit.
3. Tarik bar untuk menggeser jadwal; tarik ujung bar untuk mengubah durasi hari kerja.
4. Tambah keterkaitan di form tugas (tombol **+ Tugas baru** / ikon ✎ pada tabel).
5. Buka tab **Kalender** dan matikan hari Jumat — perhatikan durasi proyek langsung
   berubah di header dan di grafik.
6. Buka tab **Analisis** untuk melihat jalur kritis dan diagram PERT.

Tombol **Muat data contoh** mengembalikan data demo, **Kosongkan** menghapus semuanya.
Setiap perubahan langsung disimpan ke localStorage (lihat status di footer).

---

## Cara kerja penjadwalan

### Hari kerja sebagai satuan dasar

Semua perhitungan bekerja pada **ordinal hari kerja**: 0 adalah hari kerja pertama
sejak 1970-01-01, 1 berikutnya, dan seterusnya. Aritmetika hari kerja ini memakai
hitungan pekan tetap (satu pekan selalu berisi jumlah hari kerja yang sama) sehingga
tidak perlu menelusuri hari satu per satu. Sebuah tanggal yang bukan hari kerja
"menempel" ke hari kerja berikutnya, jadi tanggal mulai berfungsi sebagai batas
*waktu paling awal*.

```
durasi 5 hari kerja, mulai Kamis, ada libur hari Jumat
  -> Kamis, (Jumat libur), Senin, Selasa, Rabu
```

### CPM (Critical Path Method)

- Hanya **tugas daun** (tanpa sub-tugas) yang mengikuti perhitungan. Tugas induk adalah
  ringkasan yang rentangnya diambil dari anak-anaknya, dan tidak boleh dipakai sebagai
  pendahulu.
- `startDate` diperlakukan sebagai **constraint "mulai tidak lebih awal dari"**.
  Pendahulu hanya bisa mendorong tugas menjadi lebih lambat, tidak pernah lebih awal.
- **Pass maju (forward pass)** menghitung mulai/selesai paling awal:
  - `FS`: `mulai(penerus) ≥ selesai(pendahulu) + 1 + lag`
  - `SS`: `mulai(penerus) ≥ mulai(pendahulu) + lag`
- **Pass mundur (backward pass)** menghitung mulai/selesai paling lambat.
  - `FS`: `mulaiTerlambat(pendahulu) ≤ selesaiTerlambat(penerus) − 1 − lag`
  - `SS`: `mulaiTerlambat(pendahulu) ≤ mulaiTerlambat(penerus) − lag`
- **Total float** = mulai terlambat − mulai paling awal. Float 0 berarti **kritis**.
- Ketergantungan melingkar terdeteksi lebih dulu (DFS) dan ditampilkan sebagai pesan
  kesalahan, bukan membuat aplikasi menggantung.

### PERT

Setiap tugas dihitung estimasi tiga titiknya. Bila kolom O/M/P dikosongkan, nilainya
diturunkan dari durasi (80% dan 150%):

| Besaran | Rumus |
| --- | --- |
| Durasi harapan | `TE = (O + 4M + P) / 6` |
| Simpangan baku | `σ = (P − O) / 6` |
| Variansi | `σ²` |

Durasi harapan dipakai untuk menjalankan ulang pass maju, sedangkan variansi dijumlahkan
sepanjang jalur kritis untuk mendapat simpangan baku proyek. Probabilitas menyelesaikan
proyek tepat waktu dihitung dari distribusi normal baku kumulatif:

```
z = (durasi rencana − durasi harapan) / σ_proyek
```

### Biaya sumber daya

```
tarif harian        = gaji bulanan / 22 hari kerja
orang-hari (effort) = durasi hari kerja × alokasi%
biaya tugas         = tarif harian × orang-hari
```

---

## Struktur proyek

```
.
├── index.html
├── vite.config.ts          # konfigurasi Vite + Vitest (jsdom, globals)
├── tsconfig.json           # project references
├── tsconfig.app.json       # konfigurasi TS untuk src/ (strict)
├── tsconfig.node.json      # konfigurasi TS untuk vite.config.ts
├── README.md
├── .gitignore
└── src
    ├── main.tsx            # entry point React
    ├── App.tsx             # provider + shell
    ├── index.css           # seluruh stylesheet (responsif)
    ├── types.ts            # model domain: Task, Dependency, Resource, Holidays
    ├── lib
    │   ├── dates.ts        # utilitas tanggal berbasis nomor hari (aman DST)
    │   ├── calendar.ts     # mesin hari kerja: akhir pekan + hari libur
    │   ├── schedule.ts     # CPM (FS/SS + lag), jalur kritis, PERT
    │   ├── hierarchy.ts    # pohon tugas: flatten, subtree, deteksi siklus
    │   ├── costs.ts        # effort & biaya sumber daya
    │   ├── format.ts       # format tanggal & mata uang (id-ID)
    │   ├── id.ts           # pembuat id
    │   ├── seed.ts         # data contoh + penulisan tanggal hasil CPM
    │   └── storage.ts      # baca/tulis localStorage + normalisasi data
    ├── store
    │   ├── reducer.ts      # reducer murni untuk seluruh aksi
    │   ├── ProjectContext.tsx  # provider, persistensi, tugas terpilih
    │   ├── useSchedule.ts  # hook memo untuk hasil CPM & PERT
    │   └── useCosts.ts     # hook memo untuk ringkasan biaya
    ├── components
    │   ├── AppShell.tsx    # header, tab, footer
    │   ├── GanttPanel.tsx  # tab Gantt: toolbar, grafik, detail
    │   ├── GanttChart.tsx  # grafik Gantt + panah + drag/resize
    │   ├── TaskTable.tsx   # tab Tugas
    │   ├── TaskFormModal.tsx   # form tambah/edit tugas
    │   ├── ResourcePanel.tsx   # tab Sumber Daya
    │   ├── CalendarPanel.tsx   # tab Kalender
    │   ├── AnalysisPanel.tsx   # tab Analisis (CPM + PERT)
    │   ├── PertChart.tsx   # diagram jaringan PERT (SVG)
    │   └── Modal.tsx       # komponen dialog
    └── test
        ├── setup.ts        # matcher jest-dom
        └── factories.ts    # factory data uji
```

### Test

```bash
npm test
```

Cakupan test:

| Berkas | Fokus |
| --- | --- |
| `src/lib/calendar.test.ts` | Aritmetika hari kerja dibandingkan implementasi naif hari-per-hari, hari libur, pekan kerja non-standar, bolak-balik ordinal↔tanggal. |
| `src/lib/schedule.test.ts` | Rantai FS, lag (termasuk negatif), SS, float, constraint, ringkasan induk, deteksi siklus, peringatan pendahulu hilang. |
| `src/lib/pert.test.ts` | Rumus TE/σ/variansi, penanganan nilai tidak wajar, CDF normal. |
| `src/lib/costs.test.ts` | Tarif harian, effort, agregasi biaya per anggota. |
| `src/store/reducer.test.ts` | CRUD tugas, hapus subtree, reparent, pembersihan dependensi, cascade geser induk. |
| `src/App.test.tsx` | Uji integrasi lewat antarmuka: muat seed, simpan ke localStorage, tambah/edit tugas, sub-tugas, anggota, kalender, analisis, dan drag/resize bar Gantt. |

---

## Data contoh (seed)

Saat pertama dibuka (atau setelah menekan **Muat data contoh**), aplikasi mengisi satu
proyek contoh **"Implementasi Aplikasi Manajemen Proyek"**:

- **20 tugas** dalam 5 fase: Inisiasi, Desain, Pengembangan, Pengujian, Rilis.
- Keterkaitan nyata, termasuk **SS + 2** (Frontend mulai 2 hari setelah API Backend) dan
  **SS + 1** (Evaluasi Pasca Rilis mulai 1 hari setelah Go Live).
- **5 anggota tim** dengan peran dan gaji berbeda (PM, Backend, UI/UX, Frontend, QA).
- Kalender Senin–Jumat dengan hari libur (Tahun Baru, Hari Kemerdekaan, Hari Natal,
  Company Offsite, Cuti Bersama).
- Tanggal mulai proyek dihitung otomatis: **Senin dua pekan sebelum tanggal hari ini**,
  sehingga proyek contoh selalu terlihat sedang berjalan. Tanggal setiap tugas adalah
  hasil pass maju CPM, jadi data contoh selalu konsisten dengan jadwal yang dihitung.

---

## Teknologi

- **React 19** + **TypeScript** (mode `strict`) — tanpa pustaka state eksternal.
- **Vite 8** untuk dev server & build.
- **Vitest** + **Testing Library** + **jsdom** untuk test.
- **Oxlint** untuk linting.
- Styling CSS murni (variabel CSS, grid/flex, responsif hingga lebar ~360px).
- Persistensi: `localStorage` (key `gantt-project-app:data:v1`) dengan normalisasi data
  defensif — payload rusak/versi lama tidak akan membuat aplikasi gagal.

---

## Catatan & batasan

- **Tanggal mulai adalah constraint.** Bila sebuah tugas sudah tertahan lebih lambat
  oleh pendahulunya, memajukan pendahulu tidak otomatis memajukan penerus — penerus
  tetap menunggu tanggal mulai yang tersimpan. Untuk memajukannya, geser langsung bar
  tugas tersebut (atau ubah tanggal mulainya) di Gantt/form.
- **Tugas induk hanya ringkasan.** Durasi/tanggalnya tidak dapat diubah dan tidak bisa
  dipakai sebagai pendahulu; jika dihapus, sub-tugasnya ikut terhapus.
- **Biaya** memakai asumsi 22 hari kerja per bulan, bukan kalender gaji perusahaan.
- Satuan uang adalah **Rupiah** dan format tanggal memakai lokal **id-ID**.
- Drag & resize Gantt paling nyaman di perangkat dengan pointer (mouse/pen); pada layar
  sentuh sempit, gunakan form tugas untuk mengubah tanggal dan durasi.
- Data tersimpan per browser (localStorage), belum ada sinkronisasi antar perangkat.
