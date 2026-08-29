/** 缓存标签常量（"use server" 文件不能导出非函数，故单独抽出） */
export const MEMBERS_TAG = "members"
export const PROJECTS_TAG = "projects"
export const projectTag = (projectId: string) => `project:${projectId}`
