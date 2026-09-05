import { readFile } from "node:fs/promises"
import path from "node:path"
import { PageHeader } from "@/components/page-header"
import { DocsView } from "@/components/docs/docs-view"
import { requireMember } from "@/lib/session"

export const metadata = {
  title: "MCP 对接文档 · ProjectTree",
  description: "第三方通过 MCP 接入项目树的完整说明。",
}

/** 文档随 public 一起打包，standalone 运行时也能读到 */
const DOC_PATH = path.join(process.cwd(), "public", "docs", "MCP-对接指南.md")

export default async function McpDocsPage() {
  await requireMember()

  let markdown: string
  try {
    markdown = await readFile(DOC_PATH, "utf8")
  } catch {
    markdown = "# 文档未找到\n\n请确认 `public/docs/MCP-对接指南.md` 已随构建产物一起部署。"
  }

  return (
    <>
      <PageHeader
        title="MCP 对接文档"
        description="给第三方的完整接入说明。可在线阅读，也可下载 Markdown 原文交付出去。"
      />
      <DocsView markdown={markdown} downloadHref="/docs/MCP-对接指南.md" />
    </>
  )
}
