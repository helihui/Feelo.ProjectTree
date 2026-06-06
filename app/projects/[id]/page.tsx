import { AppShell } from "@/components/app-shell"
import { getProject, getMembers } from "@/app/actions/projects"
import { ProjectView } from "@/components/project/project-view"
import { notFound } from "next/navigation"

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const [project, members] = await Promise.all([getProject(id), getMembers()])
  if (!project) notFound()

  return (
    <AppShell>
      <ProjectView project={project} members={members} />
    </AppShell>
  )
}
