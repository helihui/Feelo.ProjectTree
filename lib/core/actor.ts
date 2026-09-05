import { hasPermission, type Permission, type RoleKey } from "@/lib/permissions"

/**
 * 一次操作的执行者。网页会话与 MCP API Key 都归一到这个结构，
 * 业务层只认 Actor，不关心调用方是浏览器还是 MCP 客户端。
 */
export interface Actor {
  memberId: string
  roleKey: RoleKey
  /** 授权范围。null 表示不额外收窄（网页会话）；数组表示 API Key 声明的范围 */
  scopes: Permission[] | null
}

/** 业务错误，code 供 MCP 层映射成机器可读的错误码 */
export class CoreError extends Error {
  constructor(
    readonly code:
      | "unauthorized"
      | "forbidden"
      | "not_found"
      | "invalid_input"
      | "too_large",
    message: string,
  ) {
    super(message)
    this.name = "CoreError"
  }
}

/**
 * 最终权限 = 角色权限 ∩ Key 声明的范围。
 * Key 只能收窄不能放大，因此 admin 也可以签发一把只读密钥。
 */
export function can(actor: Actor, permission: Permission): boolean {
  if (!hasPermission(actor.roleKey, permission)) return false
  if (actor.scopes === null) return true
  return actor.scopes.includes(permission)
}

export function assertCan(actor: Actor, permission: Permission): void {
  if (!can(actor, permission)) {
    throw new CoreError("forbidden", `缺少权限：${permission}`)
  }
}

/** 能否编辑指定节点：node:manage 可编辑任意节点，否则只能编辑指派给自己的 */
export function canEditNodeAs(actor: Actor, assigneeIds: string[]): boolean {
  if (can(actor, "node:manage")) return true
  if (!can(actor, "node:updateOwn")) return false
  return assigneeIds.includes(actor.memberId)
}
