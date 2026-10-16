import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  CSSProperties,
  KeyboardEvent,
  PointerEvent as ReactPointerEvent,
} from 'react'
import type { FlatTask } from '../lib/hierarchy'
import { hasChildren } from '../lib/hierarchy'
import type { ScheduleResult } from '../lib/schedule'
import { createWorkCalendar } from '../lib/calendar'
import {
  addDays,
  dateFromDayNumber,
  dayNumber,
  parseISODate,
  toISODate,
  todayDayNumber,
} from '../lib/dates'
import { formatDate, formatISODate, formatMonthYear, weekdayShort } from '../lib/format'
import { useProject } from '../store/ProjectContext'
import type { Priority, Task } from '../types'

export const ROW_HEIGHT = 34
export const HEADER_HEIGHT = 58
export const NAME_COLUMN_WIDTH = 300

/** Hard cap so a stray date cannot make the browser render 100k columns. */
const MAX_DAYS = 1500

/** Narrower name column on small screens so the timeline stays usable. */
function useNameColumnWidth(): number {
  const [width, setWidth] = useState(() =>
    typeof window !== 'undefined' && window.innerWidth < 760
      ? 164
      : NAME_COLUMN_WIDTH,
  )

  useEffect(() => {
    const handleResize = () =>
      setWidth(window.innerWidth < 760 ? 164 : NAME_COLUMN_WIDTH)
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  return width
}

const PRIORITY_CLASS: Record<Priority, string> = {
  low: 'badge-low',
  medium: 'badge-medium',
  high: 'badge-high',
}

interface GanttChartProps {
  rows: FlatTask[]
  schedule: ScheduleResult
  dayWidth: number
  highlightCritical: boolean
  showProgress: boolean
  selectedTaskId: string | null
  onSelect: (taskId: string) => void
  onToggleCollapse: (taskId: string) => void
  onEdit: (taskId: string) => void
}

interface Rect {
  left: number
  width: number
  centerY: number
  right: number
}

interface DragState {
  taskId: string
  mode: 'move' | 'resize-start' | 'resize-end'
  originX: number
  offsetDays: number
  baseStart: string
  baseFinish: string
  isSummary: boolean
}

export function GanttChart({
  rows,
  schedule,
  dayWidth,
  highlightCritical,
  showProgress,
  selectedTaskId,
  onSelect,
  onToggleCollapse,
  onEdit,
}: GanttChartProps) {
  const { project, dispatch } = useProject()
  const [drag, setDrag] = useState<DragState | null>(null)
  const dragRef = useRef<DragState | null>(null)
  const nameWidth = useNameColumnWidth()

  const applyDrag = useCallback((next: DragState | null) => {
    dragRef.current = next
    setDrag(next)
  }, [])

  const compact = dayWidth < 34

  const range = useMemo(() => {
    let min = Number.POSITIVE_INFINITY
    let max = Number.NEGATIVE_INFINITY
    for (const row of rows) {
      const entry = schedule.byId.get(row.task.id)
      if (!entry) continue
      min = Math.min(min, dayNumber(parseISODate(entry.startDate)))
      max = Math.max(max, dayNumber(parseISODate(entry.finishDate)))
    }
    if (!Number.isFinite(min) || !Number.isFinite(max)) {
      return { startDayNumber: todayDayNumber() - 2, days: 21 }
    }
    const startDayNumber = min - 3
    const days = Math.min(MAX_DAYS, Math.max(14, max - startDayNumber + 5))
    return { startDayNumber, days }
  }, [rows, schedule])

  const dayList = useMemo(
    () =>
      Array.from({ length: range.days }, (_, index) => ({
        dayNum: range.startDayNumber + index,
        date: dateFromDayNumber(range.startDayNumber + index),
      })),
    [range],
  )

  const monthSpans = useMemo(() => {
    const spans: Array<{ key: string; label: string; width: number }> = []
    for (const day of dayList) {
      const key = `${day.date.getFullYear()}-${day.date.getMonth()}`
      const last = spans[spans.length - 1]
      if (last && last.key === key) {
        last.width += dayWidth
      } else {
        spans.push({ key, label: formatMonthYear(day.date), width: dayWidth })
      }
    }
    return spans
  }, [dayList, dayWidth])

  const monthSeparators = useMemo(() => {
    const offsets: Array<{ key: string; offset: number }> = []
    let offset = 0
    monthSpans.forEach((span, index) => {
      if (index > 0) offsets.push({ key: span.key, offset })
      offset += span.width
    })
    return offsets
  }, [monthSpans])

  const timelineWidth = range.days * dayWidth
  const bodyHeight = rows.length * ROW_HEIGHT
  const today = todayDayNumber()

  const isHoliday = useMemo(() => {
    const map = new Map<number, string>()
    for (const holiday of project.calendar.holidays) {
      map.set(dayNumber(parseISODate(holiday.date)), holiday.name)
    }
    return map
  }, [project.calendar.holidays])

  const workingDaySet = useMemo(
    () => new Set(project.calendar.workingDays),
    [project.calendar.workingDays],
  )

  /** Row layout: x offsets and the vertical centre of every visible bar. */
  const layout = useMemo(() => {
    const map = new Map<string, Rect>()
    rows.forEach((row, index) => {
      const entry = schedule.byId.get(row.task.id)
      if (!entry) return
      const startNum = dayNumber(parseISODate(entry.startDate))
      const finishNum = dayNumber(parseISODate(entry.finishDate))
      const left = (startNum - range.startDayNumber) * dayWidth
      const width = Math.max(dayWidth, (finishNum - startNum + 1) * dayWidth)
      const centerY = HEADER_HEIGHT + index * ROW_HEIGHT + ROW_HEIGHT / 2
      map.set(row.task.id, { left, width, centerY, right: left + width })
    })
    return map
  }, [rows, schedule, range.startDayNumber, dayWidth])

  const edges = useMemo(() => {
    const list: Array<{
      key: string
      path: string
      critical: boolean
      type: string
      lag: number
    }> = []
    const gap = 12

    for (const row of rows) {
      const target = layout.get(row.task.id)
      if (!target) continue
      for (const dependency of row.task.dependencies) {
        const source = layout.get(dependency.predecessorId)
        if (!source) continue
        const critical =
          schedule.byId.get(row.task.id)?.critical === true &&
          schedule.byId.get(dependency.predecessorId)?.critical === true

        const path =
          dependency.type === 'SS'
            ? `M ${source.left} ${source.centerY} H ${source.left - gap} V ${target.centerY} H ${target.left}`
            : `M ${source.right} ${source.centerY} H ${source.right + gap} V ${target.centerY} H ${target.left}`

        list.push({
          key: `${dependency.predecessorId}->${row.task.id}-${dependency.id}`,
          path,
          critical,
          type: dependency.type,
          lag: dependency.lag,
        })
      }
    }
    return list
  }, [rows, layout, schedule])

  const commit = useCallback(
    (state: DragState) => {
      if (state.offsetDays === 0) return
      const calendar = createWorkCalendar(project.calendar)

      if (state.mode === 'move') {
        const startDate = toISODate(addDays(parseISODate(state.baseStart), state.offsetDays))
        dispatch({
          type: 'moveTask',
          id: state.taskId,
          startDate,
          cascadeChildren: state.isSummary,
        })
        return
      }

      if (state.mode === 'resize-end') {
        const finish = addDays(parseISODate(state.baseFinish), state.offsetDays)
        const duration = calendar.durationBetween(parseISODate(state.baseStart), finish)
        dispatch({ type: 'moveTask', id: state.taskId, startDate: state.baseStart, duration })
        return
      }

      const start = addDays(parseISODate(state.baseStart), state.offsetDays)
      const duration = calendar.durationBetween(start, parseISODate(state.baseFinish))
      dispatch({
        type: 'moveTask',
        id: state.taskId,
        startDate: toISODate(start),
        duration,
      })
    },
    [dispatch, project.calendar],
  )

  const dragging = drag !== null
  useEffect(() => {
    if (!dragging) return
    const handleMove = (event: PointerEvent) => {
      const current = dragRef.current
      if (!current) return
      const offsetDays = Math.round((event.clientX - current.originX) / dayWidth)
      if (offsetDays !== current.offsetDays) {
        applyDrag({ ...current, offsetDays })
      }
    }
    const handleUp = () => {
      const current = dragRef.current
      applyDrag(null)
      if (current) commit(current)
    }
    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', handleUp)
    window.addEventListener('pointercancel', handleUp)
    return () => {
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', handleUp)
      window.removeEventListener('pointercancel', handleUp)
    }
  }, [dragging, dayWidth, applyDrag, commit])

  const startDrag = (
    event: ReactPointerEvent<HTMLElement>,
    task: Task,
    mode: DragState['mode'],
  ) => {
    if (event.button !== 0) return
    event.stopPropagation()
    const entry = schedule.byId.get(task.id)
    if (!entry) return
    onSelect(task.id)
    applyDrag({
      taskId: task.id,
      mode,
      originX: event.clientX,
      offsetDays: 0,
      baseStart: entry.startDate,
      baseFinish: entry.finishDate,
      isSummary: hasChildren(project.tasks, task.id),
    })
  }

  const previewRect = (taskId: string, rect: Rect): Rect => {
    if (!drag || drag.taskId !== taskId) return rect
    const shift = drag.offsetDays * dayWidth
    if (drag.mode === 'move') {
      return { ...rect, left: rect.left + shift, right: rect.right + shift }
    }
    if (drag.mode === 'resize-end') {
      const width = Math.max(dayWidth, rect.width + shift)
      return { ...rect, width, right: rect.left + width }
    }
    const width = Math.max(dayWidth, rect.width - shift)
    return { ...rect, width, left: rect.left + shift, right: rect.left + shift + width }
  }

  const handleBarKey = (event: KeyboardEvent<HTMLElement>, taskId: string) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onEdit(taskId)
    }
  }

  const containerStyle = {
    '--day-width': `${dayWidth}px`,
    '--gantt-name-width': `${nameWidth}px`,
    width: `${nameWidth + timelineWidth}px`,
  } as CSSProperties

  return (
    <div className={`gantt${dragging ? ' gantt-dragging' : ''}`}>
      <div className="gantt-scroll">
        <div className="gantt-inner" style={containerStyle}>
          <div className="gantt-head">
            <div className="gantt-head-name">
              <span>Tugas</span>
              <span className="gantt-head-meta">{rows.length} baris</span>
            </div>
            <div className="gantt-head-timeline" style={{ width: `${timelineWidth}px` }}>
              <div className="gantt-months">
                {monthSpans.map((span) => (
                  <div
                    key={span.key}
                    className="gantt-month"
                    style={{ width: `${span.width}px` }}
                  >
                    {span.label}
                  </div>
                ))}
              </div>
              <div className="gantt-days">
                {dayList.map((day) => {
                  const holidayName = isHoliday.get(day.dayNum)
                  const working = workingDaySet.has(day.date.getDay()) && !holidayName
                  return (
                    <div
                      key={day.dayNum}
                      className={`gantt-day${working ? '' : ' gantt-day-off'}${
                        holidayName ? ' gantt-day-holiday' : ''
                      }`}
                      style={{ width: `${dayWidth}px` }}
                      title={holidayName ? `${formatDate(day.date)} — ${holidayName}` : formatDate(day.date)}
                    >
                      {compact ? null : <span className="gantt-day-dow">{weekdayShort(day.date)}</span>}
                      <span className="gantt-day-num">{day.date.getDate()}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          <div className="gantt-body" style={{ height: `${bodyHeight}px` }}>
            <div
              className="gantt-shade"
              style={{ left: `${nameWidth}px`, width: `${timelineWidth}px` }}
            >
              {dayList
                .filter((day) => {
                  const holiday = isHoliday.get(day.dayNum)
                  return !workingDaySet.has(day.date.getDay()) || Boolean(holiday)
                })
                .map((day) => (
                  <div
                    key={day.dayNum}
                    className={`gantt-shade-col${
                      isHoliday.has(day.dayNum) ? ' gantt-shade-holiday' : ''
                    }`}
                    style={{
                      left: `${(day.dayNum - range.startDayNumber) * dayWidth}px`,
                      width: `${dayWidth}px`,
                    }}
                  />
                ))}
              {monthSeparators.map((separator) => (
                <div
                  key={`sep-${separator.key}`}
                  className="gantt-month-separator"
                  style={{ left: `${separator.offset}px` }}
                />
              ))}
              {today >= range.startDayNumber && today < range.startDayNumber + range.days ? (
                <div
                  className="gantt-today"
                  style={{
                    left: `${(today - range.startDayNumber) * dayWidth + dayWidth / 2}px`,
                  }}
                  title="Hari ini"
                />
              ) : null}
            </div>

            {rows.map((row) => {
              const entry = schedule.byId.get(row.task.id)
              const rect = layout.get(row.task.id)
              const task = row.task
              const selected = selectedTaskId === task.id
              const dimmed = highlightCritical && entry ? !entry.critical : false

              return (
                <div
                  className={`gantt-row${selected ? ' gantt-row-selected' : ''}`}
                  key={task.id}
                  style={{ height: `${ROW_HEIGHT}px` }}
                >
                  <div
                    className="gantt-name"
                    style={{ paddingLeft: `${8 + row.depth * 16}px` }}
                    onClick={() => onSelect(task.id)}
                  >
                    {row.hasChildren ? (
                      <button
                        type="button"
                        className="tree-toggle"
                        aria-label={row.expanded ? 'Tutup sub-tugas' : 'Buka sub-tugas'}
                        onClick={(event) => {
                          event.stopPropagation()
                          onToggleCollapse(task.id)
                        }}
                      >
                        {row.expanded ? '▾' : '▸'}
                      </button>
                    ) : (
                      <span className="tree-spacer" />
                    )}
                    <span className="dot" style={{ background: task.color }} />
                    <span className="gantt-name-text" title={task.name}>
                      {task.name}
                    </span>
                    <span className={`badge ${PRIORITY_CLASS[task.priority]}`}>
                      {task.priority === 'low' ? 'L' : task.priority === 'medium' ? 'M' : 'H'}
                    </span>
                  </div>

                  <div className="gantt-track" style={{ width: `${timelineWidth}px` }}>
                    {!rect || !entry ? null : (
                      <div
                        className={[
                          'gantt-bar',
                          row.hasChildren ? 'gantt-bar-summary' : '',
                          dimmed ? 'gantt-bar-dim' : '',
                          entry.critical ? 'gantt-bar-critical' : '',
                          selected ? 'gantt-bar-selected' : '',
                          drag?.taskId === task.id ? 'gantt-bar-dragging' : '',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                        style={{
                          left: `${previewRect(task.id, rect).left}px`,
                          width: `${previewRect(task.id, rect).width}px`,
                          top: `${row.hasChildren ? 11 : 7}px`,
                          background: task.color,
                        }}
                        role="button"
                        tabIndex={0}
                        aria-label={`${task.name}, ${formatISODate(entry.startDate)} sampai ${formatISODate(entry.finishDate)}`}
                        title={`${task.name}\n${formatISODate(entry.startDate)} → ${formatISODate(entry.finishDate)} (${entry.duration} hari kerja)\nProgress ${task.progress}%`}
                        onPointerDown={(event) => startDrag(event, task, 'move')}
                        onDoubleClick={() => onEdit(task.id)}
                        onKeyDown={(event) => handleBarKey(event, task.id)}
                      >
                        {!row.hasChildren && showProgress && task.progress > 0 ? (
                          <span
                            className="gantt-bar-progress"
                            style={{ width: `${task.progress}%` }}
                          />
                        ) : null}
                        {!row.hasChildren && rect.width > 70 ? (
                          <span className="gantt-bar-label">
                            {entry.duration}h{task.progress > 0 ? ` · ${task.progress}%` : ''}
                          </span>
                        ) : null}
                        {!row.hasChildren ? (
                          <>
                            <span
                              className="gantt-handle gantt-handle-start"
                              role="separator"
                              tabIndex={-1}
                              aria-label={`Ubah tanggal mulai ${task.name}`}
                              onPointerDown={(event) => startDrag(event, task, 'resize-start')}
                            />
                            <span
                              className="gantt-handle gantt-handle-end"
                              role="separator"
                              tabIndex={-1}
                              aria-label={`Ubah durasi ${task.name}`}
                              onPointerDown={(event) => startDrag(event, task, 'resize-end')}
                            />
                          </>
                        ) : null}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}

            <svg
              className="gantt-arrows"
              style={{
                left: `${nameWidth}px`,
                width: `${timelineWidth}px`,
                height: `${HEADER_HEIGHT + bodyHeight}px`,
              }}
            >
              <defs>
                <marker
                  id="gantt-arrowhead"
                  viewBox="0 0 10 10"
                  refX="9"
                  refY="5"
                  markerWidth="7"
                  markerHeight="7"
                  markerUnits="userSpaceOnUse"
                  orient="auto"
                >
                  <path d="M 0 1 L 9 5 L 0 9 z" />
                </marker>
                <marker
                  id="gantt-arrowhead-critical"
                  viewBox="0 0 10 10"
                  refX="9"
                  refY="5"
                  markerWidth="7"
                  markerHeight="7"
                  markerUnits="userSpaceOnUse"
                  orient="auto"
                >
                  <path d="M 0 1 L 9 5 L 0 9 z" fill="#dc2626" />
                </marker>
              </defs>
              {edges.map((edge) => (
                <path
                  key={edge.key}
                  d={edge.path}
                  className={edge.critical ? 'gantt-edge-critical' : 'gantt-edge'}
                  markerEnd={
                    edge.critical ? 'url(#gantt-arrowhead-critical)' : 'url(#gantt-arrowhead)'
                  }
                >
                  <title>{`${edge.type}${edge.lag ? ` ${edge.lag >= 0 ? '+' : ''}${edge.lag} hari` : ''}`}</title>
                </path>
              ))}
            </svg>
          </div>
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="empty-state">Belum ada tugas untuk ditampilkan.</p>
      ) : null}
    </div>
  )
}
