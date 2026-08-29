"use client"

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react"
import type { TreeNode, User } from "@/lib/types"
import type { MindMapMode, StatusFilter } from "./project-view"
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Minus, Plus, Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  computeProgress,
  computeStats,
  NODE_TYPE_META,
  STATUS_META,
  resolveUser,
} from "@/lib/tree-utils"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"

type Side = "left" | "right"

type LayoutConfig = {
  cardWidth: number
  rootWidth: number
  cardHeight: number
  rootHeight: number
  branchGap: number
  rootGap: number
  siblingGap: number
  paddingX: number
  paddingY: number
}

type PositionedNode = {
  node: TreeNode
  side: Side | "center"
  depth: number
  left: number
  top: number
  width: number
  height: number
  dimmed: boolean
  childrenCount: number
  collapsed: boolean
}

type Connector = {
  fromId: string
  toId: string
  side: Side
}

type Point = {
  x: number
  y: number
}

const MIN_SCALE = 0.35
const MAX_SCALE = 2.2
const MINI_MAP_WIDTH = 220
const MINI_MAP_HEIGHT = 148
const ZOOM_STEP = 1.15

function getLayoutConfig(mode: MindMapMode): LayoutConfig {
  switch (mode) {
    case "compact":
      return {
        cardWidth: 220,
        rootWidth: 250,
        cardHeight: 82,
        rootHeight: 96,
        branchGap: 72,
        rootGap: 68,
        siblingGap: 18,
        paddingX: 56,
        paddingY: 40,
      }
    case "detail":
      return {
        cardWidth: 300,
        rootWidth: 340,
        cardHeight: 208,
        rootHeight: 228,
        branchGap: 108,
        rootGap: 96,
        siblingGap: 28,
        paddingX: 80,
        paddingY: 64,
      }
    default:
      return {
        cardWidth: 260,
        rootWidth: 300,
        cardHeight: 156,
        rootHeight: 176,
        branchGap: 88,
        rootGap: 84,
        siblingGap: 24,
        paddingX: 72,
        paddingY: 56,
      }
  }
}

