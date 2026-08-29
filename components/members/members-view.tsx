"use client"

import { useState, useTransition } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
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
import {
  createMember,
  updateMember,
  deleteMember,
  createInvitation,
} from "@/app/actions/projects"
import { ROLE_LABELS, ROLE_OPTIONS, type RoleKey } from "@/lib/permissions"
import { UserPlus, Pencil, Trash2, Mail, Link2, Copy, ShieldCheck } from "lucide-react"
import { toast } from "sonner"

export interface MemberItem {
  id: string
  name: string
  initials: string
  color: string
  email: string | null
  role: string
  roleKey: RoleKey
  hasAccount: boolean
  pendingInviteToken: string | null
  createdAt: string
}

export function MembersView({
  initialMembers,
  currentMemberId,
}: {
  initialMembers: MemberItem[]
  currentMemberId: string
}) {
  const [members, setMembers] = useState<MemberItem[]>(initialMembers)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<MemberItem | null>(null)
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [role, setRole] = useState("")
  const [roleKey, setRoleKey] = useState<RoleKey>("member")
  const [pending, startTransition] = useTransition()
  const [deleteTarget, setDeleteTarget] = useState<MemberItem | null>(null)
  const [inviteLink, setInviteLink] = useState<{ name: string; url: string; expiresAt: string } | null>(
    null,
  )

  const openCreate = () => {
    setEditing(null)
    setName("")
    setEmail("")
    setRole("")
    setRoleKey("member")
    setDialogOpen(true)
  }

  const openEdit = (m: MemberItem) => {
    setEditing(m)
    setName(m.name)
    setEmail(m.email ?? "")
    setRole(m.role)
    setRoleKey(m.roleKey)
    setDialogOpen(true)
  }

  const submit = () => {
    if (!name.trim()) return
    startTransition(async () => {
      try {
        if (editing) {
          await updateMember(editing.id, {
            name: name.trim(),
            email: email.trim() || null,
            role: role.trim() || "成员",
            roleKey,
          })
          setMembers((prev) =>
            prev.map((m) =>
              m.id === editing.id
                ? {
                    ...m,
                    name: name.trim(),
                    initials: name.trim().slice(0, 2).toUpperCase(),
                    email: email.trim() || null,
                    role: role.trim() || "成员",
                    roleKey,
                  }
                : m,
            ),
          )
          toast.success("成员已更新")
        } else {
          const id = await createMember({
            name: name.trim(),
            email: email.trim() || undefined,
            role: role.trim() || undefined,
            roleKey,
          })
          setMembers((prev) => [
            ...prev,
            {
              id,
              name: name.trim(),
              initials: name.trim().slice(0, 2).toUpperCase(),
              color: "oklch(0.6 0.13 195)",
              email: email.trim() || null,
              role: role.trim() || "成员",
              roleKey,
              hasAccount: false,
              pendingInviteToken: null,
              createdAt: new Date().toISOString().slice(0, 10),
            },
          ])
          toast.success("成员已添加")
        }
        setDialogOpen(false)
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "操作失败，请重试")
      }
    })
  }

  const invite = (m: MemberItem) => {
    startTransition(async () => {
      try {
        const { token, expiresAt } = await createInvitation(m.id)
        setMembers((prev) =>
          prev.map((x) => (x.id === m.id ? { ...x, pendingInviteToken: token } : x)),
        )
        setInviteLink({
          name: m.name,
          url: `${window.location.origin}/invite/${token}`,
          expiresAt,
        })
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "生成邀请链接失败")
      }
    })
  }

  const copyLink = async () => {
    if (!inviteLink) return
    await navigator.clipboard.writeText(inviteLink.url)
    toast.success("链接已复制")
  }

  const confirmDelete = () => {
    if (!deleteTarget) return
    const target = deleteTarget
    setMembers((prev) => prev.filter((m) => m.id !== target.id))
    setDeleteTarget(null)
    startTransition(async () => {
      try {
        await deleteMember(target.id)
        toast.success("成员已删除")
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "删除失败，请刷新重试")
      }
    })
  }

  return (
    <div className="flex-1 overflow-y-auto px-6 py-6">
      <div className="mx-auto max-w-4xl">
        <div className="mb-4 flex items-center justify-between">
          <p className="text-sm text-muted-foreground">共 {members.length} 位成员</p>
          <Button onClick={openCreate} className="gap-1.5">
            <UserPlus className="h-4 w-4" />
            新增成员
          </Button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {members.map((m) => (
            <Card key={m.id} className="flex flex-row items-center gap-3 p-4">
              <Avatar className="h-11 w-11 shrink-0">
                <AvatarFallback
                  className="text-sm font-semibold text-primary-foreground"
                  style={{ backgroundColor: m.color }}
                >
                  {m.initials}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="truncate font-semibold">{m.name}</span>
                  <Badge variant="secondary" className="shrink-0 font-normal">
                    {ROLE_LABELS[m.roleKey]}
                  </Badge>
                  {m.hasAccount ? (
                    <Badge variant="outline" className="shrink-0 gap-1 font-normal">
                      <ShieldCheck className="h-3 w-3" />
                      已开通
                    </Badge>
                  ) : m.pendingInviteToken ? (
                    <Badge variant="outline" className="shrink-0 font-normal text-muted-foreground">
                      邀请中
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="shrink-0 font-normal text-muted-foreground">
                      未开通
                    </Badge>
                  )}
                </div>
                <span className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                  <Mail className="h-3 w-3 shrink-0" />
                  {m.email || "未填写邮箱"}
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-0.5">
                {!m.hasAccount && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => invite(m)}
                    disabled={pending}
                    aria-label={`为 ${m.name} 生成邀请链接`}
                    title="生成邀请链接"
                  >
                    <Link2 className="h-4 w-4" />
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => openEdit(m)}
                  aria-label={`编辑 ${m.name}`}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => setDeleteTarget(m)}
                  disabled={m.id === currentMemberId}
                  aria-label={`删除 ${m.name}`}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      </div>

      {/* 新增/编辑弹窗 */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{editing ? "编辑成员" : "新增成员"}</DialogTitle>
            <DialogDescription>
              {editing ? "修改成员的基本信息与权限角色。" : "添加成员后，可生成邀请链接让其自行设置密码。"}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="member-name">姓名</Label>
              <Input
                id="member-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="例如：林深"
                autoFocus
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="member-email">邮箱</Label>
              <Input
                id="member-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="member-role">岗位</Label>
              <Input
                id="member-role"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                placeholder="例如：研发负责人"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>权限角色</Label>
              <Select value={roleKey} onValueChange={(v) => setRoleKey(v as RoleKey)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLE_OPTIONS.map((r) => (
                    <SelectItem key={r} value={r}>
                      {ROLE_LABELS[r]}
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
              {pending ? "保存中..." : "保存"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 邀请链接 */}
      <Dialog open={!!inviteLink} onOpenChange={(o) => !o && setInviteLink(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>邀请 {inviteLink?.name} 开通账号</DialogTitle>
            <DialogDescription>
              把链接发给该成员，对方打开后自行设置密码即可登录。有效期至 {inviteLink?.expiresAt}。
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2">
            <Input readOnly value={inviteLink?.url ?? ""} className="font-mono text-xs" />
            <Button variant="outline" size="icon" onClick={copyLink} aria-label="复制链接">
              <Copy className="h-4 w-4" />
            </Button>
          </div>
          <DialogFooter>
            <Button onClick={() => setInviteLink(null)}>完成</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 删除确认 */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>删除成员</DialogTitle>
            <DialogDescription>
              确定删除「{deleteTarget?.name}」吗？该操作不可撤销。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              取消
            </Button>
            <Button variant="destructive" onClick={confirmDelete}>
              删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
