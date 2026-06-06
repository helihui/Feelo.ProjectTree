"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import type { TreeNode } from "@/lib/types"
import { mockGenerateTree, type GenerateInput } from "@/lib/mock-ai"
import { CreateForm } from "./create-form"
import { GeneratingView } from "./generating-view"
import { PreviewTree } from "./preview-tree"
import { toast } from "sonner"

type Stage = "form" | "generating" | "preview"

export function CreateProjectFlow() {
  const router = useRouter()
  const [stage, setStage] = useState<Stage>("form")
  const [input, setInput] = useState<GenerateInput | null>(null)
  const [tree, setTree] = useState<TreeNode | null>(null)

  const handleSubmit = (data: GenerateInput) => {
    setInput(data)
    setStage("generating")
  }

  const handleGenerated = () => {
    if (!input) return
    setTree(mockGenerateTree(input))
    setStage("preview")
  }

  const handleRegenerate = () => {
    if (!input) return
    setStage("generating")
  }

  const handleConfirm = () => {
    toast.success("项目已创建", {
      description: "（演示）树形结构已生成，正在跳转到项目页。",
    })
    // 演示：跳转到示例项目
    setTimeout(() => router.push("/projects/p1"), 800)
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      {stage === "form" && (
        <CreateForm onSubmit={handleSubmit} defaultValue={input} />
      )}
      {stage === "generating" && input && (
        <GeneratingView input={input} onDone={handleGenerated} />
      )}
      {stage === "preview" && tree && (
        <PreviewTree
          tree={tree}
          onBack={() => setStage("form")}
          onRegenerate={handleRegenerate}
          onConfirm={handleConfirm}
        />
      )}
    </div>
  )
}
