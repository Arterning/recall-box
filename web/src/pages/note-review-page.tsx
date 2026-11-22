import { useCallback, useEffect, useMemo, useState } from "react"
import { ArrowLeft, Brain, Check, Eye, LoaderCircle } from "lucide-react"
import { Link, useSearchParams } from "react-router"
import { MarkdownNote } from "@/components/markdown-note"
import { api, toErrorMessage, type Annotation, type Note } from "@/lib/api"

const ratings = [
  { value: 1, label: "忘记了", className: "border-[#efd5ce] bg-[#fff5f1] text-[#a66550] hover:bg-[#fcebe5]" },
  { value: 2, label: "困难", className: "border-[#eadfc5] bg-[#f8f3e7] text-[#8d7950] hover:bg-[#f1ead8]" },
  { value: 3, label: "记得", className: "border-[#d7e2ce] bg-[#e9eee3] text-[#5d744e] hover:bg-[#dfe7d6]" },
  { value: 4, label: "轻松", className: "border-[#d4e3dc] bg-[#e7f0eb] text-[#55786b] hover:bg-[#dceae3]" },
] as const

export function NoteReviewPage() {
  const [searchParams] = useSearchParams()
  const noteId = searchParams.get("noteId")
  const [notes, setNotes] = useState<Note[]>([])
  const [index, setIndex] = useState(0)
  const [annotations, setAnnotations] = useState<Annotation[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [finished, setFinished] = useState(false)
  const [completed, setCompleted] = useState(0)

  const loadQueue = useCallback(async () => {
    const query = noteId ? `?noteId=${encodeURIComponent(noteId)}` : ""
    const result = await api<Note[]>(`/api/note-reviews/due${query}`)
    setNotes(result)
    setIndex(0)
    setFinished(false)
    setCompleted(0)
    return result
  }, [noteId])

  useEffect(() => {
    setLoading(true)
    setError("")
    loadQueue().catch((cause: unknown) => setError(toErrorMessage(cause, "加载笔记复习队列失败"))).finally(() => setLoading(false))
  }, [loadQueue])

  const current = notes[index]

  useEffect(() => {
    if (!current) {
      setAnnotations([])
      return
    }
    api<Annotation[]>(`/api/notes/${current.id}/annotations`).then(setAnnotations).catch(() => setAnnotations([]))
  }, [current?.id])

  const saveReview = async (rating?: number) => {
    if (!current || busy) return
    setBusy(true)
    setError("")
    try {
      await api(`/api/notes/${current.id}/review`, {
        method: "POST",
        body: JSON.stringify(rating === undefined ? {} : { rating }),
      })
      setCompleted((count) => count + 1)
      if (index + 1 >= notes.length) setFinished(true)
      else setIndex((value) => value + 1)
    } catch (cause) {
      setError(toErrorMessage(cause, "记录笔记复习失败"))
    } finally {
      setBusy(false)
    }
  }

  const visibleAnnotations = useMemo(() => annotations.filter((item) => item.anchorValid), [annotations])

  return <div className="mx-auto max-w-5xl">
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3"><div><p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-[#8a957e]">Note review</p><h1 className="mt-1 text-2xl font-semibold tracking-tight text-[#35392f]">笔记复习</h1><p className="mt-1 text-sm text-[#898d82]">阅读笔记后自评记忆情况；不评分也可以继续。</p></div><Link to={current ? `/notes?noteId=${current.id}` : "/notes"} className="flex items-center gap-1.5 rounded-xl border border-[#e5e6df] bg-white px-3.5 py-2.5 text-xs text-[#666c5d] hover:bg-[#f8f9f5]"><ArrowLeft size={14} />返回笔记</Link></div>
    {error && <div className="mb-4 rounded-xl border border-[#efd5ce] bg-[#fff5f1] px-4 py-2.5 text-sm text-[#9b5748]">{error}</div>}

    {loading ? <div className="flex min-h-80 items-center justify-center gap-2 text-sm text-[#8e9287]"><LoaderCircle size={17} className="animate-spin" />正在加载笔记复习…</div> : finished ? <section className="rounded-2xl border border-[#e5e6df] bg-white px-6 py-16 text-center"><div className="mx-auto grid size-12 place-items-center rounded-2xl bg-[#e9eee3] text-[#687b58]"><Check size={22} /></div><h2 className="mt-4 text-lg font-semibold text-[#35392f]">本轮笔记复习完成</h2><p className="mt-2 text-sm text-[#898d82]">已处理 {completed} 篇笔记；不评分的查看不会改变复习计划。</p><div className="mt-6 flex justify-center gap-2"><Link to={current ? `/notes?noteId=${current.id}` : "/notes"} className="rounded-xl border border-[#e5e6df] px-4 py-2.5 text-sm text-[#666c5d] hover:bg-[#f8f9f5]">返回笔记</Link><button onClick={() => { setLoading(true); loadQueue().catch((cause: unknown) => setError(toErrorMessage(cause, "加载笔记复习队列失败"))).finally(() => setLoading(false)) }} className="rounded-xl bg-[#30352a] px-4 py-2.5 text-sm text-white hover:bg-[#41473a]">刷新到期笔记</button></div></section> : !current ? <section className="rounded-2xl border border-[#e5e6df] bg-white px-6 py-16 text-center"><div className="mx-auto grid size-12 place-items-center rounded-2xl bg-[#f0f2ec] text-[#829078]"><Brain size={21} /></div><h2 className="mt-4 text-lg font-semibold text-[#35392f]">目前没有到期的笔记</h2><p className="mt-2 text-sm text-[#898d82]">在笔记页面选择“加入复习”，笔记会从今天开始进入 FSRS 计划。</p><Link to="/notes" className="mt-6 inline-flex rounded-xl bg-[#30352a] px-4 py-2.5 text-sm text-white hover:bg-[#41473a]">返回笔记</Link></section> : <section className="overflow-hidden rounded-[22px] border border-[#e4e6dd] bg-white shadow-[0_26px_80px_-55px_rgba(45,51,38,.42)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#eeefe9] px-5 py-4"><div className="flex min-w-0 items-center gap-2 text-[11px] font-medium uppercase tracking-[0.13em] text-[#86927b]"><Brain size={15} /><span className="truncate normal-case tracking-normal text-[#555b4e]">{current.title || "未命名笔记"}</span></div><span className="shrink-0 text-[11px] text-[#82867b]">第 {index + 1} / {notes.length} 篇</span></div>
      <div className="max-h-[calc(100vh-23rem)] min-h-[300px] overflow-y-auto px-6 py-7 sm:px-10 sm:py-9"><MarkdownNote content={current.content} cards={[]} annotations={visibleAnnotations} onSelect={() => undefined} hideAnnotations /></div>
      <div className="border-t border-[#eeefe9] bg-[#fcfcfa] px-5 py-4 sm:px-8"><div className="mb-3 flex items-center justify-between gap-3"><p className="text-xs font-medium text-[#777c70]">读完后，评估刚才回忆起内容的难易程度</p><button disabled={busy} onClick={() => void saveReview()} className="flex shrink-0 items-center gap-1.5 rounded-lg border border-[#e5e6df] bg-white px-3 py-2 text-[11px] text-[#686d61] hover:bg-[#f7f8f4] disabled:opacity-50"><Eye size={13} />只阅读，不评分</button></div><div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{ratings.map((rating) => <button key={rating.value} disabled={busy} onClick={() => void saveReview(rating.value)} className={`rounded-xl border px-3 py-3 text-sm font-medium transition disabled:opacity-50 ${rating.className}`}>{busy ? <LoaderCircle size={16} className="mx-auto animate-spin" /> : rating.label}</button>)}</div></div>
    </section>}
  </div>
}
