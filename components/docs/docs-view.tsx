"use client"

import { isValidElement, useEffect, useMemo, useRef, useState } from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { Check, Copy, Download } from "lucide-react"
import { toast } from "sonner"
import { Button, buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface Heading {
  id: string
  text: string
  level: 2 | 3
}

/**
 * 从 React children 递归取纯文本。
 * 标题里常含 `code` 等内联元素，直接 String(children) 会得到 [object Object]。
 */
function childrenToText(node: React.ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean") return ""
  if (typeof node === "string" || typeof node === "number") return String(node)
  if (Array.isArray(node)) return node.map(childrenToText).join("")
  if (isValidElement<{ children?: React.ReactNode }>(node)) {
    return childrenToText(node.props.children)
  }
  return ""
}

/**
 * 把标题文本转成锚点 id。
 * 中文不做转写，只清掉 Markdown 标记与空格，保证同一份文本前后两次生成结果一致。
 */
function slugify(text: string): string {
  return text
    .trim()
    .replace(/`/g, "")
    .replace(/\*\*/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\s+/g, "-")
    .replace(/[^\w\u4e00-\u9fa5-]/g, "")
    .toLowerCase()
}

/** 从正文提取二三级标题，跳过围栏代码块内的 # 行 */
function extractHeadings(markdown: string): Heading[] {
  const result: Heading[] = []
  let inFence = false

  for (const line of markdown.split("\n")) {
    if (line.startsWith("```")) {
      inFence = !inFence
      continue
    }
    if (inFence) continue

    const m = /^(#{2,3})\s+(.+)$/.exec(line)
    if (!m) continue

    const text = m[2].trim()
    // 文档开头那份手写目录本身不进侧栏
    if (text === "目录") continue
    // id 用原文算，保证和正文渲染出的锚点一致；展示时去掉内联标记
    result.push({
      id: slugify(text),
      text: text.replace(/`/g, "").replace(/\*\*/g, ""),
      level: m[1].length as 2 | 3,
    })
  }
  return result
}

/** 去掉正文开头的 H1 与手写目录段，避免和页头、左侧目录重复 */
function stripRedundantParts(markdown: string): string {
  const lines = markdown.split("\n")
  const tocStart = lines.findIndex((l) => /^##\s+目录\s*$/.test(l))
  if (tocStart === -1) return markdown

  // 目录段一直延续到下一个二级标题
  let tocEnd = lines.length
  for (let i = tocStart + 1; i < lines.length; i++) {
    if (/^##\s+/.test(lines[i])) {
      tocEnd = i
      break
    }
  }
  return [...lines.slice(0, tocStart), ...lines.slice(tocEnd)].join("\n")
}

/** 代码块，带复制按钮 */
function CodeBlock({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLPreElement>(null)
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    const text = ref.current?.innerText ?? ""
    await navigator.clipboard.writeText(text)
    setCopied(true)
    toast.success("已复制代码")
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="group relative my-4">
      <Button
        variant="outline"
        size="icon-sm"
        onClick={copy}
        className="absolute right-2 top-2 z-10 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
        aria-label="复制代码"
      >
        {copied ? <Check className="h-3.5 w-3.5 text-primary" /> : <Copy className="h-3.5 w-3.5" />}
      </Button>
      <pre
        ref={ref}
        className="overflow-x-auto rounded-lg border border-border bg-muted/40 p-4 text-[13px] leading-relaxed"
      >
        {children}
      </pre>
    </div>
  )
}

export function DocsView({
  markdown,
  downloadHref,
}: {
  markdown: string
  downloadHref: string
}) {
  const headings = useMemo(() => extractHeadings(markdown), [markdown])
  const body = useMemo(() => stripRedundantParts(markdown), [markdown])
  const [activeId, setActiveId] = useState("")
  const scrollRef = useRef<HTMLDivElement>(null)

  // 正文滚动时高亮当前所在章节
  useEffect(() => {
    const container = scrollRef.current
    if (!container) return

    const onScroll = () => {
      const anchors = container.querySelectorAll<HTMLElement>("[data-heading-id]")
      const top = container.getBoundingClientRect().top
      let current = ""
      for (const el of anchors) {
        // 越过容器顶部 80px 的标题即视为已进入
        if (el.getBoundingClientRect().top - top <= 80) current = el.dataset.headingId ?? ""
        else break
      }
      setActiveId(current)
    }

    onScroll()
    container.addEventListener("scroll", onScroll, { passive: true })
    return () => container.removeEventListener("scroll", onScroll)
  }, [body])

  const jumpTo = (id: string) => {
    const container = scrollRef.current
    const target = container?.querySelector<HTMLElement>(`[data-heading-id="${id}"]`)
    if (!container || !target) return
    const offset = target.getBoundingClientRect().top - container.getBoundingClientRect().top
    container.scrollBy({ top: offset - 16, behavior: "smooth" })
    setActiveId(id)
  }

  const copyAll = async () => {
    await navigator.clipboard.writeText(markdown)
    toast.success("已复制整篇文档")
  }

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      {/* 左侧目录 */}
      <nav className="hidden w-64 shrink-0 overflow-y-auto border-r border-border px-3 py-5 lg:block">
        <div className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          目录
        </div>
        <ul className="space-y-0.5">
          {headings.map((h) => (
            <li key={h.id}>
              <button
                type="button"
                onClick={() => jumpTo(h.id)}
                className={cn(
                  "w-full rounded-md px-3 py-1.5 text-left text-[13px] leading-snug transition-colors",
                  h.level === 3 && "pl-6 text-xs",
                  activeId === h.id
                    ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                    : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
                )}
              >
                {h.text}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      {/* 右侧正文 */}
      <div ref={scrollRef} className="min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-6 py-6">
          <div className="mb-6 flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" className="gap-1.5" onClick={copyAll}>
              <Copy className="h-3.5 w-3.5" />
              复制全文
            </Button>
            <a
              href={downloadHref}
              download
              className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1.5")}
            >
              <Download className="h-3.5 w-3.5" />
              下载 Markdown
            </a>
          </div>

          <article className="text-sm leading-7 text-foreground">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                h1: ({ children }) => (
                  <h1 className="mb-4 mt-2 text-2xl font-semibold tracking-tight">{children}</h1>
                ),
                h2: ({ children }) => {
                  const id = slugify(childrenToText(children))
                  return (
                    <h2
                      id={id}
                      data-heading-id={id}
                      className="mb-3 mt-10 scroll-mt-4 border-b border-border pb-2 text-xl font-semibold tracking-tight"
                    >
                      {children}
                    </h2>
                  )
                },
                h3: ({ children }) => {
                  const id = slugify(childrenToText(children))
                  return (
                    <h3
                      id={id}
                      data-heading-id={id}
                      className="mb-2 mt-7 scroll-mt-4 text-base font-semibold tracking-tight"
                    >
                      {children}
                    </h3>
                  )
                },
                h4: ({ children }) => (
                  <h4 className="mb-2 mt-5 text-sm font-semibold">{children}</h4>
                ),
                p: ({ children }) => <p className="my-3 text-pretty">{children}</p>,
                ul: ({ children }) => (
                  <ul className="my-3 list-disc space-y-1 pl-5">{children}</ul>
                ),
                ol: ({ children }) => (
                  <ol className="my-3 list-decimal space-y-1 pl-5">{children}</ol>
                ),
                li: ({ children }) => <li className="text-pretty">{children}</li>,
                a: ({ href, children }) => {
                  // 站内锚点交给 jumpTo，浏览器默认行为在自定义滚动容器里不生效
                  if (href?.startsWith("#")) {
                    return (
                      <a
                        href={href}
                        onClick={(e) => {
                          e.preventDefault()
                          jumpTo(href.slice(1))
                        }}
                        className="text-primary underline underline-offset-4 hover:no-underline"
                      >
                        {children}
                      </a>
                    )
                  }
                  return (
                    <a
                      href={href}
                      target={href?.startsWith("http") ? "_blank" : undefined}
                      rel={href?.startsWith("http") ? "noreferrer" : undefined}
                      className="text-primary underline underline-offset-4 hover:no-underline"
                    >
                      {children}
                    </a>
                  )
                },
                blockquote: ({ children }) => (
                  <blockquote className="my-4 border-l-2 border-primary/50 bg-muted/30 py-2 pl-4 text-muted-foreground">
                    {children}
                  </blockquote>
                ),
                hr: () => <hr className="my-8 border-border" />,
                strong: ({ children }) => (
                  <strong className="font-semibold text-foreground">{children}</strong>
                ),
                // react-markdown 把围栏代码块渲染为 pre > code，复制按钮挂在 pre 这层
                pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
                code: ({ className, children }) =>
                  className?.includes("language-") ? (
                    <code className="font-mono">{children}</code>
                  ) : (
                    <code className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[0.85em]">
                      {children}
                    </code>
                  ),
                table: ({ children }) => (
                  <div className="my-4 overflow-x-auto rounded-lg border border-border">
                    <table className="w-full border-collapse text-[13px]">{children}</table>
                  </div>
                ),
                thead: ({ children }) => <thead className="bg-muted/50">{children}</thead>,
                th: ({ children }) => (
                  <th className="border-b border-border px-3 py-2 text-left font-semibold">
                    {children}
                  </th>
                ),
                td: ({ children }) => (
                  <td className="border-b border-border px-3 py-2 align-top">{children}</td>
                ),
              }}
            >
              {body}
            </ReactMarkdown>
          </article>
        </div>
      </div>
    </div>
  )
}
