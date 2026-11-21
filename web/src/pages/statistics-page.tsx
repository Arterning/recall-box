import { useEffect, useState } from "react"
import type { ReactNode } from "react"
import { Activity, BarChart3, Clock3, LoaderCircle, Sparkles } from "lucide-react"
import { Link } from "react-router"
import { api, toErrorMessage } from "@/lib/api"

type Overview = {
  summary: { notes: number; cards: number; due: number; totalReviews: number; reviewedToday: number; reviewsLast30Days: number; averageRating: number }
  days: { date: string; count: number; good: number }[]
  noteDays: { date: string; count: number }[]
  noteYear: number
  noteYears: number[]
  ratings: Record<string, number>
  recent: { id: number; cardId: number; rating: number; response: string; reviewedAt: string; question: string; excerpt: string; noteTitle: string }[]
}

const ratingLabels: Record<string, string> = { "1": "忘了", "2": "困难", "3": "记得", "4": "简单" }
const ratingStyles: Record<string, string> = { "1": "bg-[#d58d78]", "2": "bg-[#d0b978]", "3": "bg-[#91a57f]", "4": "bg-[#6f9b88]" }

function buildNoteHeatmap(noteDays: { date: string; count: number }[]) {
  const counts = new Map(noteDays.map((day) => [day.date.slice(0, 10), day.count]))
  const firstDate = noteDays[0]?.date.slice(0, 10)
  if (!firstDate) return []
  const first = new Date(`${firstDate}T12:00:00`)
  if (Number.isNaN(first.getTime())) return []
  first.setDate(first.getDate() - first.getDay())
  return Array.from({ length: 53 }, (_, week) => Array.from({ length: 7 }, (_, weekday) => {
    const date = new Date(first)
    date.setDate(first.getDate() + week * 7 + weekday)
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
    return { date: key, count: counts.get(key) || 0 }
  }))
}

