"use client"

import { useState, useTransition } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { createApiKey, deleteApiKey, getApiKeys, toggleApiKey } from "@/app/actions/api-keys"
import type { ApiKeyBrief } from "@/lib/api-keys"
import type { Permission } from "@/lib/permissions"
import { KeyRound, Copy, Trash2, Power, Check } from "lucide-react"
import { toast } from "sonner"

/** 可勾选的权限范围与说明 */
const SCOPE_ITEMS: { value: Permission; label: string; hint: string }[] = [
  { value: "project:create", label: "创建项目", hint: "create_project" },
  { value: "node:manage", label: "管理节点", hint: "add_node / add_subtree / update_node / delete_node" },
  { value: "node:updateOwn", label: "更新自己负责的节点", hint: "update_node / update_progress（仅本人任务）" },
  { value: "comment:write", label: "发表评论", hint: "add_comment" },
  { value: "member:manage", label: "管理成员", hint: "update_project_members" },
]

const EXPIRY_OPTIONS = [
  { value: "0", label: "永不过期" },
  { value: "30", label: "30 天" },
  { value: "90", label: "90 天" },
  { value: "365", label: "365 天" },
]

export function ApiKeysView({
  initialKeys,
  members,
  canAssignOthers,
  currentMemberId,
}: {
  initialKeys: ApiKeyBrief[]
  members: { id: string; name: string }[]
  canAssignOthers: boolean
  currentMemberId: string
}) {
  const [keys, setKeys] = useState(initialKeys)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [name, setName] = useState("")
  const [memberId, setMemberId] = useState(currentMemberId)
  const [scopes, setScopes] = useState<Permission[]>(["node:manage", "comment:write"])
  const [expiry, setExpiry] = useState("0")
  const [pending, startTransition] = useTransition()
  const [issued, setIssued] = useState<{ name: string; key: string } | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<ApiKeyBrief | null>(null)
  const [copied, setCopied] = useState(false)

  const refresh = async () => setKeys(await getApiKeys())

  const toggleScope = (s: Permission) =>
    setScopes((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]))

  const submit = () => {
    if (!name.trim()) return
    startTransition(async () => {
      try {
        const { key } = await createApiKey({
          name: name.trim(),
          memberId,
          scopes,
          expiresInDays: Number(expiry) || null,
        })
        setIssued({ name: name.trim(), key })
        setDialogOpen(false)
        setName("")
        await refresh()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "签发失败")
      }
    })
  }

  const toggle = (k: ApiKeyBrief) => {
    startTransition(async () => {
      try {
        await toggleApiKey(k.id, !k.enabled)
        setKeys((prev) => prev.map((x) => (x.id === k.id ? { ...x, enabled: !x.enabled } : x)))
        toast.success(k.enabled ? "密钥已停用" : "密钥已启用")
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "操作失败")
      }
    })
  }

  const remove = () => {
    if (!deleteTarget) return
    const target = deleteTarget
    startTransition(async () => {
      try {
        await deleteApiKey(target.id)
        setKeys((prev) => prev.filter((x) => x.id !== target.id))
        setDeleteTarget(null)
        toast.success("密钥已吊销")
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "吊销失败")
      }
    })
  }

  const copyKey = async () => {
    if (!issued) return
    await navigator.clipboard.writeText(issued.key)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="flex-1 overflow-y-auto px-6 py-6">
      <div className="mx-auto max-w-4xl">
        <div className="mb-4 flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            共 {keys.length} 把密钥，用于第三方通过 MCP 调用本系统
          </p>
          <Button onClick={() => setDialogOpen(true)} className="gap-1.5">
            <KeyRound className="h-4 w-4" />
            签发密钥
          </Button>
        </div>

        {keys.length === 0 ? (
          <Card className="p-10 text-center text-sm text-muted-foreground">
            还没有密钥。签发一把后，把它交给第三方即可通过 MCP 端点访问。
          </Card>
        ) : (
          <div className="flex flex-col gap-3">
            {keys.map((k) => (
              <Card key={k.id} className="flex flex-row items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="truncate font-semibold">{k.name}</span>
                    <Badge variant={k.enabled ? "secondary" : "outline"} className="shrink-0 font-normal">
                      {k.enabled ? "启用中" : "已停用"}
                    </Badge>
                    {k.scopes.length === 0 && (
                      <Badge variant="outline" className="shrink-0 font-normal text-muted-foreground">
                        只读
                      </Badge>
                    )}
                  </div>
                  <p className="mt-1 truncate font-mono text-xs text-muted-foreground">
                    {k.keyPrefix}••••••••
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    归属 {k.memberName} · 权限 {k.scopes.join("、") || "无写权限"} ·{" "}
                    {k.expiresAt ? `到期 ${k.expiresAt.slice(0, 10)}` : "永不过期"} ·{" "}
                    {k.lastUsedAt ? `最近使用 ${k.lastUsedAt.slice(0, 10)}` : "未使用过"}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-0.5">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => toggle(k)}
                    disabled={pending}
                    title={k.enabled ? "停用" : "启用"}
                    aria-label={k.enabled ? `停用 ${k.name}` : `启用 ${k.name}`}
                  >
                    <Power className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => setDeleteTarget(k)}
                    className="text-muted-foreground hover:text-destructive"
                    aria-label={`吊销 ${k.name}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* 签发弹窗 */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>签发 API 密钥</DialogTitle>
            <DialogDescription>
              密钥以所选成员的身份执行，实际权限为该成员角色权限与下方勾选范围的交集。
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="key-name">名称</Label>
              <Input
                id="key-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="例如：Claude Desktop"
                autoFocus
              />
            </div>

            {canAssignOthers && (
              <div className="flex flex-col gap-1.5">
                <Label>归属成员</Label>
                <Select value={memberId} onValueChange={(v) => v && setMemberId(v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {members.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="flex flex-col gap-2">
              <Label>权限范围</Label>
              {SCOPE_ITEMS.map((s) => (
                <label key={s.value} className="flex items-start gap-2.5 text-sm">
                  <Checkbox
                    checked={scopes.includes(s.value)}
                    onCheckedChange={() => toggleScope(s.value)}
                    className="mt-0.5"
                  />
                  <span className="min-w-0">
                    <span className="font-medium">{s.label}</span>
                    <span className="block truncate text-xs text-muted-foreground">{s.hint}</span>
                  </span>
                </label>
              ))}
              <p className="text-xs text-muted-foreground">
                全部不勾选即为只读密钥，只能调用查询类工具。
              </p>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>有效期</Label>
              <Select value={expiry} onValueChange={(v) => v && setExpiry(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EXPIRY_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              取消
            </Button>
            <Button onClick={submit} disabled={!name.trim() || pending}>
              {pending ? "签发中..." : "签发"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 密钥原文只展示这一次 */}
      <Dialog open={!!issued} onOpenChange={(o) => !o && setIssued(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>密钥「{issued?.name}」已签发</DialogTitle>
            <DialogDescription>
              请立即复制保存。关闭后无法再次查看，丢失只能重新签发。
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 overflow-x-auto rounded-md bg-muted px-3 py-2 font-mono text-xs">
              {issued?.key}
            </code>
            <Button variant="outline" size="icon" onClick={copyKey} aria-label="复制密钥">
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            第三方调用时把它放在请求头 <code className="font-mono">x-api-key</code> 中。
          </p>
          <DialogFooter>
            <Button onClick={() => setIssued(null)}>我已保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 吊销确认 */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>吊销密钥「{deleteTarget?.name}」</DialogTitle>
            <DialogDescription>
              吊销后使用该密钥的调用会立即失败，不可恢复。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              取消
            </Button>
            <Button variant="destructive" onClick={remove} disabled={pending}>
              {pending ? "处理中..." : "确认吊销"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
