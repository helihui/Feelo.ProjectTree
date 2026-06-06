import {
  pgTable,
  text,
  integer,
  timestamp,
  boolean,
  jsonb,
} from "drizzle-orm/pg-core"

// 人员
export const members = pgTable("members", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  initials: text("initials").notNull(),
  color: text("color").notNull(),
  email: text("email"),
  role: text("role").notNull().default("成员"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
})

// 项目
export const projects = pgTable("projects", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  ownerId: text("ownerId"),
  memberIds: jsonb("memberIds").$type<string[]>().notNull().default([]),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
})

// 节点（树形，靠 parentId 自关联；rootNode 的 parentId 为 null）
export const nodes = pgTable("nodes", {
  id: text("id").primaryKey(),
  projectId: text("projectId").notNull(),
  parentId: text("parentId"),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  type: text("type").notNull().default("task"),
  status: text("status").notNull().default("todo"),
  priority: text("priority").notNull().default("medium"),
  progress: integer("progress").notNull().default(0),
  assigneeIds: jsonb("assigneeIds").$type<string[]>().notNull().default([]),
  startDate: text("startDate"),
  dueDate: text("dueDate"),
  estimateHours: integer("estimateHours").notNull().default(0),
  tags: jsonb("tags").$type<string[]>().notNull().default([]),
  aiGenerated: boolean("aiGenerated").notNull().default(false),
  sortOrder: integer("sortOrder").notNull().default(0),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
})

export type MemberRow = typeof members.$inferSelect
export type ProjectRow = typeof projects.$inferSelect
export type NodeRow = typeof nodes.$inferSelect
