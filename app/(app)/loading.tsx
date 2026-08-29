import { PageHeaderSkeleton, SkeletonBlock } from "@/components/skeletons"

/**
 * 内容区加载态。点击菜单后立即显示，避免停留在旧页面造成「卡住」的观感。
 * 侧边栏由 layout 持有，不参与这一层的替换。
 */
export default function Loading() {
  return (
    <>
      <PageHeaderSkeleton />
      <div className="flex-1 overflow-hidden px-6 py-6">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonBlock key={i} className="h-[104px]" />
          ))}
        </div>
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <SkeletonBlock className="h-[196px]" />
            <SkeletonBlock className="h-[196px]" />
          </div>
          <SkeletonBlock className="h-[320px]" />
        </div>
      </div>
    </>
  )
}
