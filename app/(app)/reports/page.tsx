import { ReportsView } from "@/components/reports/reports-view"
import { getReportProjects, getReportData } from "@/lib/queries/dashboard"

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string }>
}) {
  const { project } = await searchParams
  const projects = await getReportProjects()
  const activeId = project && projects.some((p) => p.id === project) ? project : projects[0]?.id
  const data = activeId ? await getReportData(activeId) : null

  return <ReportsView projects={projects} data={data} />
}