export function StatisticsPage() {
  const [data, setData] = useState<Overview | null>(null)
  const [selectedYear, setSelectedYear] = useState(() => new Date().getFullYear())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    setLoading(true)
    setError("")
    api<Overview>(`/api/reviews/overview?year=${selectedYear}`)
      .then(setData)
      .catch((cause: unknown) => setError(toErrorMessage(cause, "加载统计失败")))
      .finally(() => setLoading(false))
  }, [selectedYear])

  if (loading) return <div className="flex min-h-80 items-center justify-center gap-2 text-sm text-[#8e9287]"><LoaderCircle size={17} className="animate-spin" />正在整理统计…</div>
  if (error || !data) return <div className="rounded-xl border border-[#efd5ce] bg-[#fff5f1] px-4 py-3 text-sm text-[#9b5748]">{error || "暂无统计数据"}</div>

  const summary = data.summary
  const maxReviews = Math.max(1, ...data.days.map((day) => day.count))
  const totalRatings = Object.values(data.ratings).reduce((total, count) => total + count, 0)
  const noteDays = data.noteDays
  const noteHeatmap = buildNoteHeatmap(noteDays)
  const maxNotesInDay = Math.max(1, ...noteDays.map((day) => day.count))
  const firstNoteDate = noteDays[0]?.date.slice(0, 10) || ""
  const lastNoteDate = noteDays[noteDays.length - 1]?.date.slice(0, 10) || ""
  const monthWeekLabels = Array.from({ length: 12 }, (_, month) => {
    const firstDayOfYear = new Date(selectedYear, 0, 1).getDay()
    const dayOfYear = Math.floor((Date.UTC(selectedYear, month, 1) - Date.UTC(selectedYear, 0, 1)) / 86400000)
    return { week: Math.floor((firstDayOfYear + dayOfYear) / 7), label: `${month + 1}月` }
  })
  const monthLabelByWeek = new Map(monthWeekLabels.map(({ week, label }) => [week, label]))

  return <div className="mx-auto max-w-5xl">
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3"><div><p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-[#8a957e]">Insights</p><h1 className="mt-1 text-2xl font-semibold tracking-tight text-[#35392f]">统计</h1><p className="mt-1 text-sm text-[#898d82]">观察复习节奏、记忆难度和最近的回答。</p></div><Link to="/review/history" className="rounded-xl border border-[#e5e6df] bg-white px-3.5 py-2.5 text-xs text-[#666c5d] hover:bg-[#f8f9f5]">查看全部提交历史</Link></div>

    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Metric icon={<Sparkles size={16} />} label="今日复习" value={summary.reviewedToday} hint={`${summary.due} 张卡片待复习`} />
      <Metric icon={<Activity size={16} />} label="近 30 天" value={summary.reviewsLast30Days} hint="次复习提交" />
      <Metric icon={<BarChart3 size={16} />} label="累计复习" value={summary.totalReviews} hint={`${summary.cards} 张卡片 · ${summary.notes} 篇笔记`} />
      <Metric icon={<Clock3 size={16} />} label="平均自评" value={summary.totalReviews ? `${summary.averageRating.toFixed(1)} / 4` : "—"} hint="1 忘了 · 4 简单" />
    </div>

    <section className="mt-4 rounded-2xl border border-[#e5e6df] bg-white p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-sm font-semibold text-[#45493f]">笔记创建记录</h2><p className="mt-1 text-[11px] text-[#999c91]">${selectedYear} 年每天新建的笔记数量</p></div><label className="flex items-center gap-2 text-xs text-[#777c70]"><span>年份</span><select value={selectedYear} onChange={(event) => setSelectedYear(Number(event.target.value))} className="rounded-lg border border-[#e5e6df] bg-white px-2.5 py-1.5 text-xs text-[#4f5549] outline-none focus:border-[#9baa8b]">{(data.noteYears?.length ? data.noteYears : [new Date().getFullYear()]).map((year) => <option key={year} value={year}>{year}</option>)}</select></label></div><div className="mt-4 overflow-x-auto pb-2"><div className="min-w-[760px]"><div className="mb-2 flex gap-1 text-[9px] text-[#a0a297]"><span className="w-[12px] shrink-0" />{noteHeatmap.map((_, weekIndex) => <span key={weekIndex} className="w-[11px] shrink-0">{monthLabelByWeek.get(weekIndex) || ""}</span>)}</div><div className="flex gap-1"><div className="grid shrink-0 grid-rows-7 gap-1 pr-1 text-[8px] leading-3 text-[#a0a297]"><span>日</span><span>一</span><span>二</span><span>三</span><span>四</span><span>五</span><span>六</span></div><div className="flex gap-1">{noteHeatmap.map((week, weekIndex) => <div key={weekIndex} className="grid grid-rows-7 gap-1">{week.map((day) => { const inRange = day.date >= firstNoteDate && day.date <= lastNoteDate; const level = !day.count ? 0 : day.count >= maxNotesInDay ? 4 : Math.ceil(day.count / maxNotesInDay * 4); const colors = ["bg-[#f0f1ec]", "bg-[#dce5d3]", "bg-[#c0d2b1]", "bg-[#9fb88a]", "bg-[#718b5c]"]; return <span key={day.date} title={inRange ? `${day.date}：${day.count} 篇笔记` : undefined} aria-label={inRange ? `${day.date}：${day.count} 篇笔记` : undefined} className={`size-[11px] rounded-[3px] ${inRange ? colors[level] : "bg-transparent"}`} /> })}</div>)}</div></div><div className="mt-3 flex items-center justify-end gap-1.5 text-[9px] text-[#999c91]"><span>少</span><span className="size-[11px] rounded-[3px] bg-[#f0f1ec]" /><span className="size-[11px] rounded-[3px] bg-[#dce5d3]" /><span className="size-[11px] rounded-[3px] bg-[#c0d2b1]" /><span className="size-[11px] rounded-[3px] bg-[#9fb88a]" /><span className="size-[11px] rounded-[3px] bg-[#718b5c]" /><span>多</span></div></div></div></section>

    <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.7fr)_minmax(260px,1fr)]">
      <section className="rounded-2xl border border-[#e5e6df] bg-white p-5"><div className="flex items-start justify-between"><div><h2 className="text-sm font-semibold text-[#45493f]">每日复习量</h2><p className="mt-1 text-[11px] text-[#999c91]">最近 30 天 · 柱状表示提交次数，深色部分为记得或简单</p></div><span className="rounded-lg bg-[#f1f3ed] p-2 text-[#7b896f]"><BarChart3 size={16} /></span></div><div className="mt-6 flex h-40 items-end gap-[3px] sm:gap-1.5">{data.days.map((day, index) => { const height = day.count ? Math.max(8, day.count / maxReviews * 100) : 2; const goodHeight = day.count ? day.good / day.count * height : 0; return <div key={day.date} className="group relative flex h-full min-w-0 flex-1 items-end"><div title={`${day.date}：${day.count} 次`} className="relative w-full overflow-hidden rounded-t-[4px] bg-[#e6eadf] transition-colors group-hover:bg-[#dce3d3]" style={{ height: `${height}%`, minHeight: day.count ? 8 : 2 }}><div className="absolute inset-x-0 bottom-0 rounded-t-[4px] bg-[#8fa17d]" style={{ height: `${day.count ? goodHeight / height * 100 : 0}%` }} /></div>{index % 7 === 0 && <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 whitespace-nowrap text-[9px] text-[#a0a297]">{day.date.slice(5)}</span>}</div> })}</div><div className="mt-8 flex items-center justify-between text-[10px] text-[#9b9e93]"><span>无复习记录的日期也会显示</span><span>{data.days.reduce((n, day) => n + day.count, 0)} 次提交</span></div></section>

      <section className="rounded-2xl border border-[#e5e6df] bg-white p-5"><div className="flex items-start justify-between"><div><h2 className="text-sm font-semibold text-[#45493f]">记忆自评</h2><p className="mt-1 text-[11px] text-[#999c91]">每次复习后的 FSRS 评分</p></div><span className="rounded-lg bg-[#f1f3ed] p-2 text-[#7b896f]"><Activity size={16} /></span></div>{totalRatings ? <div className="mt-6 space-y-4">{Object.entries(ratingLabels).map(([rating, label]) => { const count = data.ratings[rating] || 0; const percent = count / totalRatings * 100; return <div key={rating}><div className="mb-1.5 flex items-center justify-between text-xs"><span className="text-[#686d61]">{label}</span><span className="text-[#96998f]">{count} 次 · {Math.round(percent)}%</span></div><div className="h-2 overflow-hidden rounded-full bg-[#f0f1ec]"><div className={`h-full rounded-full ${ratingStyles[rating]}`} style={{ width: `${percent}%` }} /></div></div> })}</div> : <div className="mt-8 rounded-xl bg-[#fbfbf8] px-4 py-8 text-center text-xs text-[#999c91]">完成复习并评分后，这里会显示记忆自评分布。</div>}<p className="mt-5 text-[10px] leading-4 text-[#a1a398]">评分反映你对答案的回忆难度，不是对答案质量的自动判定。</p></section>
    </div>

    <section className="mt-4 rounded-2xl border border-[#e5e6df] bg-white p-5"><div className="mb-4 flex items-end justify-between gap-3"><div><h2 className="text-sm font-semibold text-[#45493f]">最近提交的回答</h2><p className="mt-1 text-[11px] text-[#999c91]">看看当时是怎么回忆的</p></div>{data.recent.length > 0 && <span className="text-[10px] text-[#a1a398]">最近 {data.recent.length} 条</span>}</div>{data.recent.length ? <div className="space-y-3">{data.recent.map((item) => <article key={item.id} className="rounded-xl border border-[#eeefe9] bg-[#fcfcfa] p-4"><div className="flex flex-wrap items-center justify-between gap-2"><p className="truncate text-[10px] text-[#92968b]">{item.noteTitle || "笔记已删除"} · {new Date(item.reviewedAt).toLocaleString("zh-CN", { dateStyle: "medium", timeStyle: "short" })}</p><span className="rounded-full bg-white px-2.5 py-1 text-[10px] text-[#6d765f]">{ratingLabels[String(item.rating)] || "已评分"}</span></div><p className="mt-2 text-xs font-medium leading-5 text-[#4b4f45]">{item.question || item.excerpt || "卡片问题已不可用"}</p><div className="mt-2 rounded-lg bg-white px-3 py-2.5"><p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-[#9b9f94]">我的回答</p><p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-[#62665c]">{item.response || "（未填写回答）"}</p></div></article>)}</div> : <div className="rounded-xl border border-dashed border-[#dfe2d8] px-4 py-10 text-center text-xs text-[#999c91]">还没有复习提交。<Link to="/review" className="ml-1 text-[#687b58] hover:underline">开始第一次复习</Link></div>}</section>
  </div>
}

function Metric({ icon, label, value, hint }: { icon: ReactNode; label: string; value: number | string; hint: string }) {
  return <div className="rounded-2xl border border-[#e5e6df] bg-white p-4"><div className="flex items-center gap-2 text-[11px] text-[#85897d]"><span className="text-[#849276]">{icon}</span>{label}</div><p className="mt-3 text-2xl font-semibold tracking-tight text-[#35392f]">{value}</p><p className="mt-1 text-[10px] text-[#a0a297]">{hint}</p></div>
}
