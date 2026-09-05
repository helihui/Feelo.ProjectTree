import Link from "next/link"
import { getProjectCards } from "@/lib/queries/dashboard"
import { getCurrentMember } from "@/lib/session"
import { ProjectCardItem } from "@/components/dashboard/project-card-item"

export async function ProjectGrid({
  limit = 4,
  showAllLink = true,
}: {
  limit?: number
  showAllLink?: boolean
}) {
  const [cards, member] = await Promise.all([getProjectCards(limit), getCurrentMember()])

  return (
    <section>
      {showAllLink && (
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">我的项目</h2>
          <Link
            href="/projects"
            className="text-xs font-medium text-primary hover:underline"
          >
            查看全部
          </Link>
        </div>
      )}
      {cards.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
          还没有项目，点击右上角「AI 创建项目」开始。
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {cards.map((p) => (
            <ProjectCardItem
              key={p.id}
              project={p}
              canDelete={
                member?.roleKey === "admin" ||
                (member?.roleKey === "manager" && p.ownerId === member.memberId)
              }
            />
          ))}
        </div>
      )}
    </section>
  )
}
