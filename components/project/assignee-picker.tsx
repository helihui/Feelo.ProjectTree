"use client"

import type { User } from "@/lib/types"
import { cn } from "@/lib/utils"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Check, Users } from "lucide-react"

export function AssigneePicker({
  members,
  value,
  onChange,
}: {
  members: User[]
  value: string[]
  onChange: (ids: string[]) => void
}) {
  const selected = members.filter((m) => value.includes(m.id))

  const toggle = (id: string) => {
    if (value.includes(id)) onChange(value.filter((v) => v !== id))
    else onChange([...value, id])
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex min-h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 py-1.5 text-left text-sm outline-none transition-colors hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-ring">
        {selected.length > 0 ? (
          <span className="flex flex-wrap items-center gap-1.5">
            {selected.map((u) => (
              <span
                key={u.id}
                className="flex items-center gap-1 rounded-full bg-secondary py-0.5 pl-0.5 pr-2 text-xs text-secondary-foreground"
              >
                <Avatar className="h-4 w-4">
                  <AvatarFallback
                    className="text-[8px] font-semibold text-primary-foreground"
                    style={{ backgroundColor: u.color }}
                  >
                    {u.initials}
                  </AvatarFallback>
                </Avatar>
                {u.name}
              </span>
            ))}
          </span>
        ) : (
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <Users className="h-4 w-4" />
            选择负责人
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        {members.map((u) => {
          const checked = value.includes(u.id)
          return (
            <button
              key={u.id}
              type="button"
              onClick={() => toggle(u.id)}
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm outline-none hover:bg-accent"
            >
              <Avatar className="h-6 w-6">
                <AvatarFallback
                  className="text-[10px] font-semibold text-primary-foreground"
                  style={{ backgroundColor: u.color }}
                >
                  {u.initials}
                </AvatarFallback>
              </Avatar>
              <span className="flex-1">{u.name}</span>
              <Check
                className={cn(
                  "h-4 w-4 text-primary",
                  checked ? "opacity-100" : "opacity-0",
                )}
              />
            </button>
          )
        })}
        {members.length === 0 && (
          <p className="px-2 py-1.5 text-sm text-muted-foreground">暂无成员</p>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
