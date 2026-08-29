/** 权限角色标识 */
export type RoleKey = "admin" | "manager" | "member" | "guest"

/** 系统能力 */
export type Permission =
  | "member:manage" // 成员增删改、分配角色、生成邀请链接
  | "ai:configure" // AI 模型与 Prompt 模板配置
  | "project:create" // 创建项目
  | "node:manage" // 节点增删、编辑标题描述等全部字段
  | "node:updateOwn" // 更新被指派给自己的节点状态与进度
  | "comment:write" // 发表评论

const ROLE_PERMISSIONS: Record<RoleKey, Permission[]> = {
  admin: [
    "member:manage",
    "ai:configure",
    "project:create",
    "node:manage",
    "node:updateOwn",
    "comment:write",
  ],
  manager: ["project:create", "node:manage", "node:updateOwn", "comment:write"],
  member: ["node:updateOwn", "comment:write"],
  guest: [],
}

export const ROLE_LABELS: Record<RoleKey, string> = {
  admin: "管理员",
  manager: "项目经理",
  member: "成员",
  guest: "访客",
}

export const ROLE_DESCRIPTIONS: Record<RoleKey, string> = {
  admin: "全部权限，含成员管理与 AI 配置",
  manager: "创建项目、管理任务节点",
  member: "更新自己负责的任务、发表评论",
  guest: "只读查看",
}

export const ROLE_OPTIONS: RoleKey[] = ["admin", "manager", "member", "guest"]

export function isRoleKey(value: unknown): value is RoleKey {
  return typeof value === "string" && value in ROLE_PERMISSIONS
}

export function toRoleKey(value: unknown): RoleKey {
  return isRoleKey(value) ? value : "member"
}

export function hasPermission(role: RoleKey, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission)
}

/**
 * 判断能否编辑某个节点。
 * node:manage 可编辑任意节点；仅有 node:updateOwn 时只能编辑指派给自己的节点。
 */
export function canEditNode(
  role: RoleKey,
  assigneeIds: string[],
  memberId: string | null,
): boolean {
  if (hasPermission(role, "node:manage")) return true
  if (!hasPermission(role, "node:updateOwn")) return false
  return !!memberId && assigneeIds.includes(memberId)
}
