import { ArrowRight, BookOpenText, ChartNoAxesColumnIncreasing, Layers3, Settings2 } from "lucide-react"
import { Link } from "react-router"

const pages = {
  cards: { title: "卡片库", eyebrow: "Library", description: "集中浏览、筛选和整理所有复习卡片。", icon: Layers3 },
  statistics: { title: "复习统计", eyebrow: "Insights", description: "查看复习趋势、记忆保持情况和每日完成量。", icon: ChartNoAxesColumnIncreasing },
  settings: { title: "设置", eyebrow: "Preferences", description: "管理复习目标、FSRS 参数、数据备份与本地存储。", icon: Settings2 },
  "not-found": { title: "页面不存在", eyebrow: "Not found", description: "这个页面还没有创建，先回到笔记继续整理知识。", icon: BookOpenText },
} as const

export function PlaceholderPage({ page }: { page: keyof typeof pages }) {
  const item = pages[page]
  const Icon = item.icon
  return <div className="flex min-h-[calc(100vh-8.5rem)] items-center justify-center rounded-2xl border border-[#e5e6df] bg-[#fbfbf8] px-6 text-center"><div className="max-w-md"><div className="mx-auto grid size-14 place-items-center rounded-2xl bg-[#e9eee3] text-[#718264]"><Icon size={23} /></div><p className="mt-5 text-[10px] font-semibold uppercase tracking-[0.15em] text-[#8a957e]">{item.eyebrow}</p><h1 className="mt-2 text-2xl font-semibold tracking-tight text-[#35392f]">{item.title}</h1><p className="mt-2 text-sm leading-6 text-[#85897d]">{item.description}</p><Link to="/notes" className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[#30352a] px-4 py-2.5 text-sm text-white hover:bg-[#41473a]">回到笔记<ArrowRight size={15} /></Link></div></div>
}
