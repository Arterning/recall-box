import { useCallback, useEffect, useState } from "react"
import type { FormEvent } from "react"
import { BookOpenText, Check, CircleHelp, Clock3, Copy, Layers3, LoaderCircle, MessageSquareText, Pencil, Plus, Search, Trash2, X, ChevronLeft, ChevronRight } from "lucide-react"
import { Link } from "react-router"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { MarkdownNote, type PreviewSelection } from "@/components/markdown-note"
import { api, toErrorMessage, type Annotation, type Card, type CardListResult } from "@/lib/api"

type CardSelection = PreviewSelection & { field: "question" | "answer" | "context" }

function dueLabel(value: string | null) {
  if (!value) return "尚未安排"
  const due = new Date(value)
  if (due.getTime() <= Date.now()) return "待复习"
  return `下次复习：${due.toLocaleString("zh-CN", { dateStyle: "medium", timeStyle: "short" })}`
}

export function CardsPage() {
  const [cards, setCards] = useState<Card[]>([])
  const [totalCards, setTotalCards] = useState(0)
  const [dueCount, setDueCount] = useState(0)
  const [page, setPage] = useState(1)
  const pageSize = 30
  const [search, setSearch] = useState("")
  const [sort, setSort] = useState<"due" | "created_desc">("due")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [deleting, setDeleting] = useState<number | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [editingCard, setEditingCard] = useState<Card | null>(null)
  const [inlineEditing, setInlineEditing] = useState(false)
  const [creating, setCreating] = useState(false)
  const [draft, setDraft] = useState({ question: "", answer: "", context: "" })
  const [selectedCard, setSelectedCard] = useState<Card | null>(null)
  const [viewCard, setViewCard] = useState<Card | null>(null)
  const [cardAnnotations, setCardAnnotations] = useState<Annotation[]>([])
  const [selection, setSelection] = useState<CardSelection | null>(null)
  const [annotationDraft, setAnnotationDraft] = useState<string | null>(null)
  const [annotationBusy, setAnnotationBusy] = useState(false)
  const [copiedSelection, setCopiedSelection] = useState(false)
  const [annotationPopover, setAnnotationPopover] = useState<{ annotation: Annotation; x: number; y: number } | null>(null)
  const [editingAnnotation, setEditingAnnotation] = useState(false)
  const [annotationCommentDraft, setAnnotationCommentDraft] = useState("")
  const [response, setResponse] = useState("")
  const [showAnswer, setShowAnswer] = useState(false)
  const [reviewing, setReviewing] = useState(false)
  const [reviewed, setReviewed] = useState(false)
  const [reviewRating, setReviewRating] = useState<number | null>(null)

  const load = useCallback(async (query: string, currentPage: number) => {
    setLoading(true)
    setError("")
    try {
      const params = new URLSearchParams()
      if (query.trim()) params.set("q", query.trim())
      params.set("page", String(currentPage))
      params.set("pageSize", String(pageSize))
      params.set("sort", sort)
      const result = await api<CardListResult>(`/api/cards?${params}`)
      setCards(result.items)
      setTotalCards(result.total)
      setDueCount(result.dueCount)
    } catch (cause) {
      setError(toErrorMessage(cause, "加载卡片失败"))
    } finally {
      setLoading(false)
    }
  }, [sort])

  useEffect(() => {
    const timer = window.setTimeout(() => void load(search, page), 180)
    return () => window.clearTimeout(timer)
  }, [load, search, page])

  useEffect(() => { setPage(1) }, [search])

  const openCard = async (card: Card) => {
    setViewCard(card)
    setSelectedCard(null)
    setInlineEditing(false)
    setSelection(null)
    setAnnotationDraft(null)
    setAnnotationPopover(null)
    setEditingAnnotation(false)
    try {
      setCardAnnotations(await api<Annotation[]>(`/api/cards/${card.id}/annotations`))
    } catch (cause) {
      setCardAnnotations([])
      setError(toErrorMessage(cause, "加载批注失败"))
    }
  }

  const remove = async (card: Card) => {
    if (!window.confirm("确定删除这张复习卡片吗？")) return
    setDeleting(card.id)
    try {
      await api(`/api/cards/${card.id}`, { method: "DELETE" })
      setCards((current) => current.filter((item) => item.id !== card.id))
      setViewCard((current) => current?.id === card.id ? null : current)
      setSelectedCard((current) => current?.id === card.id ? null : current)
      setCardAnnotations((current) => current.filter((annotation) => annotation.cardId !== card.id))
      setTotalCards((total) => Math.max(0, total - 1))
      if (!card.dueAt || new Date(card.dueAt).getTime() <= Date.now()) setDueCount((count) => Math.max(0, count - 1))
    } catch (cause) {
      setError(toErrorMessage(cause, "删除卡片失败"))
    } finally {
      setDeleting(null)
    }
  }

  const createCard = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault()
    setCreating(true)
    setError("")
    try {
      if (editingCard) {
        const card = await api<Card>(`/api/cards/${editingCard.id}`, { method: "PUT", body: JSON.stringify(draft) })
        setCards((current) => current.map((item) => item.id === card.id ? card : item))
        setViewCard(card)
        setCardAnnotations(await api<Annotation[]>(`/api/cards/${card.id}/annotations`))
        setInlineEditing(false)
        setEditingCard(null)
      } else {
        const card = await api<Card>("/api/cards", { method: "POST", body: JSON.stringify(draft) })
        setCards((current) => [card, ...current])
        setTotalCards((total) => total + 1)
        if (!card.dueAt || new Date(card.dueAt).getTime() <= Date.now()) setDueCount((count) => count + 1)
      }
      setDraft({ question: "", answer: "", context: "" })
      setCreateOpen(false)
      setEditingCard(null)
    } catch (cause) {
      setError(toErrorMessage(cause, "创建卡片失败"))
    } finally {
      setCreating(false)
    }
  }

  const openEdit = (card: Card) => {
    setEditingCard(card)
    setDraft({ question: card.question, answer: card.answer, context: card.excerpt })
    setViewCard(card)
    setSelectedCard(null)
    setInlineEditing(true)
    setSelection(null)
    setAnnotationDraft(null)
  }

  const saveAnnotation = async () => {
    if (!viewCard || !selection || annotationDraft === null) return
    setAnnotationBusy(true)
    try {
      const annotation = await api<Annotation>(`/api/cards/${viewCard.id}/annotations`, {
        method: "POST",
        body: JSON.stringify({ field: selection.field, excerpt: selection.excerpt, sourceText: selection.sourceText, startOffset: selection.start, endOffset: selection.end, comment: annotationDraft }),
      })
      setCardAnnotations((current) => [annotation, ...current])
      setAnnotationDraft(null)
      setSelection(null)
      window.getSelection()?.removeAllRanges()
    } catch (cause) {
      setError(toErrorMessage(cause, "保存批注失败"))
    } finally {
      setAnnotationBusy(false)
    }
  }

  const copySelection = async () => {
    if (!selection) return
    try {
      await navigator.clipboard.writeText(selection.excerpt)
      setCopiedSelection(true)
      window.setTimeout(() => setCopiedSelection(false), 1400)
    } catch {
      setError("复制失败，请检查应用的剪贴板权限")
    }
  }

  const openAnnotation = (id: number, rect: DOMRect) => {
    const annotation = cardAnnotations.find((item) => item.id === id)
    if (!annotation) return
    setAnnotationPopover({ annotation, x: Math.max(12, Math.min(rect.left, window.innerWidth - 312)), y: Math.max(12, Math.min(rect.bottom + 8, window.innerHeight - 240)) })
    setAnnotationCommentDraft(annotation.comment)
    setEditingAnnotation(false)
    setSelection(null)
    setAnnotationDraft(null)
  }

  const saveAnnotationComment = async () => {
    if (!annotationPopover) return
    setAnnotationBusy(true)
    try {
      const updated = await api<Annotation>(`/api/annotations/${annotationPopover.annotation.id}`, { method: "PUT", body: JSON.stringify({ comment: annotationCommentDraft }) })
      setCardAnnotations((current) => current.map((item) => item.id === updated.id ? updated : item))
      setAnnotationPopover({ ...annotationPopover, annotation: updated })
      setAnnotationCommentDraft(updated.comment)
      setEditingAnnotation(false)
    } catch (cause) {
      setError(toErrorMessage(cause, "更新批注失败"))
    } finally {
      setAnnotationBusy(false)
    }
  }

  const closeForm = () => {
    if (creating) return
    setCreateOpen(false)
    setEditingCard(null)
  }

  const quickRateCard = async (rating: 2 | 3) => {
    if (!selectedCard || reviewing || reviewed) return
    setReviewing(true)
    setError("")
    try {
      const result = await api<{ dueAt: string }>(`/api/cards/${selectedCard.id}/review`, { method: "POST", body: JSON.stringify({ rating, response: "" }) })
      const updated = { ...selectedCard, dueAt: result.dueAt }
      setSelectedCard(updated)
      setCards((current) => current.map((card) => card.id === updated.id ? updated : card))
      setShowAnswer(true)
      setReviewed(true)
      setReviewRating(rating)
    } catch (cause) {
      setError(toErrorMessage(cause, "提交复习失败"))
    } finally {
      setReviewing(false)
    }
  }
  const submitRating = async (rating: number) => {
    if (!selectedCard || reviewing || reviewed) return
    setReviewing(true)
    setError("")
    try {
      const result = await api<{ dueAt: string }>(`/api/cards/${selectedCard.id}/review`, { method: "POST", body: JSON.stringify({ rating, response }) })
      const updated = { ...selectedCard, dueAt: result.dueAt }
      setSelectedCard(updated)
      setCards((current) => current.map((card) => card.id === updated.id ? updated : card))
      setReviewed(true)
      setReviewRating(rating)
    } catch (cause) {
      setError(toErrorMessage(cause, "提交复习失败"))
    } finally {
      setReviewing(false)
    }
  }
  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div><p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-[#8a957e]">Library</p><h1 className="mt-1 text-2xl font-semibold tracking-tight text-[#35392f]">卡片库</h1><p className="mt-1 text-sm text-[#898d82]">既可以从笔记划重点，也可以直接录入外部资料的记忆卡片。</p></div>
        <div className="flex gap-2"><button onClick={() => { setEditingCard(null); setInlineEditing(false); setDraft({ question: "", answer: "", context: "" }); setCreateOpen(true) }} className="flex items-center gap-1.5 rounded-xl border border-[#e5e6df] bg-white px-4 py-2.5 text-sm font-medium text-[#52584b] hover:bg-[#f8f9f5]"><Plus size={15} />新建卡片</button><Link to="/review" className="rounded-xl bg-[#30352a] px-4 py-2.5 text-sm text-white hover:bg-[#41473a]">开始复习</Link></div>
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <label className="flex min-w-64 flex-1 items-center gap-2 rounded-xl border border-[#e5e6df] bg-white px-3.5 py-2.5 text-[#898d82] focus-within:border-[#bdc9b3]"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索问题、答案、上下文或笔记" className="w-full bg-transparent text-sm text-[#45493f] outline-none placeholder:text-[#aaaca2]" /></label>
        <label className="flex items-center gap-2 rounded-xl border border-[#e5e6df] bg-white px-3 py-2.5 text-xs text-[#7e8377]">排序<select value={sort} onChange={(event) => { setSort(event.target.value as "due" | "created_desc"); setPage(1) }} className="bg-transparent text-xs text-[#555b4e] outline-none"><option value="due">复习时间：从早到晚</option><option value="created_desc">创建时间：从新到旧</option></select></label>
        <div className="flex items-center gap-4 rounded-xl border border-[#e5e6df] bg-white px-4 py-2.5 text-xs text-[#7e8377]"><span className="flex items-center gap-1.5"><Layers3 size={14} />{totalCards} 张卡片</span><span className="flex items-center gap-1.5"><Clock3 size={14} />{dueCount} 张待复习</span></div>
      </div>

      {error && <div className="mb-4 rounded-xl border border-[#efd5ce] bg-[#fff5f1] px-4 py-2.5 text-sm text-[#9b5748]">{error}</div>}
      <div className="grid gap-4 lg:h-[calc(100vh-17rem)] lg:min-h-[520px] lg:grid-cols-[minmax(280px,0.9fr)_minmax(0,1.35fr)]">
        <section className="flex min-h-[420px] flex-col overflow-hidden rounded-2xl border border-[#e5e6df] bg-[#fbfbf8] p-3">
          <div className="flex items-center justify-between px-2 pb-2"><p className="text-xs font-semibold text-[#72766b]">记忆卡片</p><span className="text-[11px] text-[#a0a297]">{cards.length} / {totalCards}</span></div>
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
            {loading ? <div className="flex min-h-40 items-center justify-center gap-2 text-sm text-[#8e9287]"><LoaderCircle size={16} className="animate-spin" />正在加载卡片…</div> : cards.length ? cards.map((card) => {
              const isDue = !card.dueAt || new Date(card.dueAt).getTime() <= Date.now()
              const active = viewCard?.id === card.id || selectedCard?.id === card.id
              return <article key={card.id} onClick={() => { void openCard(card); setShowAnswer(false); setReviewed(false); setReviewRating(null) }} className={`group cursor-pointer rounded-xl border p-3 transition ${active ? "border-[#cbd4c1] bg-[#e9ece3]" : "border-[#e5e6df] bg-white hover:border-[#cbd4c1] hover:bg-[#fcfcfa]"}`}>
                <div className="flex items-start justify-between gap-2"><p className="min-w-0 truncate text-[10px] text-[#8b907f]">{card.noteTitle || "独立卡片"}</p></div>
                <p className="mt-1.5 line-clamp-2 text-sm font-medium leading-5 text-[#35392f]">{card.question || card.answer || card.excerpt}</p>
                <p className={`mt-2 text-[10px] ${isDue ? "text-[#a66550]" : "text-[#85897d]"}`}>{dueLabel(card.dueAt)}</p>
              </article>
            }) : <div className="flex flex-1 flex-col items-center justify-center px-4 py-12 text-center"><Layers3 size={22} className="text-[#b3b7aa]" /><p className="mt-2 text-xs text-[#8e9287]">{search ? "没有找到匹配的卡片" : "卡片库还是空的"}</p>{!search && <button onClick={() => setCreateOpen(true)} className="mt-3 rounded-lg bg-[#30352a] px-3 py-2 text-xs text-white">直接新建卡片</button>}</div>}
          </div>
          {!loading && totalCards > 0 && <div className="flex items-center justify-between border-t border-[#e7e8e1] px-1 pt-3"><span className="text-[10px] text-[#85897d]">{page} / {Math.max(1, Math.ceil(totalCards / pageSize))} 页</span><div className="flex gap-1.5"><button disabled={page <= 1} onClick={() => setPage((value) => value - 1)} className="flex items-center gap-1 rounded-lg border border-[#e5e6df] bg-white px-2.5 py-1.5 text-[10px] text-[#666c5d] disabled:opacity-40"><ChevronLeft size={13} />上一页</button><button disabled={page >= Math.ceil(totalCards / pageSize)} onClick={() => setPage((value) => value + 1)} className="flex items-center gap-1 rounded-lg border border-[#e5e6df] bg-white px-2.5 py-1.5 text-[10px] text-[#666c5d] disabled:opacity-40">下一页<ChevronRight size={13} /></button></div></div>}
        </section>

        <aside className="flex min-h-[420px] flex-col overflow-hidden rounded-2xl border border-[#e5e6df] bg-white">
          {inlineEditing && viewCard ? <>
            <div className="flex items-center justify-between border-b border-[#eeefe9] px-5 py-4"><div><p className="text-[10px] text-[#8b907f]">{viewCard.noteTitle || "独立卡片"}</p><h2 className="mt-1 text-sm font-semibold text-[#35392f]">编辑记忆卡片</h2></div><button onClick={() => { setInlineEditing(false); setEditingCard(null) }} className="rounded-lg px-2 py-1 text-xs text-[#85897d] hover:bg-[#f1f2ed]">取消编辑</button></div>
            <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5"><label className="block text-xs font-medium text-[#686d61]">复习问题<textarea value={draft.question} onChange={(event) => setDraft({ ...draft, question: event.target.value })} rows={3} className="mt-1.5 w-full resize-y rounded-xl border border-[#e5e6df] bg-[#fcfcfa] px-3.5 py-3 text-sm leading-6 text-[#45493f] outline-none focus:border-[#bdc9b3]" /></label><label className="block text-xs font-medium text-[#686d61]">上下文<textarea value={draft.context} onChange={(event) => setDraft({ ...draft, context: event.target.value })} rows={5} className="mt-1.5 w-full resize-y rounded-xl border border-[#e5e6df] bg-[#fcfcfa] px-3.5 py-3 text-sm leading-6 text-[#45493f] outline-none focus:border-[#bdc9b3]" /></label><label className="block text-xs font-medium text-[#686d61]">参考答案<textarea value={draft.answer} onChange={(event) => setDraft({ ...draft, answer: event.target.value })} rows={6} className="mt-1.5 w-full resize-y rounded-xl border border-[#e5e6df] bg-[#fcfcfa] px-3.5 py-3 text-sm leading-6 text-[#45493f] outline-none focus:border-[#bdc9b3]" /></label></div>
            <div className="border-t border-[#eeefe9] p-4"><button disabled={creating || !draft.question.trim() || !draft.answer.trim()} onClick={() => void createCard()} className="w-full rounded-xl bg-[#30352a] py-3 text-sm font-medium text-white disabled:opacity-50">{creating ? "保存中…" : "保存修改"}</button></div>
          </> : selectedCard ? <>
            <div className="flex items-center justify-between gap-3 border-b border-[#eeefe9] px-5 py-4"><div><p className="text-[10px] text-[#8b907f]">{selectedCard.noteTitle || "独立卡片"}</p><h2 className="mt-1 text-sm font-semibold text-[#35392f]">主动温习</h2></div><div className="flex items-center gap-1"><button onClick={() => openEdit(selectedCard)} aria-label="编辑卡片" title="编辑卡片" className="grid size-8 place-items-center rounded-lg text-[#85897d] hover:bg-[#f1f2ed] hover:text-[#687b58]"><Pencil size={14} /></button><button disabled={deleting === selectedCard.id} onClick={() => void remove(selectedCard)} aria-label="删除卡片" title="删除卡片" className="grid size-8 place-items-center rounded-lg text-[#a36a5c] hover:bg-[#fff2ef] disabled:opacity-50">{deleting === selectedCard.id ? <LoaderCircle size={14} className="animate-spin" /> : <Trash2 size={14} />}</button><button onClick={() => { setViewCard(selectedCard); setSelectedCard(null) }} aria-label="返回查看卡片" className="rounded-lg px-2 py-1 text-xs text-[#85897d] hover:bg-[#f1f2ed]">返回查看</button></div></div>
            <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5"><section><p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-[#8c967f]">复习问题</p><div className="mt-2 whitespace-pre-wrap text-base font-medium leading-7 text-[#35392f]">{selectedCard.question || selectedCard.answer || selectedCard.excerpt}</div></section><section className="rounded-xl border border-[#eee9da] bg-[#fcfaf3] p-4"><p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-[#9c9273]">上下文</p><div className="markdown-preview mt-2 text-sm leading-6 text-[#635f50]"><ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml>{selectedCard.excerpt || "（没有上下文）"}</ReactMarkdown></div></section><label className="block text-xs font-medium text-[#686d61]">你的回答<textarea value={response} onChange={(event) => setResponse(event.target.value)} rows={4} placeholder="先回忆并写下答案" className="mt-1.5 w-full resize-y rounded-xl border border-[#e5e6df] bg-[#fcfcfa] px-3.5 py-3 text-sm leading-6 text-[#45493f] outline-none focus:border-[#bdc9b3]" /></label>{showAnswer && <section className="rounded-xl border border-[#e7eadf] bg-[#f8f9f5] p-4"><p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-[#8c967f]">参考答案</p><div className="markdown-preview mt-2 text-sm leading-6 text-[#45493f]"><ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml>{selectedCard.answer || "（没有单独填写参考答案）"}</ReactMarkdown></div></section>}{reviewed && <div className="rounded-xl bg-[#e9eee3] px-4 py-3 text-sm text-[#647555]">复习已记录，下次复习时间：{dueLabel(selectedCard.dueAt)}</div>}</div>
            <div className="space-y-2 border-t border-[#eeefe9] p-4">{!showAnswer ? <><button disabled={!response.trim()} onClick={() => setShowAnswer(true)} className="w-full rounded-xl bg-[#30352a] py-2.5 text-sm font-medium text-white disabled:opacity-45">查看参考答案</button><div className="grid grid-cols-2 gap-2"><button disabled={reviewing || reviewed} onClick={() => void quickRateCard(2)} className="flex items-center justify-center gap-1.5 rounded-xl border border-[#efd5ce] bg-[#fff5f1] py-2.5 text-xs font-medium text-[#a66550] disabled:opacity-50"><CircleHelp size={15} />我不记得</button><button disabled={reviewing || reviewed} onClick={() => void quickRateCard(3)} className="flex items-center justify-center gap-1.5 rounded-xl border border-[#d7e2ce] bg-[#e9eee3] py-2.5 text-xs font-medium text-[#5d744e] disabled:opacity-50"><Check size={15} />我记得</button></div></> : reviewed ? <p className="text-center text-xs text-[#647555]">已按“{reviewRating === 3 ? "记得" : "困难"}”记录。</p> : <div className="grid grid-cols-4 gap-2">{[{rating:1,label:"忘了",style:"bg-[#f6e8e2] text-[#a66550]"},{rating:2,label:"困难",style:"bg-[#f3eee0] text-[#8d7950]"},{rating:3,label:"记得",style:"bg-[#e9eee3] text-[#647555]"},{rating:4,label:"简单",style:"bg-[#e2ece8] text-[#55786b]"}].map((item) => <button key={item.rating} disabled={reviewing} onClick={() => void submitRating(item.rating)} className={`rounded-xl py-2.5 text-xs font-semibold disabled:opacity-50 ${item.style}`}>{reviewing ? <LoaderCircle className="mx-auto animate-spin" size={15} /> : item.label}</button>)}</div>}</div>
          </> : viewCard ? <>
            <div className="flex items-start justify-between gap-3 border-b border-[#eeefe9] px-5 py-4"><div><p className="text-[10px] text-[#8b907f]">{viewCard.noteTitle || "独立卡片"}</p><h2 className="mt-1 text-sm font-semibold text-[#35392f]">卡片内容</h2></div><div className="flex shrink-0 items-center gap-1"><button onClick={() => openEdit(viewCard)} aria-label="编辑卡片" title="编辑卡片" className="grid size-8 place-items-center rounded-lg text-[#85897d] hover:bg-[#f1f2ed] hover:text-[#687b58]"><Pencil size={15} /></button><button disabled={deleting === viewCard.id} onClick={() => void remove(viewCard)} aria-label="删除卡片" title="删除卡片" className="grid size-8 place-items-center rounded-lg text-[#a36a5c] hover:bg-[#fff2ef] disabled:opacity-50">{deleting === viewCard.id ? <LoaderCircle size={15} className="animate-spin" /> : <Trash2 size={15} />}</button></div></div>
            <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5"><section><p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-[#8c967f]">复习问题</p><MarkdownNote content={viewCard.question} cards={[]} annotations={cardAnnotations.filter((item) => item.field === "question")} onSelect={(value) => { setSelection(value ? { ...value, field: "question" } : null); if (value) setAnnotationPopover(null) }} onAnnotationClick={openAnnotation} /></section><section className="rounded-xl border border-[#eee9da] bg-[#fcfaf3] p-4"><p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-[#9c9273]">上下文</p><MarkdownNote content={viewCard.excerpt} cards={[]} annotations={cardAnnotations.filter((item) => item.field === "context")} onSelect={(value) => { setSelection(value ? { ...value, field: "context" } : null); if (value) setAnnotationPopover(null) }} onAnnotationClick={openAnnotation} /></section><section className="rounded-xl border border-[#e7eadf] bg-[#f8f9f5] p-4"><p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-[#8c967f]">参考答案</p><MarkdownNote content={viewCard.answer} cards={[]} annotations={cardAnnotations.filter((item) => item.field === "answer")} onSelect={(value) => { setSelection(value ? { ...value, field: "answer" } : null); if (value) setAnnotationPopover(null) }} onAnnotationClick={openAnnotation} /></section></div>
            <div className="border-t border-[#eeefe9] p-4"><button onClick={() => { setSelectedCard(viewCard); setViewCard(null); setResponse(""); setShowAnswer(false); setReviewed(false); setReviewRating(null) }} className="w-full rounded-xl bg-[#30352a] py-3 text-sm font-medium text-white hover:bg-[#41473a]">开始主动温习</button></div>
          </> : <div className="flex flex-1 flex-col items-center justify-center px-8 text-center"><div className="grid size-12 place-items-center rounded-2xl bg-[#f0f2ec] text-[#829078]"><BookOpenText size={20} /></div><h2 className="mt-4 text-sm font-semibold text-[#555b4e]">选择一张卡片</h2><p className="mt-1.5 max-w-xs text-xs leading-5 text-[#92958b]">卡片内容会显示在这里。点击“开始主动温习”后，可以评分并更新复习计划。</p></div>}
        </aside>
      </div>
      {viewCard && selection && !inlineEditing && <div className="fixed z-50 w-max rounded-xl border border-[#e5e6df] bg-white p-1.5 shadow-[0_16px_45px_-18px_rgba(35,39,30,.45)]" style={{ left: Math.max(12, Math.min(selection.x, window.innerWidth - (annotationDraft === null ? 180 : 312))), top: Math.max(12, Math.min(selection.y, window.innerHeight - (annotationDraft === null ? 144 : 220))) }} onMouseDown={(event) => { if (annotationDraft === null) event.preventDefault() }}>
        {annotationDraft === null ? <div className="flex w-36 flex-col gap-0.5"><button onClick={() => void copySelection()} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-medium text-[#5e6357] hover:bg-[#f1f2ed]"><Copy size={14} />{copiedSelection ? "已复制" : "复制"}</button><button onClick={() => setAnnotationDraft("")} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-medium text-[#5e6357] hover:bg-[#f1f2ed]"><MessageSquareText size={14} />批注</button><button onClick={() => { setSelection(null); window.getSelection()?.removeAllRanges() }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs text-[#85897d] hover:bg-[#f1f2ed]"><X size={14} />取消选中</button></div> : <><label className="block px-1 text-xs font-medium text-[#686d61]">添加批注 <span className="font-normal text-[#9da095]">（可留空）</span><textarea autoFocus value={annotationDraft} onChange={(event) => setAnnotationDraft(event.target.value)} rows={3} placeholder="写下帮助回忆的提示" className="mt-1.5 w-full resize-y rounded-lg border border-[#e5e6df] bg-[#fcfcfa] px-3 py-2 text-sm text-[#45493f] outline-none focus:border-[#bdc9b3]" /></label><div className="mt-2 flex justify-end gap-1.5"><button disabled={annotationBusy} onClick={() => { setAnnotationDraft(null); setSelection(null) }} className="rounded-lg border border-[#e2e4dc] px-3 py-1.5 text-xs text-[#74796d]">取消</button><button disabled={annotationBusy} onClick={() => void saveAnnotation()} className="rounded-lg bg-[#30352a] px-3 py-1.5 text-xs text-white disabled:opacity-50">{annotationBusy ? "保存中…" : "保存"}</button></div></>}
      </div>}      {annotationPopover && <div className="fixed z-50 w-[min(300px,calc(100vw-24px))] overflow-hidden rounded-xl border border-[#e5e6df] bg-white shadow-[0_16px_45px_-18px_rgba(35,39,30,.45)]" style={{ left: annotationPopover.x, top: annotationPopover.y }} onMouseDown={(event) => event.stopPropagation()}><div className="flex items-center justify-between border-b border-[#eeefe9] px-3 py-2"><span className="text-xs font-semibold text-[#686d61]">批注</span><button onClick={() => { setAnnotationPopover(null); setEditingAnnotation(false) }} aria-label="关闭批注" className="grid size-6 place-items-center rounded-md text-[#85897d] hover:bg-[#f1f2ed]"><X size={13} /></button></div>{editingAnnotation ? <div className="p-3"><textarea autoFocus value={annotationCommentDraft} onChange={(event) => setAnnotationCommentDraft(event.target.value)} rows={3} placeholder="批注可以留空" className="w-full resize-y rounded-lg border border-[#e5e6df] bg-[#fcfcfa] px-3 py-2 text-sm text-[#45493f] outline-none focus:border-[#bdc9b3]" /><div className="mt-2 flex justify-end gap-1.5"><button disabled={annotationBusy} onClick={() => { setEditingAnnotation(false); setAnnotationCommentDraft(annotationPopover.annotation.comment) }} className="rounded-lg border border-[#e2e4dc] px-3 py-1.5 text-xs text-[#74796d]">取消</button><button disabled={annotationBusy} onClick={() => void saveAnnotationComment()} className="rounded-lg bg-[#30352a] px-3 py-1.5 text-xs text-white disabled:opacity-50">{annotationBusy ? "保存中…" : "保存修改"}</button></div></div> : <div className="p-3"><p className="whitespace-pre-wrap text-sm leading-6 text-[#45493f]">{annotationPopover.annotation.comment || <span className="text-[#a1a398]">（空批注）</span>}</p><button onClick={() => setEditingAnnotation(true)} className="mt-3 flex items-center gap-1.5 rounded-lg border border-[#e5e6df] px-3 py-1.5 text-xs text-[#666c5d] hover:bg-[#f8f9f5]"><Pencil size={12} />编辑批注</button></div>}</div>}      {createOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) closeForm() }}><form onSubmit={(event) => void createCard(event)} className="max-h-[min(90vh,760px)] w-full max-w-xl overflow-y-auto rounded-2xl border border-[#e5e6df] bg-white p-5 shadow-2xl sm:p-6"><div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[#8a957e]">{editingCard ? "Edit card" : "Standalone card"}</p><h2 className="mt-1 text-lg font-semibold text-[#35392f]">{editingCard ? "编辑记忆卡片" : "直接新建记忆卡片"}</h2><p className="mt-1 text-xs text-[#85897d]">{editingCard ? "修改问题、答案或上下文。" : "无需导入整篇资料，摘录需要记忆的内容即可。"}</p></div><button type="button" onClick={closeForm} disabled={creating} aria-label="关闭" className="grid size-8 place-items-center rounded-lg text-[#85897d] hover:bg-[#f1f2ed]"><X size={17} /></button></div><label className="mt-5 block text-xs font-medium text-[#686d61]">复习问题<textarea required autoFocus value={draft.question} onChange={(event) => setDraft({ ...draft, question: event.target.value })} rows={3} placeholder="例如：FSRS 的目标记忆保留率表示什么？" className="mt-1.5 w-full resize-y rounded-xl border border-[#e5e6df] bg-[#fcfcfa] px-3.5 py-3 text-sm leading-6 text-[#45493f] outline-none focus:border-[#bdc9b3]" /></label><label className="mt-4 block text-xs font-medium text-[#686d61]">上下文 <span className="font-normal text-[#9da095]">（可选）</span><textarea value={draft.context} onChange={(event) => setDraft({ ...draft, context: event.target.value })} rows={3} placeholder="补充来源片段、背景或帮助回忆的线索" className="mt-1.5 w-full resize-y rounded-xl border border-[#e5e6df] bg-[#fcfcfa] px-3.5 py-3 text-sm leading-6 text-[#45493f] outline-none focus:border-[#bdc9b3]" /></label><label className="mt-4 block text-xs font-medium text-[#686d61]">参考答案<textarea required value={draft.answer} onChange={(event) => setDraft({ ...draft, answer: event.target.value })} rows={4} placeholder="写下你希望复习时回忆出的答案" className="mt-1.5 w-full resize-y rounded-xl border border-[#e5e6df] bg-[#fcfcfa] px-3.5 py-3 text-sm leading-6 text-[#45493f] outline-none focus:border-[#bdc9b3]" /></label><div className="mt-5 flex justify-end gap-2 border-t border-[#eeefe9] pt-4"><button type="button" disabled={creating} onClick={closeForm} className="rounded-xl border border-[#e5e6df] px-4 py-2.5 text-sm text-[#74796d] hover:bg-[#f8f9f5]">取消</button><button disabled={creating || !draft.question.trim() || !draft.answer.trim()} className="flex min-w-32 items-center justify-center gap-2 rounded-xl bg-[#30352a] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#41473a] disabled:opacity-50">{creating ? <LoaderCircle size={15} className="animate-spin" /> : editingCard ? <Pencil size={15} /> : <Plus size={15} />}{creating ? "保存中…" : editingCard ? "保存修改" : "创建并加入复习"}</button></div></form></div>}
    </div>
  )
}
