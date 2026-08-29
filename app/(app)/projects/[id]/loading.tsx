import { PageHeaderSkeleton, SkeletonBlock } from "@/components/skeletons"

/**
 * 项目详情加载态。树形布局与看板差异较大，单独给一套骨架，
 * 点击项目卡片后立即出现，不再停留在上一个页面。
 */
export default function Loading() {
  return (
    <>
      <PageHeaderSkeleton />
      <div className="flex min-h-0 flex-1">
        <div className="flex-1 space-y-3 px-6 py-6">
          <SkeletonBlock className="h-11" />
          {Array.from({ length: 8 }).map((_, i) => (
            <SkeletonBlock key={i} className="h-12" />
          ))}
        </div>
        <div className="hidden w-80 shrink-0 border-l border-border p-6 lg:block">
          <SkeletonBlock className="h-full" />
        </div>
      </div>
    </>
  )
}
