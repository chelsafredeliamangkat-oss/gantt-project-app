import { useMemo } from 'react'
import type { PertEstimate, ScheduleResult } from '../lib/schedule'
import type { Task } from '../types'
import { round2 } from '../lib/format'

interface PertChartProps {
  tasks: Task[]
  schedule: ScheduleResult
  estimates: Map<string, PertEstimate>
}

const NODE_WIDTH = 168
const NODE_HEIGHT = 58
const GAP_X = 62
const GAP_Y = 20
const PADDING = 16

interface Node {
  id: string
  name: string
  level: number
  row: number
  x: number
  y: number
  critical: boolean
  expected: number
  float: number
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`
}

/**
 * Activity-on-node network: every task is a box positioned by its dependency
 * level, edges follow the precedence links, and critical tasks are highlighted.
 */
export function PertChart({ tasks, schedule, estimates }: PertChartProps) {
  const { nodes, edges, width, height } = useMemo(() => {
    const taskById = new Map(tasks.map((task) => [task.id, task]))
    const level = new Map<string, number>()
    const order = schedule.order.filter((id) => schedule.byId.has(id))

    for (const id of order) {
      const task = taskById.get(id)
      let value = 0
      for (const dependency of task?.dependencies ?? []) {
        const previous = level.get(dependency.predecessorId)
        if (previous !== undefined) value = Math.max(value, previous + 1)
      }
      level.set(id, value)
    }

    const columns = new Map<number, string[]>()
    for (const id of order) {
      const column = level.get(id) ?? 0
      const bucket = columns.get(column)
      if (bucket) bucket.push(id)
      else columns.set(column, [id])
    }

    const list: Node[] = []
    for (const [column, ids] of [...columns.entries()].sort((a, b) => a[0] - b[0])) {
      ids.forEach((id, row) => {
        const entry = schedule.byId.get(id)
        list.push({
          id,
          name: taskById.get(id)?.name ?? id,
          level: column,
          row,
          x: PADDING + column * (NODE_WIDTH + GAP_X),
          y: PADDING + row * (NODE_HEIGHT + GAP_Y),
          critical: entry?.critical ?? false,
          expected: estimates.get(id)?.expected ?? entry?.duration ?? 0,
          float: entry?.totalFloat ?? 0,
        })
      })
    }

    const position = new Map(list.map((node) => [node.id, node]))
    const links: Array<{ key: string; d: string; critical: boolean }> = []
    for (const id of order) {
      const target = position.get(id)
      if (!target) continue
      for (const dependency of taskById.get(id)?.dependencies ?? []) {
        const source = position.get(dependency.predecessorId)
        if (!source) continue
        const x1 = source.x + NODE_WIDTH
        const y1 = source.y + NODE_HEIGHT / 2
        const x2 = target.x
        const y2 = target.y + NODE_HEIGHT / 2
        const bend = Math.max(24, (x2 - x1) / 2)
        links.push({
          key: `${dependency.predecessorId}->${id}`,
          d: `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`,
          critical: source.critical && target.critical,
        })
      }
    }

    const maxRow = list.reduce((max, node) => Math.max(max, node.row), 0)
    const maxLevel = list.reduce((max, node) => Math.max(max, node.level), 0)

    return {
      nodes: list,
      edges: links,
      width: PADDING * 2 + (maxLevel + 1) * NODE_WIDTH + maxLevel * GAP_X,
      height: PADDING * 2 + (maxRow + 1) * NODE_HEIGHT + maxRow * GAP_Y,
    }
  }, [tasks, schedule, estimates])

  if (nodes.length === 0) {
    return <p className="hint">Diagram PERT muncul setelah ada tugas yang bisa dijadwalkan.</p>
  }

  return (
    <div className="pert-scroll">
      <svg
        className="pert-chart"
        width={Math.max(width, 320)}
        height={Math.max(height, 160)}
        role="img"
        aria-label="Diagram jaringan PERT"
      >
        <defs>
          <marker
            id="pert-arrow"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="7"
            markerHeight="7"
            markerUnits="userSpaceOnUse"
            orient="auto"
          >
            <path d="M 0 1 L 9 5 L 0 9 z" fill="#64748b" />
          </marker>
          <marker
            id="pert-arrow-critical"
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
            d={edge.d}
            className={edge.critical ? 'pert-edge pert-edge-critical' : 'pert-edge'}
            markerEnd={edge.critical ? 'url(#pert-arrow-critical)' : 'url(#pert-arrow)'}
            fill="none"
          />
        ))}

        {nodes.map((node) => (
          <g key={node.id} className={node.critical ? 'pert-node pert-node-critical' : 'pert-node'}>
            <title>
              {`${node.name}\nTE: ${round2(node.expected)} hari\nTotal float: ${node.float} hari${
                node.critical ? '\nAda di jalur kritis' : ''
              }`}
            </title>
            <rect x={node.x} y={node.y} width={NODE_WIDTH} height={NODE_HEIGHT} rx={8} />
            <text x={node.x + 12} y={node.y + 22} className="pert-node-title">
              {truncate(node.name, 22)}
            </text>
            <text x={node.x + 12} y={node.y + 40} className="pert-node-meta">
              {`TE ${round2(node.expected)} h · Float ${node.float}`}
            </text>
          </g>
        ))}
      </svg>
    </div>
  )
}
