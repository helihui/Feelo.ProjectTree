"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { authClient, useSession } from "@/lib/auth-client"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Loader2, Upload, LogOut } from "lucide-react"
import { toast } from "sonner"

function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export function ProfileView() {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const { data: session, isPending } = useSession()
  const user = session?.user

  // 资料
  const [name, setName] = useState("")
  const [image, setImage] = useState<string | null>(null)
  const [savingProfile, setSavingProfile] = useState(false)

  // 密码
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [savingPassword, setSavingPassword] = useState(false)

  const [signingOut, setSigningOut] = useState(false)

  useEffect(() => {
    if (user) {
      setName(user.name ?? "")
      setImage(user.image ?? null)
    }
  }, [user])

  useEffect(() => {
    if (!isPending && !user) {
      router.replace("/sign-in")
    }
  }, [isPending, router, user])

  function handlePickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 1024 * 1024) {
      toast.error("图片需小于 1MB")
      return
    }
    const reader = new FileReader()
    reader.onload = () => setImage(reader.result as string)
    reader.readAsDataURL(file)
  }

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault()
    if (!user) return
    setSavingProfile(true)
    try {
      const { error } = await authClient.updateUser({ name, image: image ?? undefined })
      if (error) throw new Error(error.message || "保存失败")
      toast.success("资料已更新")
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "保存失败")
    } finally {
      setSavingProfile(false)
    }
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault()
    if (!user) return
    if (newPassword !== confirmPassword) {
      toast.error("两次输入的新密码不一致")
      return
    }
    setSavingPassword(true)
    try {
      const { error } = await authClient.changePassword({
        currentPassword,
        newPassword,
        revokeOtherSessions: true,
      })
      if (error) throw new Error(error.message || "修改失败")
      toast.success("密码已修改")
      setCurrentPassword("")
      setNewPassword("")
      setConfirmPassword("")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "修改失败")
    } finally {
      setSavingPassword(false)
    }
  }

  async function handleSignOut() {
    setSigningOut(true)
    try {
      const res = await fetch("/api/auth/sign-out", {
        method: "POST",
        credentials: "include",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: "{}",
      })
      if (!res.ok) throw new Error("登出请求失败")
      toast.success("已退出登录")
      window.location.assign("/sign-in")
    } catch {
      toast.error("退出失败，请重试")
      setSigningOut(false)
    }
  }

  if (isPending) {
    return <ProfileSkeleton />
  }

  if (!user) {
    return null
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      {/* 个人资料 + 头像 */}
      <Card>
        <CardHeader>
          <CardTitle>个人资料</CardTitle>
          <CardDescription>更新你的头像与显示名称。</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={saveProfile} className="flex flex-col gap-5">
            <div className="flex items-center gap-4">
              <Avatar className="h-16 w-16">
                {image && <AvatarImage src={image || "/placeholder.svg"} alt={name} />}
                <AvatarFallback className="bg-primary text-lg font-semibold text-primary-foreground">
                  {initialsOf(name || "U")}
                </AvatarFallback>
              </Avatar>
              <div className="flex flex-col gap-2">
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handlePickImage}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileRef.current?.click()}
                >
                  <Upload className="h-4 w-4" />
                  上传头像
                </Button>
                {image && (
                  <button
                    type="button"
                    onClick={() => setImage(null)}
                    className="text-left text-xs text-muted-foreground underline-offset-4 hover:underline"
                  >
                    移除头像
                  </button>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="name">姓名</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email">邮箱</Label>
              <Input id="email" value={user.email ?? ""} disabled />
              <p className="text-xs text-muted-foreground">邮箱不可修改。</p>
            </div>

            <div>
              <Button type="submit" disabled={savingProfile}>
                {savingProfile && <Loader2 className="h-4 w-4 animate-spin" />}
                保存资料
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* 修改密码 */}
      <Card>
        <CardHeader>
          <CardTitle>修改密码</CardTitle>
          <CardDescription>修改后将退出其他设备上的登录。</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={changePassword} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cur">当前密码</Label>
              <Input
                id="cur"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new">新密码</Label>
              <Input
                id="new"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="confirm">确认新密码</Label>
              <Input
                id="confirm"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
              />
            </div>
            <div>
              <Button type="submit" disabled={savingPassword}>
                {savingPassword && <Loader2 className="h-4 w-4 animate-spin" />}
                更新密码
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* 退出登录 */}
      <Card>
        <CardHeader>
          <CardTitle>退出登录</CardTitle>
          <CardDescription>退出当前账号，返回登录页。</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="destructive" onClick={handleSignOut} disabled={signingOut}>
            {signingOut ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
            退出登录
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

function ProfileSkeleton() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      {[0, 1, 2].map((idx) => (
        <Card key={idx}>
          <CardHeader>
            <div className="h-6 w-28 animate-pulse rounded bg-muted" />
            <div className="h-4 w-56 animate-pulse rounded bg-muted" />
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="h-20 w-full animate-pulse rounded-xl bg-muted" />
              <div className="h-10 w-full animate-pulse rounded-md bg-muted" />
              <div className="h-10 w-full animate-pulse rounded-md bg-muted" />
              <div className="h-9 w-24 animate-pulse rounded-md bg-muted" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
