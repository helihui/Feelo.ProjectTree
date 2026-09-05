"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import type { TreeNode } from "@/lib/types"
import { mockGenerateTree, type GenerateInput } from "@/lib/mock-ai"
import { createProject } from "@/app/actions/projects"
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
  const [saving, startSaving] = useTransition()

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
    if (!tree || !input) return
    startSaving(async () => {
      try {
        const projectId = await createProject({
          name: input.name,
          description: input.requirement,
          tree,
        })
        toast.success("项目已创建")
        router.push(`/projects/${projectId}`)
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "创建失败，请重试")
      }
    })
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
          saving={saving}
          onBack={() => setStage("form")}
          onRegenerate={handleRegenerate}
          onConfirm={handleConfirm}
        />
      )}
    </div>
  )
}