export function MindMapCanvas({
  root,
  selectedId,
  onSelect,
  statusFilter,
  matchedIds,
  mode,
  onAddChild,
  members,
}: {
  root: TreeNode
  selectedId: string | null
  onSelect: (id: string) => void
  statusFilter: StatusFilter
  matchedIds: Set<string> | null
  mode: MindMapMode
  onAddChild: (node: TreeNode) => void
  members: User[]
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [scale, setScale] = useState(1)
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 })
  const [spacePressed, setSpacePressed] = useState(false)
  const [isPanning, setIsPanning] = useState(false)
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 })
  const [miniMapDragging, setMiniMapDragging] = useState(false)
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const miniMapRef = useRef<HTMLDivElement | null>(null)
  const panStartRef = useRef({ pointerX: 0, pointerY: 0, panX: 0, panY: 0 })
  const lastFitKeyRef = useRef<string | null>(null)
  const config = getLayoutConfig(mode)

  const nodeMatches = (node: TreeNode): boolean => {
    const statusOk = statusFilter === "all" || node.status === statusFilter
    const searchOk = !matchedIds || matchedIds.has(node.id)
    return statusOk && searchOk
  }

  const visibleCache = new Map<string, boolean>()
  const visibleByDescendant = (node: TreeNode): boolean => {
    const cached = visibleCache.get(node.id)
    if (cached !== undefined) return cached
    const result = nodeMatches(node) || node.children.some(visibleByDescendant)
    visibleCache.set(node.id, result)
    return result
  }

  const isCollapsed = (id: string) => !matchedIds && collapsed.has(id)
  const toggleCollapse = (id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const left = root.children.filter((_, idx) => idx % 2 === 0).filter(visibleByDescendant)
  const right = root.children.filter((_, idx) => idx % 2 === 1).filter(visibleByDescendant)

  // 子树高度按节点缓存，避免 placeBranch 反复递归重算
  const heightCache = new Map<string, number>()
  const subtreeHeight = (node: TreeNode): number => {
    const cached = heightCache.get(node.id)
    if (cached !== undefined) return cached
    const visibleChildren = node.children.filter(visibleByDescendant)
    let result: number
    if (visibleChildren.length === 0 || isCollapsed(node.id)) {
      result = config.cardHeight
    } else {
      const childrenHeight =
        visibleChildren.reduce((sum, child) => sum + subtreeHeight(child), 0) +
        config.siblingGap * Math.max(visibleChildren.length - 1, 0)
      result = Math.max(config.cardHeight, childrenHeight)
    }
    heightCache.set(node.id, result)
    return result
  }

  const branchHeight = (nodes: TreeNode[]) =>
    nodes.length === 0
      ? 0
      : nodes.reduce((sum, node) => sum + subtreeHeight(node), 0) +
        config.siblingGap * Math.max(nodes.length - 1, 0)

  const maxDepth = (nodes: TreeNode[], depth = 1): number => {
    if (nodes.length === 0) return 0
    return Math.max(
      ...nodes.map((node) => {
        const visibleChildren = node.children.filter(visibleByDescendant)
        if (visibleChildren.length === 0 || isCollapsed(node.id)) return depth
        return maxDepth(visibleChildren, depth + 1)
      }),
    )
  }

  const leftDepth = maxDepth(left)
  const rightDepth = maxDepth(right)
  const leftWidth =
    leftDepth > 0 ? config.rootGap + leftDepth * config.cardWidth + (leftDepth - 1) * config.branchGap : 0
  const rightWidth =
    rightDepth > 0 ? config.rootGap + rightDepth * config.cardWidth + (rightDepth - 1) * config.branchGap : 0

  const branchAreaHeight = Math.max(config.rootHeight, branchHeight(left), branchHeight(right))
  const canvasWidth = config.paddingX * 2 + leftWidth + config.rootWidth + rightWidth
  const canvasHeight = config.paddingY * 2 + branchAreaHeight
  const rootLeft = config.paddingX + leftWidth
  const rootTop = config.paddingY + (branchAreaHeight - config.rootHeight) / 2

  const clampScale = useCallback((value: number) => {
    return Math.min(MAX_SCALE, Math.max(MIN_SCALE, value))
  }, [])

  const zoomAt = useCallback(
    (nextScaleInput: number, anchor?: Point) => {
      const nextScale = clampScale(nextScaleInput)
      const target = anchor ?? {
        x: viewportSize.width / 2,
        y: viewportSize.height / 2,
      }

      setPan((currentPan) => {
        const contentX = (target.x - currentPan.x) / scale
        const contentY = (target.y - currentPan.y) / scale
        return {
          x: target.x - contentX * nextScale,
          y: target.y - contentY * nextScale,
        }
      })
      setScale(nextScale)
    },
    [clampScale, scale, viewportSize.height, viewportSize.width],
  )

  const fitToView = useCallback(() => {
    if (!viewportSize.width || !viewportSize.height) return
    const nextScale = clampScale(
      Math.min(
        (viewportSize.width - 96) / canvasWidth,
        (viewportSize.height - 96) / canvasHeight,
        1,
      ),
    )
    setScale(nextScale)
    setPan({
      x: (viewportSize.width - canvasWidth * nextScale) / 2,
      y: (viewportSize.height - canvasHeight * nextScale) / 2,
    })
  }, [canvasHeight, canvasWidth, clampScale, viewportSize.height, viewportSize.width])

  const layout = useMemo(() => {
    const positions = new Map<string, PositionedNode>()
    const connectors: Connector[] = []

    positions.set(root.id, {
      node: root,
      side: "center",
      depth: 0,
      left: rootLeft,
      top: rootTop,
      width: config.rootWidth,
      height: config.rootHeight,
      dimmed: matchedIds !== null && !nodeMatches(root),
      childrenCount: root.children.filter(visibleByDescendant).length,
      collapsed: false,
    })

    const placeBranch = (nodes: TreeNode[], side: Side, topOffset: number, depth = 1, parentId?: string) => {
      let cursor = topOffset

      for (const node of nodes) {
        const currentSubtreeHeight = subtreeHeight(node)
        const visibleChildren = node.children.filter(visibleByDescendant)
        const collapsedNode = isCollapsed(node.id)
        const leftPos =
          side === "right"
            ? rootLeft +
              config.rootWidth +
              config.rootGap +
              (depth - 1) * (config.cardWidth + config.branchGap)
            : rootLeft -
              config.rootGap -
              depth * config.cardWidth -
              (depth - 1) * config.branchGap
        const topPos = cursor + (currentSubtreeHeight - config.cardHeight) / 2

        positions.set(node.id, {
          node,
          side,
          depth,
          left: leftPos,
          top: topPos,
          width: config.cardWidth,
          height: config.cardHeight,
          dimmed: matchedIds !== null && !nodeMatches(node),
          childrenCount: visibleChildren.length,
          collapsed: collapsedNode,
        })

        if (parentId) {
          connectors.push({ fromId: parentId, toId: node.id, side })
        } else {
          connectors.push({ fromId: root.id, toId: node.id, side })
        }

        if (visibleChildren.length > 0 && !collapsedNode) {
          const childrenHeight =
            visibleChildren.reduce((sum, child) => sum + subtreeHeight(child), 0) +
            config.siblingGap * Math.max(visibleChildren.length - 1, 0)
          const childTop = cursor + (currentSubtreeHeight - childrenHeight) / 2
          placeBranch(visibleChildren, side, childTop, depth + 1, node.id)
        }

        cursor += currentSubtreeHeight + config.siblingGap
      }
    }

    placeBranch(left, "left", config.paddingY + (branchAreaHeight - branchHeight(left)) / 2)
    placeBranch(right, "right", config.paddingY + (branchAreaHeight - branchHeight(right)) / 2)

    return { positions, connectors }
  }, [
    branchAreaHeight,
    config.branchGap,
    config.cardHeight,
    config.cardWidth,
    config.paddingY,
    config.rootGap,
    config.rootHeight,
    config.rootWidth,
    isCollapsed,
    left,
    matchedIds,
    right,
    root,
    rootLeft,
    rootTop,
  ])

  useEffect(() => {
    const el = viewportRef.current
    if (!el) return

    const updateViewport = () => {
      setViewportSize({
        width: el.clientWidth,
        height: el.clientHeight,
      })
    }

    updateViewport()
    const observer = new ResizeObserver(updateViewport)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const key = `${mode}-${root.id}-${matchedIds ? matchedIds.size : "all"}`
    if (!viewportSize.width || !viewportSize.height) return
    if (lastFitKeyRef.current === key) return
    lastFitKeyRef.current = key
    fitToView()
  }, [fitToView, matchedIds, mode, root.id, viewportSize.height, viewportSize.width])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code === "Space") {
        const tag = (event.target as HTMLElement | null)?.tagName
        if (tag === "INPUT" || tag === "TEXTAREA") return
        event.preventDefault()
        setSpacePressed(true)
      }
    }
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === "Space") {
        setSpacePressed(false)
        setIsPanning(false)
      }
    }

    window.addEventListener("keydown", onKeyDown)
    window.addEventListener("keyup", onKeyUp)
    return () => {
      window.removeEventListener("keydown", onKeyDown)
      window.removeEventListener("keyup", onKeyUp)
    }
  }, [])

  useEffect(() => {
    const el = viewportRef.current
    if (!el) return

    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey) return
      event.preventDefault()
      event.stopPropagation()

      const rect = el.getBoundingClientRect()
      const anchor = {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      }
      const zoomFactor = event.deltaY > 0 ? 1 / ZOOM_STEP : ZOOM_STEP
      zoomAt(scale * zoomFactor, anchor)
    }

    el.addEventListener("wheel", onWheel, { passive: false })
    return () => el.removeEventListener("wheel", onWheel)
  }, [scale, zoomAt])

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!spacePressed) return
    const target = event.target as HTMLElement | null
    if (target?.closest("[data-no-pan='true']") || target?.closest("button")) return
    event.preventDefault()
    setIsPanning(true)
    panStartRef.current = {
      pointerX: event.clientX,
      pointerY: event.clientY,
      panX: pan.x,
      panY: pan.y,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!isPanning) return
    const deltaX = event.clientX - panStartRef.current.pointerX
    const deltaY = event.clientY - panStartRef.current.pointerY
    setPan({
      x: panStartRef.current.panX + deltaX,
      y: panStartRef.current.panY + deltaY,
    })
  }

  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    setIsPanning(false)
  }

  const miniScale = Math.min(MINI_MAP_WIDTH / canvasWidth, MINI_MAP_HEIGHT / canvasHeight)
  const viewportRect = {
    left: Math.max(0, (-pan.x / scale) * miniScale),
    top: Math.max(0, (-pan.y / scale) * miniScale),
    width: Math.min(MINI_MAP_WIDTH, (viewportSize.width / scale) * miniScale),
    height: Math.min(MINI_MAP_HEIGHT, (viewportSize.height / scale) * miniScale),
  }

  const setViewportFromMiniMap = (clientX: number, clientY: number) => {
    const mini = miniMapRef.current
    if (!mini || !viewportSize.width || !viewportSize.height) return
    const rect = mini.getBoundingClientRect()
    const localX = Math.min(Math.max(0, clientX - rect.left), rect.width)
    const localY = Math.min(Math.max(0, clientY - rect.top), rect.height)
    const contentX = localX / miniScale
    const contentY = localY / miniScale
    setPan({
      x: viewportSize.width / 2 - contentX * scale,
      y: viewportSize.height / 2 - contentY * scale,
    })
  }

  return (
    <div className="relative h-[calc(100vh-14rem)] min-h-[640px] overflow-hidden bg-muted/20">
      <div
        ref={viewportRef}
        className={cn(
          "relative h-full w-full overflow-hidden",
          spacePressed ? "cursor-grab" : "cursor-default",
          isPanning && "cursor-grabbing",
        )}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <div
          className="absolute inset-0 origin-top-left will-change-transform"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
          }}
        >
          <div
            className="relative"
            style={{
              width: canvasWidth,
              height: canvasHeight,
            }}
          >
            <svg
              className="pointer-events-none absolute inset-0"
              width={canvasWidth}
              height={canvasHeight}
              viewBox={`0 0 ${canvasWidth} ${canvasHeight}`}
            >
              {layout.connectors.map((connector) => {
                const from = layout.positions.get(connector.fromId)
                const to = layout.positions.get(connector.toId)
                if (!from || !to) return null

                const fromX =
                  connector.side === "right" ? from.left + from.width : from.left
                const toX =
                  connector.side === "right" ? to.left : to.left + to.width
                const fromY = from.top + from.height / 2
                const toY = to.top + to.height / 2
                const control = Math.max(36, Math.abs(toX - fromX) * 0.45)
                const path = `M ${fromX} ${fromY} C ${fromX + (connector.side === "right" ? control : -control)} ${fromY}, ${toX + (connector.side === "right" ? -control : control)} ${toY}, ${toX} ${toY}`

                return (
                  <path
                    key={`${connector.fromId}-${connector.toId}`}
                    d={path}
                    fill="none"
                    stroke="var(--border)"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                )
              })}
            </svg>

            {Array.from(layout.positions.values()).map((item) => (
              <MindMapCard
                key={item.node.id}
                item={item}
                mode={mode}
                members={members}
                selected={selectedId === item.node.id}
                onSelect={() => onSelect(item.node.id)}
                onAddChild={() => onAddChild(item.node)}
                onToggleCollapse={
                  item.side !== "center" && item.childrenCount > 0
                    ? () => toggleCollapse(item.node.id)
                    : undefined
                }
              />
            ))}
          </div>
        </div>

        <div
          data-no-pan="true"
          className="pointer-events-none absolute left-4 top-4 z-10 rounded-lg border border-border bg-background/95 px-3 py-2 text-xs text-muted-foreground shadow-sm backdrop-blur"
        >
          <div>`Ctrl + 滚轮` 缩放</div>
          <div>`空格 + 拖拽` 平移</div>
        </div>

        <div
          data-no-pan="true"
          className="absolute bottom-4 left-4 z-10 flex items-center gap-2 rounded-xl border border-border bg-background/95 p-2 shadow-sm backdrop-blur"
        >
          <Button
            type="button"
            size="icon-xs"
            variant="outline"
            onClick={() => zoomAt(scale / ZOOM_STEP)}
            aria-label="缩小脑图"
            title="缩小"
          >
            <Minus className="h-3.5 w-3.5" />
          </Button>
          <div className="min-w-14 text-center text-xs font-medium text-muted-foreground">
            {Math.round(scale * 100)}%
          </div>
          <Button
            type="button"
            size="icon-xs"
            variant="outline"
            onClick={() => zoomAt(scale * ZOOM_STEP)}
            aria-label="放大脑图"
            title="放大"
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            size="xs"
            variant="outline"
            onClick={fitToView}
            aria-label="适应画布"
            title="适应画布"
          >
            适应
          </Button>
        </div>

        <div
          data-no-pan="true"
          className="absolute bottom-4 right-4 z-10 rounded-2xl border border-border bg-background/95 p-3 shadow-lg backdrop-blur"
        >
          <div className="mb-2 flex items-center justify-between gap-3">
            <div className="text-xs font-medium text-foreground">鸟瞰图</div>
            <div className="text-[11px] text-muted-foreground">
              {Math.round(canvasWidth)} x {Math.round(canvasHeight)}
            </div>
          </div>
          <div
            ref={miniMapRef}
            className="relative overflow-hidden rounded-lg border border-border bg-muted/50"
            style={{ width: MINI_MAP_WIDTH, height: MINI_MAP_HEIGHT }}
            onMouseDown={(event) => {
              setMiniMapDragging(true)
              setViewportFromMiniMap(event.clientX, event.clientY)
            }}
            onMouseMove={(event) => {
              if (!miniMapDragging) return
              setViewportFromMiniMap(event.clientX, event.clientY)
            }}
            onMouseUp={() => setMiniMapDragging(false)}
            onMouseLeave={() => setMiniMapDragging(false)}
          >
            <div
              className="absolute left-0 top-0 origin-top-left"
              style={{
                width: canvasWidth,
                height: canvasHeight,
                transform: `scale(${miniScale})`,
              }}
            >
              <svg
                className="pointer-events-none absolute inset-0"
                width={canvasWidth}
                height={canvasHeight}
                viewBox={`0 0 ${canvasWidth} ${canvasHeight}`}
              >
                {layout.connectors.map((connector) => {
                  const from = layout.positions.get(connector.fromId)
                  const to = layout.positions.get(connector.toId)
                  if (!from || !to) return null
                  const fromX =
                    connector.side === "right" ? from.left + from.width : from.left
                  const toX =
                    connector.side === "right" ? to.left : to.left + to.width
                  const fromY = from.top + from.height / 2
                  const toY = to.top + to.height / 2
                  const control = Math.max(36, Math.abs(toX - fromX) * 0.45)
                  const path = `M ${fromX} ${fromY} C ${fromX + (connector.side === "right" ? control : -control)} ${fromY}, ${toX + (connector.side === "right" ? -control : control)} ${toY}, ${toX} ${toY}`
                  return (
                    <path
                      key={`mini-${connector.fromId}-${connector.toId}`}
                      d={path}
                      fill="none"
                      stroke="var(--muted-foreground)"
                      strokeOpacity="0.35"
                      strokeWidth="1"
                      strokeLinecap="round"
                    />
                  )
                })}
              </svg>
              {Array.from(layout.positions.values()).map((item) => (
                <div
                  key={`mini-${item.node.id}`}
                  className={cn(
                    "absolute rounded-md border",
                    item.side === "center"
                      ? "border-primary/50 bg-primary/15"
                      : "border-border bg-background/85",
                  )}
                  style={{
                    left: item.left,
                    top: item.top,
                    width: item.width,
                    height: item.height,
                  }}
                />
              ))}
            </div>

            <div
              className="pointer-events-none absolute rounded-md border-2 border-primary bg-primary/10 shadow-sm"
              style={{
                left: viewportRect.left,
                top: viewportRect.top,
                width: viewportRect.width,
                height: viewportRect.height,
              }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

function MindMapCard({
  item,
  mode,
  members,
  selected,
  onSelect,
  onAddChild,
  onToggleCollapse,
}: {
  item: PositionedNode
  mode: MindMapMode
  members: User[]
  selected: boolean
  onSelect: () => void
  onAddChild: () => void
  onToggleCollapse?: () => void
}) {
  const { node, side, left, top, width, height, dimmed, childrenCount, collapsed } = item
  const progress = computeProgress(node)
  const stats = computeStats(node)
  const meta = STATUS_META[node.status]

  const showDescription = mode !== "compact"
  const showMetrics = mode !== "compact"
  const showTags = mode === "detail"
  const showAssignees = mode !== "compact"
  const showProgress = mode !== "compact"

  return (
    <div
      className={cn(
        "group absolute rounded-xl border bg-background shadow-sm transition-colors",
        selected ? "border-primary ring-2 ring-primary/20" : "border-border hover:border-primary/40",
        dimmed && "opacity-40",
      )}
      style={{ left, top, width, height }}
    >
      <button
        type="button"
        onClick={onSelect}
        className={cn(
          "flex h-full w-full flex-col text-left",
          mode === "compact" ? "gap-1.5 p-2.5" : mode === "detail" ? "gap-2.5 p-4" : "gap-2 p-3",
          side === "left" && "items-end text-right",
          side !== "left" && "items-start text-left",
        )}
      >
        <div className="flex w-full items-center justify-between gap-2">
          <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium", meta.bg, meta.fg)}>
            {meta.label}
          </span>
          {node.aiGenerated && <Sparkles className="h-3.5 w-3.5 text-primary" />}
        </div>

        <div className={cn("w-full", mode === "compact" ? "space-y-0.5" : "space-y-1")}>
          <div className="line-clamp-2 text-sm font-semibold">{node.title}</div>
          {showDescription && (
            <div
              className={cn(
                "text-xs leading-relaxed text-muted-foreground",
                mode === "detail" ? "line-clamp-5" : "line-clamp-3",
              )}
            >
              {node.description}
            </div>
          )}
        </div>

        {showMetrics && (
          <div className="mt-auto flex w-full items-center justify-between gap-2 text-[11px] text-muted-foreground">
            <span>{NODE_TYPE_META[node.type].label}</span>
            <span>{stats.done}/{stats.total} 节点</span>
          </div>
        )}

        {showProgress && (
          <div className="w-full">
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div className={cn("h-full rounded-full", meta.dot)} style={{ width: `${progress}%` }} />
            </div>
            <div className="mt-1 text-right text-[11px] text-muted-foreground">{progress}%</div>
          </div>
        )}

        {showTags && node.tags.length > 0 && (
          <div className={cn("flex w-full flex-wrap gap-1", side === "left" ? "justify-end" : "justify-start")}>
            {node.tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {showAssignees && node.assigneeIds.length > 0 && (
          <div className={cn("flex w-full", side === "left" ? "justify-end" : "justify-start")}>
            <div className="flex -space-x-1.5">
              {node.assigneeIds.slice(0, 3).map((id) => {
                const u = resolveUser(members, id)
                return (
                  <Avatar key={id} className="h-6 w-6 border border-background">
                    <AvatarFallback
                      className="text-[9px] font-semibold text-primary-foreground"
                      style={{ backgroundColor: u.color }}
                    >
                      {u.initials}
                    </AvatarFallback>
                  </Avatar>
                )
              })}
            </div>
          </div>
        )}
      </button>

      <div
        className={cn(
          "absolute top-2 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100",
          side === "left" ? "left-2" : "right-2",
        )}
      >
        {onToggleCollapse && (
          <Button
            type="button"
            size="icon-xs"
            variant="outline"
            onClick={onToggleCollapse}
            aria-label={collapsed ? "展开子节点" : "折叠子节点"}
            title={collapsed ? `展开 ${childrenCount} 个子节点` : `折叠 ${childrenCount} 个子节点`}
          >
            {collapsed ? (
              side === "left" ? (
                <ChevronRight className="h-3.5 w-3.5" />
              ) : (
                <ChevronLeft className="h-3.5 w-3.5" />
              )
            ) : (
              side === "left" ? (
                <ChevronsLeft className="h-3.5 w-3.5" />
              ) : (
                <ChevronsRight className="h-3.5 w-3.5" />
              )
            )}
          </Button>
        )}
        <Button
          type="button"
          size="icon-xs"
          variant="outline"
          onClick={onAddChild}
          aria-label="添加子节点"
          title="添加子节点"
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  )
}
