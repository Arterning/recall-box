import {
  BookOpenText,
  ChartNoAxesColumnIncreasing,
  Layers3,
  Settings2,
  Brain,
  NotebookPen,
  Moon,
  Sun,
  FolderOpen,
  Copy,
  X,
} from "lucide-react"
import { NavLink, Outlet } from "react-router"
import { useEffect, useState } from "react"
import { api, type Stats } from "@/lib/api"
import { useTheme } from "@/components/theme-provider"

const navigation = [
  { to: "/notes", label: "笔记", icon: BookOpenText },
  { to: "/review", label: "问题卡片", icon: Brain, badge: "cards" },
  { to: "/notes/review", label: "复习笔记", icon: BookOpenText, badge: "notes" },
  { to: "/cards", label: "卡片库", icon: Layers3 },
  { to: "/diary", label: "日记", icon: NotebookPen },
  { to: "/statistics", label: "统计", icon: ChartNoAxesColumnIncreasing },
  { to: "/settings", label: "设置", icon: Settings2 },
]

export function AppShell() {
  const [due, setDue] = useState(0)
  const [dueNotes, setDueNotes] = useState(0)
  const [dataDirectory, setDataDirectory] = useState<{ path: string; database: string; attachments: string } | null>(null)
  const [showDataDirectory, setShowDataDirectory] = useState(false)
  const [directoryMessage, setDirectoryMessage] = useState("")
  const { theme, setTheme } = useTheme()

  useEffect(() => {
    const refreshCounts = () => api<Stats>("/api/reviews/stats").then((stats) => {
      setDue(stats.due)
      setDueNotes(stats.noteDue)
    }).catch(() => {
      setDue(0)
      setDueNotes(0)
    })
    void refreshCounts()
    const timer = window.setInterval(() => void refreshCounts(), 60_000)
    return () => window.clearInterval(timer)
  }, [])

  const toggleDataDirectory = async () => {
    if (showDataDirectory) {
      setShowDataDirectory(false)
      return
    }
    setDirectoryMessage("")
    try {
      const result = dataDirectory ?? await api<{ path: string; database: string; attachments: string }>("/api/system/data-dir")
      setDataDirectory(result)
      setShowDataDirectory(true)
    } catch (cause) {
      setDirectoryMessage(cause instanceof Error ? cause.message : "无法读取数据目录")
      setShowDataDirectory(true)
    }
  }

  const copyDataDirectory = async () => {
    if (!dataDirectory) return
    try {
      await navigator.clipboard.writeText(dataDirectory.path)
      setDirectoryMessage("路径已复制")
    } catch {
      setDirectoryMessage("无法访问剪贴板，请手动复制上方路径")
    }
  }

  const openDataDirectory = async () => {
    try {
      await api<void>("/api/system/open-data-dir", { method: "POST" })
      setDirectoryMessage("已在文件管理器中打开")
    } catch (cause) {
      setDirectoryMessage(cause instanceof Error ? cause.message : "无法打开数据目录")
    }
  }

  return (
    <main className="min-h-screen bg-[#f4f4ef] text-[#262920]">
      <div className="mx-auto flex min-h-screen max-w-[1600px] flex-col px-4 py-4 sm:px-7 sm:py-6">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-[#e4e5de] pb-4">
          <div className="flex items-center gap-3">
            <div className="grid size-9 place-items-center rounded-xl bg-[#30352a] text-[#f5f4eb]"><Layers3 size={18} /></div>
            <div><p className="text-[15px] font-semibold tracking-tight">recall box</p><p className="text-[10px] tracking-[0.14em] text-[#999b91]">LOCAL KNOWLEDGE STUDIO</p></div>
          </div>
          <button onClick={() => setTheme(theme === "dark" ? "light" : "dark")} aria-label={theme === "dark" ? "切换到浅色模式" : "切换到深色模式"} title={theme === "dark" ? "浅色模式" : "深色模式"} className="grid size-9 place-items-center rounded-xl border border-[#e3e4dd] bg-white/70 text-[#74796d] transition hover:bg-white"><span className="dark:hidden"><Moon size={16} /></span><span className="hidden dark:block"><Sun size={16} /></span></button>
        </header>

        <div className="grid min-h-0 flex-1 gap-4 pt-5 lg:grid-cols-[205px_minmax(0,1fr)]">
          <aside className="flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible">
            <p className="hidden px-3 pb-2 pt-1 text-[10px] font-semibold uppercase tracking-[0.13em] text-[#a4a69c] lg:block">工作区</p>
            {navigation.map((item) => {
              const Icon = item.icon
              return <NavLink key={item.to} to={item.to} end={item.to === "/notes"} className={({ isActive }) => `flex shrink-0 items-center gap-2.5 rounded-xl px-3 py-2.5 text-[13px] transition ${isActive ? "bg-[#e7ebe1] font-medium text-[#46513e]" : "text-[#74796d] hover:bg-white/70 hover:text-[#3f4439]"}`}>
                <Icon size={16} />
                <span>{item.label}</span>
                {item.badge && (item.badge === "cards" ? due : dueNotes) > 0 && <span className="ml-auto rounded-full bg-white px-1.5 py-0.5 text-[10px] font-semibold text-[#667858]">{item.badge === "cards" ? due : dueNotes}</span>}
              </NavLink>
            })}
          </aside>

          <section className="min-h-0 min-w-0"><Outlet /></section>
        </div>
        <footer className="relative mt-4 flex shrink-0 items-center justify-between border-t border-[#e4e5de] pt-3 text-[10px] text-[#aaaca2]"><span>Recall Box · 本地知识复习</span><div className="relative"><button onClick={() => void toggleDataDirectory()} className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[#83877c] transition hover:bg-white/70 hover:text-[#4f5549]"><FolderOpen size={13} />数据目录</button>{showDataDirectory && <div className="absolute bottom-full right-0 z-50 mb-2 w-[min(390px,calc(100vw-32px))] rounded-xl border border-[#e5e6df] bg-white p-3.5 text-left text-[#5c6155] shadow-[0_14px_42px_-18px_rgba(35,39,30,.4)]"><div className="flex items-center justify-between"><p className="text-xs font-semibold">本地数据目录</p><button onClick={() => setShowDataDirectory(false)} aria-label="关闭" className="grid size-6 place-items-center rounded-md text-[#85897d] hover:bg-[#f1f2ed]"><X size={13} /></button></div><code className="mt-2 block break-all rounded-lg bg-[#f7f8f4] px-2.5 py-2 font-mono text-[10px] leading-4 text-[#62675b]">{dataDirectory?.path || directoryMessage || "正在读取目录…"}</code><div className="mt-2 flex gap-2"><button disabled={!dataDirectory} onClick={() => void copyDataDirectory()} className="flex items-center gap-1.5 rounded-lg border border-[#e5e6df] px-2.5 py-1.5 text-[10px] hover:bg-[#f8f9f5] disabled:opacity-50"><Copy size={12} />复制路径</button><button disabled={!dataDirectory} onClick={() => void openDataDirectory()} className="flex items-center gap-1.5 rounded-lg bg-[#30352a] px-2.5 py-1.5 text-[10px] text-white hover:bg-[#41473a] disabled:opacity-50"><FolderOpen size={12} />打开文件夹</button></div><p className="mt-2 text-[9px] leading-4 text-[#999c91]">目录内包含 SQLite 数据库和图片附件。手动备份时请先退出 Recall Box，再复制整个目录。</p>{directoryMessage && <p className="mt-1 text-[9px] text-[#718360]">{directoryMessage}</p>}</div>}</div></footer>
      </div>
    </main>
  )
}
