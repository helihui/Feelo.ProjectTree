import { Card } from "@/components/ui/card"

/** 骨架块：与真实内容等高，避免加载完成后布局跳动 */
export function SkeletonBlock({ className }: { className?: string }) {
  return <Card className={`animate-pulse border-border/60 bg-muted/40 ${className ?? ""}`} />
}

/** 页头骨架：与 PageHeader 的高度和留白保持一致 */
export function PageHeaderSkeleton() {
  return (
    <header className="flex flex-col gap-3 border-b border-border px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 space-y-2">
        <div className="h-6 w-40 animate-pulse rounded-md bg-muted" />
        <div className="h-4 w-72 animate-pulse rounded-md bg-muted/60" />
      </div>
      <div className="h-9 w-28 animate-pulse rounded-md bg-muted" />
    </header>
  )
}
