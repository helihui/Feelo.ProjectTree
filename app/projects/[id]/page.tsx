import { AppShell } from "@/components/app-shell"
import { getProject } from "@/lib/data"
import { ProjectView } from "@/components/project/project-view"
import { notFound } from "next/navigation"

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const project = getProject(id)
  if (!project) notFound()

  return (
    <AppShell>
      <ProjectView project={project} />
    </AppShell>
  )
}
