import {
  BookOpenText,
  ChartNoAxesColumnIncreasing,
  Layers3,
  Settings2,
  Sparkles,
} from "lucide-react"
import { NavLink, Outlet } from "react-router"
import { useEffect, useState } from "react"
import { api, type Stats } from "@/lib/api"

const navigation = [
  { to: "/notes", label: "笔记", icon: BookOpenText },
  { to: "/review", label: "今日复习", icon: Sparkles, badge: true },
  { to: "/cards", label: "卡片库", icon: Layers3 },
  { to: "/statistics", label: "复习统计", icon: ChartNoAxesColumnIncreasing },
  { to: "/settings", label: "设置", icon: Settings2 },
]

export function AppShell() {
  const [due, setDue] = useState(0)

  useEffect(() => {
    api<Stats>("/api/reviews/stats").then((stats) => setDue(stats.due)).catch(() => setDue(0))
    const timer = window.setInterval(() => {
      api<Stats>("/api/reviews/stats").then((stats) => setDue(stats.due)).catch(() => setDue(0))
    }, 60_000)
    return () => window.clearInterval(timer)
  }, [])

  return (
    <main className="min-h-screen bg-[#f4f4ef] text-[#262920]">
      <div className="mx-auto flex min-h-screen max-w-[1600px] flex-col px-4 py-4 sm:px-7 sm:py-6">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-[#e4e5de] pb-4">
          <div className="flex items-center gap-3">
            <div className="grid size-9 place-items-center rounded-xl bg-[#30352a] text-[#f5f4eb]"><Layers3 size={18} /></div>
            <div><p className="text-[15px] font-semibold tracking-tight">recall box</p><p className="text-[10px] tracking-[0.14em] text-[#999b91]">LOCAL KNOWLEDGE STUDIO</p></div>
          </div>
          <span className="hidden items-center gap-2 rounded-full border border-[#e3e4dd] bg-white/70 px-3 py-1.5 text-[11px] text-[#777b6f] sm:flex"><span className="size-1.5 rounded-full bg-[#7e966e]" />仅保存在本机</span>
        </header>

        <div className="grid min-h-0 flex-1 gap-4 pt-5 lg:grid-cols-[205px_minmax(0,1fr)]">
          <aside className="flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible">
            <p className="hidden px-3 pb-2 pt-1 text-[10px] font-semibold uppercase tracking-[0.13em] text-[#a4a69c] lg:block">工作区</p>
            {navigation.map((item) => {
              const Icon = item.icon
              return <NavLink key={item.to} to={item.to} className={({ isActive }) => `flex shrink-0 items-center gap-2.5 rounded-xl px-3 py-2.5 text-[13px] transition ${isActive ? "bg-[#e7ebe1] font-medium text-[#46513e]" : "text-[#74796d] hover:bg-white/70 hover:text-[#3f4439]"}`}>
                <Icon size={16} />
                <span>{item.label}</span>
                {item.badge && due > 0 && <span className="ml-auto rounded-full bg-white px-1.5 py-0.5 text-[10px] font-semibold text-[#667858]">{due}</span>}
              </NavLink>
            })}
            <div className="mt-auto hidden rounded-xl border border-[#e5e6df] bg-[#fbfbf8] p-3.5 lg:block"><p className="text-[11px] font-medium text-[#6a6f63]">本地知识空间</p><p className="mt-1.5 text-[10px] leading-4 text-[#999c91]">笔记和复习记录保存在这台设备上。</p></div>
          </aside>

          <section className="min-h-0 min-w-0"><Outlet /></section>
        </div>
        <footer className="mt-4 flex shrink-0 items-center justify-between border-t border-[#e4e5de] pt-3 text-[10px] text-[#aaaca2]"><span>Recall Box · 本地知识复习</span><span className="hidden sm:block">内容保存在此设备的 SQLite 数据库</span></footer>
      </div>
    </main>
  )
}
