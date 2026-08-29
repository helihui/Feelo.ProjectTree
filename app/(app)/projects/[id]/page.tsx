import { getProject, getMembers } from "@/app/actions/projects"
import { ProjectView } from "@/components/project/project-view"
import { requireMember } from "@/lib/session"
import { notFound } from "next/navigation"

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const [member, project, members] = await Promise.all([
    requireMember(),
    getProject(id),
    getMembers(),
  ])
  if (!project) notFound()

  return (
    <ProjectView
      project={project}
      members={members}
      currentMemberId={member.memberId}
      roleKey={member.roleKey}
    />
  )
}
