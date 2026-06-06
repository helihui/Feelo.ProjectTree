"use client"

import { useState } from "react"
import { Input } from "@/components/ui/input"
import { X, Plus } from "lucide-react"

export function TagPicker({
  suggestions,
  value,
  onChange,
}: {
  suggestions: string[]
  value: string[]
  onChange: (tags: string[]) => void
}) {
  const [draft, setDraft] = useState("")

  const add = (tag: string) => {
    const t = tag.trim()
    if (!t || value.includes(t)) return
    onChange([...value, t])
    setDraft("")
  }

  const remove = (tag: string) => onChange(value.filter((t) => t !== tag))

  const available = suggestions.filter((s) => !value.includes(s))

  return (
    <div className="flex flex-col gap-2">
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((t) => (
            <span
              key={t}
              className="flex items-center gap-1 rounded bg-secondary px-1.5 py-0.5 text-xs text-secondary-foreground"
            >
              {t}
              <button
                type="button"
                onClick={() => remove(t)}
                aria-label={`移除标签 ${t}`}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="flex items-center gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              add(draft)
            }
          }}
          placeholder="输入标签后回车"
          className="h-9"
        />
        <button
          type="button"
          onClick={() => add(draft)}
          aria-label="添加标签"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-input text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
      {available.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {available.slice(0, 8).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => add(s)}
              className="rounded border border-dashed border-border px-1.5 py-0.5 text-xs text-muted-foreground transition-colors hover:border-solid hover:text-foreground"
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
