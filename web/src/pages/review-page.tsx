import { useCallback, useEffect, useState } from "react"
import { ArrowLeft, Check, ChevronLeft, ChevronRight, Clock3, History, LoaderCircle, Sparkles } from "lucide-react"
import { Link } from "react-router"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { api, toErrorMessage, type Card, type Stats } from "@/lib/api"

const ratings = [
  { rating: 1, label: "忘了", name: "Again", className: "bg-[#f6e8e2] text-[#a66550] hover:bg-[#f1ddd4]" },
  { rating: 2, label: "困难", name: "Hard", className: "bg-[#f3eee0] text-[#8d7950] hover:bg-[#eee7d4]" },
  { rating: 3, label: "记得", name: "Good", className: "bg-[#e9eee3] text-[#647555] hover:bg-[#dfe7d6]" },
  { rating: 4, label: "简单", name: "Easy", className: "bg-[#e2ece8] text-[#55786b] hover:bg-[#d7e6e0]" },
] as const

export function ReviewPage() {
  const [dueCards, setDueCards] = useState<Card[]>([])
  const [index, setIndex] = useState(0)
  const [stats, setStats] = useState<Stats>({ notes: 0, cards: 0, due: 0, reviewedToday: 0 })
  const [response, setResponse] = useState("")
  const [showReference, setShowReference] = useState(false)
  const [forgotRecorded, setForgotRecorded] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  const refresh = useCallback(async () => {
    const [cards, summary] = await Promise.all([
      api<Card[]>("/api/cards/due"),
      api<Stats>("/api/reviews/stats"),
    ])
    setDueCards(cards)
    setStats(summary)
    return cards
  }, [])

  useEffect(() => {
    refresh().catch((cause: unknown) => setError(toErrorMessage(cause, "加载复习卡片失败"))).finally(() => setLoading(false))
  }, [refresh])

  const current = dueCards[index]

  const selectCard = (next: number) => {
    setIndex(next)
    setResponse("")
    setShowReference(false)
    setForgotRecorded(false)
  }

  const rate = async (rating: number) => {
    if (!current) return
    setBusy(true)
    setError("")
    try {
      await api(`/api/cards/${current.id}/review`, { method: "POST", body: JSON.stringify({ rating, response }) })
      setResponse("")
      setShowReference(false)
      const remaining = await refresh()
      setIndex((currentIndex) => Math.min(currentIndex, Math.max(0, remaining.length - 1)))
    } catch (cause) {
      setError(toErrorMessage(cause, "提交评分失败"))
    } finally {
      setBusy(false)
    }
  }

  const forgot = async () => {
    if (!current || busy || forgotRecorded) return
    setBusy(true)
    setError("")
    try {
      const result = await api<{ dueAt: string }>(`/api/cards/${current.id}/review`, {
        method: "POST",
        body: JSON.stringify({ rating: 2, response: "" }),
      })
      setDueCards((cards) => cards.map((card) => card.id === current.id ? { ...card, dueAt: result.dueAt } : card))
      setShowReference(true)
      setForgotRecorded(true)
      const summary = await api<Stats>("/api/reviews/stats")
      setStats(summary)
    } catch (cause) {
      setError(toErrorMessage(cause, "提交复习失败"))
    } finally {
      setBusy(false)
    }
  }

  const continueAfterForgot = async () => {
    setLoading(true)
    try {
      const remaining = await refresh()
      setIndex((currentIndex) => Math.min(currentIndex, Math.max(0, remaining.length - 1)))
      setResponse("")
      setShowReference(false)
      setForgotRecorded(false)
    } catch (cause) {
      setError(toErrorMessage(cause, "加载复习队列失败"))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3"><div><p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-[#8a957e]">Daily review</p><h1 className="mt-1 text-2xl font-semibold tracking-tight text-[#35392f]">今日复习</h1><p className="mt-1 text-sm text-[#898d82]">先回答问题，再对照参考答案和上下文。</p></div><div className="flex items-center gap-2"><Link to="/review/history" className="flex items-center gap-1.5 rounded-xl border border-[#e5e6df] bg-white px-3 py-2.5 text-xs text-[#666c5d] hover:bg-[#f8f9f5]"><History size={14} />提交历史</Link><Stat label="待复习" value={stats.due} /><Stat label="今日完成" value={stats.reviewedToday} /></div></div>
      {error && <div className="mb-4 rounded-xl border border-[#efd5ce] bg-[#fff5f1] px-4 py-2.5 text-sm text-[#9b5748]">{error}</div>}
      <section className="overflow-hidden rounded-[22px] border border-[#e4e6dd] bg-white shadow-[0_26px_80px_-55px_rgba(45,51,38,.42)]">
        <div className="flex items-center justify-between border-b border-[#eeefe9] px-5 py-4"><Link to="/notes" className="flex items-center gap-1.5 text-xs text-[#83877b] hover:text-[#44483e]"><ArrowLeft size={15} />返回笔记</Link>{current ? <div className="flex items-center gap-2"><span className="mr-1 text-[11px] text-[#82867b]">卡片 {index + 1} / {dueCards.length}</span><button disabled={index === 0} onClick={() => selectCard(index - 1)} aria-label="上一张卡片" className="grid size-8 place-items-center rounded-lg border border-[#e5e6df] text-[#777b70] hover:bg-[#f4f5f0] disabled:opacity-35"><ChevronLeft size={15} /></button><button disabled={index >= dueCards.length - 1} onClick={() => selectCard(index + 1)} aria-label="下一张卡片" className="grid size-8 place-items-center rounded-lg border border-[#e5e6df] text-[#777b70] hover:bg-[#f4f5f0] disabled:opacity-35"><ChevronRight size={15} /></button></div> : <span className="text-[11px] text-[#a1a398]">队列已清空</span>}</div>
        {loading ? <div className="flex min-h-80 items-center justify-center gap-2 text-sm text-[#8e9287]"><LoaderCircle size={17} className="animate-spin" />正在加载复习队列…</div> : current ? <div className="px-6 py-7 sm:px-10 sm:py-9">
          <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.13em] text-[#86927b]"><Sparkles size={14} /> Active recall <span className="ml-auto max-w-[55%] truncate tracking-normal text-[#aaaca2]">{current.noteTitle || "独立卡片"}</span></div>
          <div className="mt-8"><p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[#a7aa9f]">请回答</p><h2 className="mt-3 whitespace-pre-wrap text-xl font-medium leading-[1.65] tracking-[-0.02em] text-[#35392f]">{current.question || current.answer || current.excerpt}</h2><div className="mt-5 rounded-xl border border-[#eee9da] bg-[#fcfaf3] p-4"><p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-[#9c9273]">上下文</p><CardText value={current.excerpt} markdown={current.noteFormat === "markdown"} /></div><label className="mt-5 block text-[10px] font-semibold uppercase tracking-[0.13em] text-[#a7aa9f]">你的回答<textarea value={response} onChange={(event) => setResponse(event.target.value)} placeholder="根据问题和上下文回忆答案…" rows={4} className="mt-2 w-full resize-y rounded-xl border border-[#e7e9e1] bg-[#fcfcfa] px-4 py-3 text-sm font-normal leading-6 normal-case tracking-normal text-[#45493f] outline-none placeholder:text-[#b4b6ad] focus:border-[#bdc9b3]" /></label></div>
          {!showReference ? <div className="mt-4 space-y-2"><button disabled={!response.trim()} onClick={() => setShowReference(true)} className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#30352a] py-3.5 text-sm font-medium text-white hover:bg-[#41473a] disabled:cursor-not-allowed disabled:opacity-45">查看参考答案<ChevronRight size={16} /></button><button disabled={busy} onClick={() => void forgot()} className="w-full rounded-xl border border-[#e5e6df] py-3 text-sm font-medium text-[#777b70] hover:bg-[#f8f9f5] disabled:opacity-50">{busy ? "正在保存…" : "我不记得了，直接查看答案"}</button></div> : <div className="mt-5 space-y-3"><div className="rounded-xl border border-[#e7eadf] bg-[#f8f9f5] p-4"><p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-[#8c967f]">参考答案</p><CardText value={current.answer || current.excerpt} markdown={current.noteFormat === "markdown"} /></div>{forgotRecorded ? <div className="space-y-3"><p className="rounded-xl bg-[#f3eee0] px-4 py-3 text-center text-sm text-[#8d7950]">已按“困难”记录，回答留空，下次复习时间已安排。</p><button onClick={() => void continueAfterForgot()} className="w-full rounded-xl bg-[#30352a] py-3 text-sm font-medium text-white hover:bg-[#41473a]">看完了，继续下一张</button></div> : <div><p className="mb-2.5 text-center text-[10px] text-[#a1a398]">对照后，你觉得自己记得怎么样？</p><div className="grid grid-cols-4 gap-2">{ratings.map((item) => <button key={item.rating} disabled={busy} onClick={() => void rate(item.rating)} className={`rounded-xl py-3 transition disabled:opacity-50 ${item.className}`}>{busy ? <LoaderCircle className="mx-auto animate-spin" size={15} /> : <><span className="block text-xs font-semibold">{item.label}</span><span className="mt-0.5 block text-[9px] opacity-70">{item.name}</span></>}</button>)}</div></div>}</div>}
          <div className="mt-7 flex items-center justify-between border-t border-[#f0f0eb] pt-4 text-[10px] text-[#a4a69b]"><span className="flex items-center gap-1.5"><Clock3 size={12} /> FSRS 按评分安排下一次复习</span><span>回答保存在本机，可在提交历史查看</span></div>
        </div> : <div className="px-7 py-16 text-center sm:px-10"><div className="mx-auto grid size-14 place-items-center rounded-2xl bg-[#e9eee3] text-[#718264]"><Check size={24} /></div><h2 className="mt-5 text-xl font-semibold tracking-tight">今天的复习完成了</h2><p className="mt-2 text-sm text-[#8b8f83]">新卡片和之后到期的卡片会出现在这里。</p><Link to="/notes" className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[#30352a] px-4 py-2.5 text-sm text-white hover:bg-[#41473a]">回到笔记</Link></div>}
      </section>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return <div className="min-w-20 rounded-xl border border-[#e5e6df] bg-[#fbfbf8] px-3 py-2"><p className="text-[10px] text-[#999c91]">{label}</p><p className="mt-0.5 text-base font-semibold text-[#62685a]">{value}</p></div>
}

function CardText({ value, markdown }: { value: string; markdown: boolean }) {
  return markdown ? <div className="markdown-preview mt-2 text-sm leading-6 text-[#45493f]"><ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml>{value}</ReactMarkdown></div> : <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[#45493f]">{value}</p>
}
