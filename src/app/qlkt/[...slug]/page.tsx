'use client'
import { use } from 'react'
import { LayoutTemplate } from 'lucide-react'
import { V2_NAV, V2_SUBTABS, V2_BASE } from '@/lib/v2-nav'
import { SegTabs, Card } from '@/ui'

// Placeholder cho các module CHƯA port (GĐ0). Route cụ thể (vd so-cong-tac/giao-viec) đã có
// page riêng nên thắng catch-all; mọi route /v2/* còn lại rơi vào đây → nav vẫn bấm được.
export default function V2Placeholder({ params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = use(params)
  const [parentSlug, childSlug, subSlug] = slug
  const parent = V2_NAV.find(p => p.slug === parentSlug)
  const child = parent?.children.find(c => c.slug === childSlug)
  const subkey = parentSlug && childSlug ? `${parentSlug}/${childSlug}` : ''
  const subtabs = V2_SUBTABS[subkey]
  const label = child?.label || parent?.label || slug.join(' / ')

  return (
    <div className="space-y-4">
      {subtabs && (
        <SegTabs
          items={subtabs}
          active={subSlug || subtabs[0].slug}
          hrefFor={(s) => `${V2_BASE}/${parentSlug}/${childSlug}/${s}`}
        />
      )}
      <Card className="p-10 text-center">
        <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto mb-3">
          <LayoutTemplate className="w-6 h-6" />
        </div>
        <div className="font-semibold text-slate-700">Module “{label}” — chưa port</div>
        <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
          Trang này sẽ ghép component <code>features/{childSlug || parentSlug}</code> và gọi lại API cũ khi tới lượt port. Vỏ route + Design System (GĐ0) đã sẵn sàng.
        </p>
      </Card>
    </div>
  )
}
