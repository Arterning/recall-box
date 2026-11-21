import { useCallback, useEffect, useMemo, useState } from "react"
import { CalendarDays, ChevronLeft, ChevronRight, Eye, LoaderCircle, PencilLine, Save, Trash2 } from "lucide-react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { api, toErrorMessage, type DiaryEntry, type DiarySummary } from "@/lib/api"

function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
}

function currentMonth(date: string) {
  return date.slice(0, 7)
}

function displayDate(value: string, options: Intl.DateTimeFormatOptions = { month: "long", day: "numeric", weekday: "long" }) {
  // SQLite drivers may serialize a DATE column as either YYYY-MM-DD or a
  // timestamp. Normalize it before formatting so legacy rows cannot crash
  // the whole diary page.
  const datePart = value?.slice(0, 10)
  const date = /^\d{4}-\d{2}-\d{2}$/.test(datePart) ? new Date(`${datePart}T12:00:00`) : new Date(Number.NaN)
  if (Number.isNaN(date.getTime())) return value || "未知日期"
  return new Intl.DateTimeFormat("zh-CN", options).format(date)
}

function displayTime(value?: string) {
  if (!value) return ""
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })
}

export function DiaryPage() {
  const today = dateKey(new Date())
  const [selectedDate, setSelectedDate] = useState(today)
  const [month, setMonth] = useState(currentMonth(today))
  const [entries, setEntries] = useState<DiarySummary[]>([])
  const [entry, setEntry] = useState<DiaryEntry>({ id: 0, date: today, content: "", createdAt: "", updatedAt: "" })
  const [content, setContent] = useState("")
  const [savedContent, setSavedContent] = useState("")
  const [view, setView] = useState<"edit" | "preview">("edit")
  const [loadingEntries, setLoadingEntries] = useState(true)
  const [loadingEntry, setLoadingEntry] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  const dirty = content !== savedContent
  const monthDate = useMemo(() => new Date(`${month}-01T12:00:00`), [month])
  const calendarCells = useMemo(() => {
    const year = monthDate.getFullYear()
    const monthIndex = monthDate.getMonth()
    const offset = new Date(year, monthIndex, 1).getDay()
    const days = new Date(year, monthIndex + 1, 0).getDate()
    return Array.from({ length: 42 }, (_, index) => index - offset + 1).map((day) => day >= 1 && day <= days ? dateKey(new Date(year, monthIndex, day)) : null)
  }, [monthDate])
  const entryDates = useMemo(() => new Set(entries.map((item) => item.date)), [entries])

  const loadEntries = useCallback(async (monthKey: string) => {
    setLoadingEntries(true)
    try {
      setEntries(await api<DiarySummary[]>(`/api/diaries?month=${monthKey}`))
    } catch (cause) {
      setError(toErrorMessage(cause, "加载日记列表失败"))
    } finally {
      setLoadingEntries(false)
    }
  }, [])

  useEffect(() => { void loadEntries(month) }, [loadEntries, month])

  useEffect(() => {
    setLoadingEntry(true)
    setError("")
    api<DiaryEntry>(`/api/diaries/${selectedDate}`).then((result) => {
      setEntry(result)
      setContent(result.content || "")
      setSavedContent(result.content || "")
      setView("edit")
    }).catch((cause: unknown) => setError(toErrorMessage(cause, "加载日记失败"))).finally(() => setLoadingEntry(false))
  }, [selectedDate])

  const chooseDate = (nextDate: string) => {
    if (nextDate === selectedDate) return
    if (dirty && !window.confirm("当前日记有未保存的修改，切换日期会放弃这些修改。继续吗？")) return
    setSelectedDate(nextDate)
    const nextMonth = currentMonth(nextDate)
    if (nextMonth !== month) setMonth(nextMonth)
  }

  const moveMonth = (delta: number) => {
    if (dirty && !window.confirm("当前日记有未保存的修改，切换月份会放弃这些修改。继续吗？")) return
    const next = new Date(monthDate)
    next.setMonth(next.getMonth() + delta)
    const key = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`
    setMonth(key)
    setSelectedDate(`${key}-01`)
  }

  const save = async () => {
    if (!dirty || saving) return
    setSaving(true)
    setError("")
    try {
      const saved = await api<DiaryEntry>(`/api/diaries/${selectedDate}`, { method: "PUT", body: JSON.stringify({ content }) })
      setEntry(saved)
      setContent(saved.content)
      setSavedContent(saved.content)
      await loadEntries(month)
    } catch (cause) {
      setError(toErrorMessage(cause, "保存日记失败"))
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    if (!entry.id || !window.confirm(`确定删除 ${displayDate(selectedDate)} 的日记吗？`)) return
    try {
      await api<void>(`/api/diaries/${selectedDate}`, { method: "DELETE" })
      setEntry({ id: 0, date: selectedDate, content: "", createdAt: "", updatedAt: "" })
      setContent("")
      setSavedContent("")
      await loadEntries(month)
    } catch (cause) {
      setError(toErrorMessage(cause, "删除日记失败"))
    }
  }

  return <div className="mx-auto max-w-7xl">
    <div className="mb-5 flex flex-wrap items-end justify-between gap-4"><div><p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-[#8a957e]">Learning journal</p><h1 className="mt-1 text-2xl font-semibold tracking-tight text-[#35392f]">日记</h1><p className="mt-1 text-sm text-[#898d82]">记录每天学到的东西、卡住的问题和新的想法。</p></div><button onClick={() => chooseDate(today)} className="rounded-xl border border-[#e5e6df] bg-white px-3.5 py-2 text-xs font-medium text-[#5e6357] hover:bg-[#f8f9f5]">回到今天</button></div>
    {error && <div className="mb-4 flex items-center justify-between rounded-xl border border-[#efd5ce] bg-[#fff5f1] px-4 py-2.5 text-sm text-[#9b5748]">{error}<button onClick={() => setError("")} aria-label="关闭错误">×</button></div>}

    <div className="grid gap-4 lg:h-[calc(100vh-15rem)] lg:min-h-[520px] lg:grid-cols-[300px_minmax(0,1fr)]">
      <aside className="flex min-h-[520px] flex-col overflow-hidden rounded-2xl border border-[#e5e6df] bg-[#fbfbf8] p-4">
        <div className="flex items-center justify-between"><div><p className="text-xs font-semibold text-[#686d61]">学习日历</p><p className="mt-1 text-[11px] text-[#a0a297]">{entries.length} 天有记录</p></div><CalendarDays size={17} className="text-[#7c896f]" /></div>
        <div className="mt-4 flex items-center justify-between"><button onClick={() => moveMonth(-1)} aria-label="上个月" className="grid size-8 place-items-center rounded-lg text-[#74796d] hover:bg-white"><ChevronLeft size={16} /></button><p className="text-sm font-semibold text-[#4a4f43]">{new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "long" }).format(monthDate)}</p><button onClick={() => moveMonth(1)} aria-label="下个月" className="grid size-8 place-items-center rounded-lg text-[#74796d] hover:bg-white"><ChevronRight size={16} /></button></div>
        <div className="mt-3 grid grid-cols-7 text-center text-[10px] text-[#a0a297]">{"日一二三四五六".split("").map((day) => <span key={day} className="py-1">{day}</span>)}</div>
        <div className="grid grid-cols-7 gap-y-1">{calendarCells.map((day, index) => day ? <button key={day} onClick={() => chooseDate(day)} className={`relative mx-auto grid size-8 place-items-center rounded-lg text-xs transition ${day === selectedDate ? "bg-[#30352a] font-semibold text-white" : day === today ? "bg-[#e9eee3] font-semibold text-[#5d744e]" : "text-[#555b4e] hover:bg-white"}`}><span>{Number(day.slice(-2))}</span>{entryDates.has(day) && <span className={`absolute bottom-1 size-1 rounded-full ${day === selectedDate ? "bg-[#c5d3b6]" : "bg-[#91a27f]"}`} />}</button> : <span key={`empty-${index}`} />)}</div>
        <div className="mt-5 flex min-h-0 flex-1 flex-col border-t border-[#e9eae4] pt-3"><p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#a0a297]">本月记录</p><div className="min-h-0 flex-1 space-y-1 overflow-y-auto">{loadingEntries ? <p className="px-2 py-3 text-xs text-[#96988f]">正在加载…</p> : entries.length ? entries.map((item) => <button key={item.id} onClick={() => chooseDate(item.date)} className={`w-full rounded-lg px-2.5 py-2 text-left ${item.date === selectedDate ? "bg-[#e9ece3]" : "hover:bg-white"}`}><div className="flex justify-between gap-2"><span className="text-xs font-medium text-[#4f5549]">{displayDate(item.date, { month: "numeric", day: "numeric", weekday: "short" })}</span><span className="text-[9px] text-[#a0a297]">{displayTime(item.updatedAt)}</span></div><p className="mt-1 truncate text-[10px] text-[#898d82]">{item.excerpt || "（空日记）"}</p></button>) : <p className="px-2 py-3 text-xs text-[#96988f]">本月还没有日记，选一天开始记录。</p>}</div></div>
      </aside>

      <section className="flex min-h-[520px] min-w-0 flex-col overflow-hidden rounded-2xl border border-[#e5e6df] bg-white shadow-[0_12px_36px_-32px_rgba(47,52,40,.35)]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#eeefe9] px-5 py-4"><div><p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-[#9aa08f]">{selectedDate === today ? "今天" : "学习记录"}</p><h2 className="mt-1 text-base font-semibold text-[#35392f]">{displayDate(selectedDate)}</h2></div><div className="flex items-center gap-2"><div className="flex rounded-lg bg-[#f3f4ef] p-0.5"><button onClick={() => setView("edit")} className={`flex items-center gap-1 rounded-md px-2.5 py-1.5 text-[10px] ${view === "edit" ? "bg-white text-[#4d5547] shadow-sm" : "text-[#96988e]"}`}><PencilLine size={12} />编辑</button><button onClick={() => setView("preview")} className={`flex items-center gap-1 rounded-md px-2.5 py-1.5 text-[10px] ${view === "preview" ? "bg-white text-[#4d5547] shadow-sm" : "text-[#96988e]"}`}><Eye size={12} />预览</button></div>{entry.id > 0 && <button onClick={() => void remove()} title="删除这篇日记" aria-label="删除日记" className="grid size-8 place-items-center rounded-lg text-[#a36a5c] hover:bg-[#fff2ef]"><Trash2 size={14} /></button>}<button disabled={!dirty || saving || loadingEntry} onClick={() => void save()} className="flex items-center gap-1.5 rounded-lg bg-[#30352a] px-3 py-2 text-xs font-medium text-white hover:bg-[#41473a] disabled:bg-[#eef0e9] disabled:text-[#8d9185]">{saving ? <LoaderCircle size={13} className="animate-spin" /> : <Save size={13} />}{saving ? "保存中…" : dirty ? "保存日记" : "已保存"}</button></div></div>
        {loadingEntry ? <div className="flex flex-1 items-center justify-center gap-2 text-sm text-[#8e9287]"><LoaderCircle size={16} className="animate-spin" />正在加载日记…</div> : view === "edit" ? <textarea value={content} onChange={(event) => setContent(event.target.value)} placeholder="今天学到了什么？有什么问题还没弄明白？记录下来，之后可以回顾。\n\n支持 Markdown。" className="min-h-0 flex-1 resize-none px-7 py-6 font-mono text-[13px] leading-[1.9] text-[#45493f] outline-none placeholder:font-sans placeholder:text-[#b2b4aa]" /> : <article className="markdown-preview min-h-0 flex-1 overflow-y-auto px-7 py-6 text-sm leading-7 text-[#45493f]"><ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml>{content || "*这一天还没有记录。切换到编辑开始写日记。*"}</ReactMarkdown></article>}
        <div className="flex items-center justify-between border-t border-[#f0f0eb] px-5 py-2.5 text-[10px] text-[#a5a79d]"><span>{content.length.toLocaleString()} 字符</span><span>{dirty ? "有未保存的修改" : displayTime(entry.updatedAt) ? `上次保存 ${displayTime(entry.updatedAt)}` : "日记保存在本机"}</span></div>
      </section>
    </div>
  </div>
}
