"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useState, type MouseEvent, type ReactNode } from "react"
import { Loader2 } from "lucide-react"

export function ProjectRouteLink({
  href,
  children,
  className,
  prefetchOnMount = false,
}: {
  href: string
  children: ReactNode
  className?: string
  /** 首屏可见的入口可开启，挂载后立即预取路由 */
  prefetchOnMount?: boolean
}) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  const prefetch = () => {
    router.prefetch(href)
  }

  useEffect(() => {
    if (prefetchOnMount) router.prefetch(href)
  }, [prefetchOnMount, href, router])

  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return
    }

    setLoading(true)
  }

  return (
    <>
      <Link
        href={href}
        className={className}
        onMouseEnter={prefetch}
        onFocus={prefetch}
        onClick={handleClick}
      >
        {children}
      </Link>

      {loading && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/65 backdrop-blur-sm">
          <div className="flex min-w-56 items-center gap-3 rounded-2xl border border-border bg-card px-5 py-4 shadow-xl">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <div className="flex flex-col">
              <span className="text-sm font-semibold">正在加载项目</span>
              <span className="text-xs text-muted-foreground">请稍候，正在打开项目详情...</span>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
