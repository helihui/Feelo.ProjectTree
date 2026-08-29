"use client"

import { useState } from "react"
import { signIn } from "@/lib/auth-client"
import { acceptInvitation } from "@/app/actions/invitations"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { GitBranch, Loader2 } from "lucide-react"
import { toast } from "sonner"

export function InviteForm({
  token,
  email,
  name,
  roleLabel,
}: {
  token: string
  email: string
  name: string
  roleLabel: string
}) {
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password !== confirm) {
      toast.error("两次输入的密码不一致")
      return
    }
    setLoading(true)
    try {
      await acceptInvitation(token, password)
      const { error } = await signIn.email({ email, password })
      if (error) throw new Error(error.message || "登录失败，请手动登录")
      toast.success("账号已开通")
      window.location.assign("/")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "操作失败，请重试")
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/30 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <GitBranch className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight">设置登录密码</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              你被邀请加入 ProjectTree，设置密码后即可登录。
            </p>
          </div>
        </div>

        <form
          onSubmit={handleSubmit}
          className="flex flex-col gap-4 rounded-xl border border-border bg-card p-6 shadow-sm"
        >
          <div className="flex items-center justify-between rounded-lg bg-muted/60 px-3 py-2.5">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{name}</p>
              <p className="truncate text-xs text-muted-foreground">{email}</p>
            </div>
            <Badge variant="secondary" className="shrink-0 font-normal">
              {roleLabel}
            </Badge>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="password">设置密码</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="至少 8 位"
              required
              minLength={8}
              autoComplete="new-password"
              autoFocus
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="confirm">确认密码</Label>
            <Input
              id="confirm"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
            />
          </div>
          <Button type="submit" disabled={loading} className="mt-1">
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            开通账号并登录
          </Button>
        </form>
      </div>
    </div>
  )
}
