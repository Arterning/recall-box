import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import type { Annotation, Card } from "@/lib/api"

type SourceRange = {
  start: number
  end: number
  kind: "card" | "annotation"
  annotationId?: number
  comment?: string
}

type MarkdownNode = {
  type?: string
  value?: string
  children?: MarkdownNode[]
  position?: { start?: { offset?: number }; end?: { offset?: number } }
  data?: { hName?: string; hProperties?: Record<string, unknown> }
}

export type PreviewSelection = {
  start: number
  end: number
  excerpt: string
  sourceText: string
  x: number
  y: number
  right?: number
  bottom?: number
}

export function MarkdownNote({
  content,
  cards,
  annotations,
  onSelect,
  onAnnotationClick,
}: {
  content: string
  cards: Card[]
  annotations: Annotation[]
  onSelect: (selection: PreviewSelection | null) => void
  onAnnotationClick?: (annotationId: number, rect: DOMRect) => void
}) {
  const ranges: SourceRange[] = [
    ...cards.filter((item) => item.anchorValid).map((item) => ({ start: item.startOffset, end: item.endOffset, kind: "card" as const })),
    ...annotations.filter((item) => item.anchorValid).map((item) => ({ start: item.startOffset, end: item.endOffset, kind: "annotation" as const, annotationId: item.id, comment: item.comment })),
  ]

  const captureSelection = () => {
    const current = window.getSelection()
    if (!current || current.isCollapsed || !current.toString().trim()) {
      onSelect(null)
      return
    }
    const range = current.getRangeAt(0)
    const start = locateSourceOffset(range.startContainer, range.startOffset)
    const end = locateSourceOffset(range.endContainer, range.endOffset)
    if (start == null || end == null || end <= start || end > content.length) {
      onSelect(null)
      return
    }
    const rect = range.getBoundingClientRect()
    onSelect({
      start,
      end,
      excerpt: current.toString(),
      sourceText: content.slice(start, end),
      x: Math.max(16, Math.min(window.innerWidth - 280, rect.left + rect.width / 2 - 112)),
      y: Math.max(10, rect.top - 48),
      right: rect.right,
      bottom: rect.bottom,
    })
  }

  return <div className="markdown-preview min-h-full text-[14px] leading-7 text-[#45493f]" onMouseUp={captureSelection} onKeyUp={captureSelection}>
    <ReactMarkdown
      remarkPlugins={[remarkGfm, sourceMarkPlugin(ranges) as never]}
      skipHtml
      components={{
        span: ({ node, ...props }) => <span {...props} data-source-start={sourceProperty(node, "dataSourceStart")} data-source-end={sourceProperty(node, "dataSourceEnd")} />,
        mark: ({ node, ...props }) => {
          const annotation = sourceProperty(node, "dataMarkKind") === "annotation"
          const annotationId = sourceProperty(node, "dataAnnotationId")
          const title = sourceProperty(node, "title")
          const clickable = annotation && typeof annotationId === "number" && onAnnotationClick
          return <mark {...props} title={clickable ? undefined : typeof title === "string" ? title : undefined} className={annotation ? `annotation-mark${clickable ? " annotation-clickable" : ""}` : "card-mark"} data-source-start={sourceProperty(node, "dataSourceStart")} data-source-end={sourceProperty(node, "dataSourceEnd")} onClick={(event) => { if (clickable && typeof annotationId === "number") { event.stopPropagation(); onAnnotationClick?.(annotationId, event.currentTarget.getBoundingClientRect()) } }} />
        },
      }}
    >{content || "*还没有内容*"}</ReactMarkdown>
  </div>
}

function sourceMarkPlugin(ranges: SourceRange[]) {
  return () => (root: MarkdownNode) => {
    visit(root, ranges)
  }
}

function visit(node: MarkdownNode, ranges: SourceRange[]) {
  if (!node.children) return
  const next: MarkdownNode[] = []
  for (const child of node.children) {
    const start = child.position?.start?.offset
    const end = child.position?.end?.offset
    if (child.type === "text" && child.value != null && start != null && end != null) {
      next.push(...splitTextNode(child, start, end, ranges))
    } else {
      visit(child, ranges)
      next.push(child)
    }
  }
  node.children = next
}

function splitTextNode(node: MarkdownNode, start: number, end: number, ranges: SourceRange[]): MarkdownNode[] {
  const text = node.value ?? ""
  const sourceEnd = Math.min(end, start + text.length)
  const points = new Set<number>([start, sourceEnd])
  for (const range of ranges) {
    if (range.end > start && range.start < sourceEnd) {
      points.add(Math.max(start, range.start))
      points.add(Math.min(sourceEnd, range.end))
    }
  }
  const sorted = [...points].sort((a, b) => a - b)
  const output: MarkdownNode[] = []
  for (let index = 0; index < sorted.length - 1; index++) {
    const partStart = sorted[index]
    const partEnd = sorted[index + 1]
    if (partEnd <= partStart) continue
    const mark = ranges.find((range) => partStart >= range.start && partEnd <= range.end)
    const part = text.slice(partStart - start, partEnd - start)
    const data: NonNullable<MarkdownNode["data"]> = {
      hName: mark ? "mark" : "span",
      hProperties: {
        dataSourceStart: partStart,
        dataSourceEnd: partEnd,
        ...(mark ? { dataMarkKind: mark.kind, ...(mark.annotationId ? { dataAnnotationId: mark.annotationId } : {}), ...(mark.comment ? { title: mark.comment } : {}) } : {}),
      },
    }
    output.push({ type: "text", value: part, position: { start: { offset: partStart }, end: { offset: partEnd } }, data })
  }
  return output.length ? output : [node]
}

function sourceProperty(node: unknown, key: string): string | number | undefined {
  if (!node || typeof node !== "object") return undefined
  const properties = (node as { properties?: Record<string, unknown> }).properties
  const value = properties?.[key]
  return typeof value === "string" || typeof value === "number" ? value : undefined
}

function locateSourceOffset(container: Node, offset: number): number | null {
  const element = container.nodeType === Node.ELEMENT_NODE ? container as Element : container.parentElement
  const sourceElement = element?.closest<HTMLElement>("[data-source-start]")
  const start = Number(sourceElement?.dataset.sourceStart)
  if (!sourceElement || !Number.isFinite(start)) return null
  if (container.nodeType === Node.TEXT_NODE) return start + offset
  const range = document.createRange()
  range.selectNodeContents(sourceElement)
  try {
    range.setEnd(container, offset)
    return start + range.toString().length
  } catch {
    return start
  }
}
