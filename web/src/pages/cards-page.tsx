import { useCallback, useEffect, useState } from "react"
import type { FormEvent } from "react"
import { BookOpenText, Clock3, Layers3, LoaderCircle, Pencil, Plus, Search, Trash2, X, ChevronRight } from "lucide-react"
import { Link } from "react-router"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { api, toErrorMessage, type Card } from "@/lib/api"

function dueLabel(value: string | null) {
  if (!value) return "尚未安排"
  const due = new Date(value)
  if (due.getTime() <= Date.now()) return "待复习"
  return `下次复习：${due.toLocaleString("zh-CN", { dateStyle: "medium", timeStyle: "short" })}`
}

export function CardsPage() {
  const [cards, setCards] = useState<Card[]>([])
  const [search, setSearch] = useState("")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [deleting, setDeleting] = useState<number | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [editingCard, setEditingCard] = useState<Card | null>(null)
  const [creating, setCreating] = useState(false)
  const [draft, setDraft] = useState({ question: "", answer: "", context: "" })
  const [selectedCard, setSelectedCard] = useState<Card | null>(null)
  const [response, setResponse] = useState("")
  const [showAnswer, setShowAnswer] = useState(false)
  const [reviewing, setReviewing] = useState(false)
  const [reviewed, setReviewed] = useState(false)

  const load = useCallback(async (query: string) => {
    setLoading(true)
    setError("")
    try {
      const params = new URLSearchParams()
      if (query.trim()) params.set("q", query.trim())
      const result = await api<Card[]>(`/api/cards${params.size ? `?${params}` : ""}`)
      setCards(result)
    } catch (cause) {
      setError(toErrorMessage(cause, "加载卡片失败"))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => void load(search), 180)
    return () => window.clearTimeout(timer)
  }, [load, search])

  const remove = async (card: Card) => {
    if (!window.confirm("确定删除这张复习卡片吗？")) return
    setDeleting(card.id)
    try {
      await api(`/api/cards/${card.id}`, { method: "DELETE" })
      setCards((current) => current.filter((item) => item.id !== card.id))
    } catch (cause) {
      setError(toErrorMessage(cause, "删除卡片失败"))
    } finally {
      setDeleting(null)
    }
  }

  const createCard = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setCreating(true)
    setError("")
    try {
      if (editingCard) {
        const card = await api<Card>(`/api/cards/${editingCard.id}`, { method: "PUT", body: JSON.stringify(draft) })
        setCards((current) => current.map((item) => item.id === card.id ? card : item))
      } else {
        const card = await api<Card>("/api/cards", { method: "POST", body: JSON.stringify(draft) })
        setCards((current) => [card, ...current])
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
    setCreateOpen(true)
  }

  const closeForm = () => {
    if (creating) return
    setCreateOpen(false)
    setEditingCard(null)
  }

  const forgotCard = async () => {
    if (!selectedCard || reviewing || reviewed) return
    setReviewing(true)
    setError("")
    try {
      const result = await api<{ dueAt: string }>(`/api/cards/${selectedCard.id}/review`, { method: "POST", body: JSON.stringify({ rating: 2, response: "" }) })
      const updated = { ...selectedCard, dueAt: result.dueAt }
      setSelectedCard(updated)
      setCards((current) => current.map((card) => card.id === updated.id ? updated : card))
      setShowAnswer(true)
      setReviewed(true)
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
    } catch (cause) {
      setError(toErrorMessage(cause, "提交复习失败"))
    } finally {
      setReviewing(false)
    }
  }
  const dueCount = cards.filter((card) => !card.dueAt || new Date(card.dueAt).getTime() <= Date.now()).length

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div><p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-[#8a957e]">Library</p><h1 className="mt-1 text-2xl font-semibold tracking-tight text-[#35392f]">卡片库</h1><p className="mt-1 text-sm text-[#898d82]">既可以从笔记划重点，也可以直接录入外部资料的记忆卡片。</p></div>
        <div className="flex gap-2"><button onClick={() => { setEditingCard(null); setDraft({ question: "", answer: "", context: "" }); setCreateOpen(true) }} className="flex items-center gap-1.5 rounded-xl border border-[#e5e6df] bg-white px-4 py-2.5 text-sm font-medium text-[#52584b] hover:bg-[#f8f9f5]"><Plus size={15} />新建卡片</button><Link to="/review" className="rounded-xl bg-[#30352a] px-4 py-2.5 text-sm text-white hover:bg-[#41473a]">开始复习</Link></div>
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <label className="flex min-w-64 flex-1 items-center gap-2 rounded-xl border border-[#e5e6df] bg-white px-3.5 py-2.5 text-[#898d82] focus-within:border-[#bdc9b3]"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索问题、答案、上下文或笔记" className="w-full bg-transparent text-sm text-[#45493f] outline-none placeholder:text-[#aaaca2]" /></label>
        <div className="flex items-center gap-4 rounded-xl border border-[#e5e6df] bg-white px-4 py-2.5 text-xs text-[#7e8377]"><span className="flex items-center gap-1.5"><Layers3 size={14} />{cards.length} 张卡片</span><span className="flex items-center gap-1.5"><Clock3 size={14} />{dueCount} 张待复习</span></div>
      </div>

      {error && <div className="mb-4 rounded-xl border border-[#efd5ce] bg-[#fff5f1] px-4 py-2.5 text-sm text-[#9b5748]">{error}</div>}
      {loading ? <div className="flex min-h-56 items-center justify-center gap-2 text-sm text-[#8e9287]"><LoaderCircle size={17} className="animate-spin" />正在加载卡片…</div> : cards.length ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {cards.map((card) => {
          const isDue = !card.dueAt || new Date(card.dueAt).getTime() <= Date.now()
          return <article key={card.id} onClick={() => { setSelectedCard(card); setResponse(""); setShowAnswer(false); setReviewed(false) }} className="group cursor-pointer rounded-2xl border border-[#e5e6df] bg-white p-4 shadow-[0_18px_50px_-45px_rgba(45,51,38,.5)] transition hover:-translate-y-0.5 hover:border-[#cbd4c1] hover:shadow-md">
            <div className="flex items-start justify-between gap-2"><div className="flex min-w-0 items-center gap-1.5 truncate text-[11px] text-[#8b907f]"><BookOpenText size={13} className="shrink-0" />{card.noteTitle || "独立卡片"}</div><div className="flex shrink-0 items-center gap-1"><button onClick={(event) => { event.stopPropagation(); openEdit(card) }} aria-label="编辑卡片" className="grid size-7 place-items-center rounded-lg text-[#a3a69c] hover:bg-[#f1f2ed] hover:text-[#687b58]"><Pencil size={13} /></button><button disabled={deleting === card.id} onClick={(event) => { event.stopPropagation(); void remove(card) }} aria-label="删除卡片" className="grid size-7 place-items-center rounded-lg text-[#a3a69c] hover:bg-[#fff2ef] hover:text-[#a75e4e] disabled:opacity-50">{deleting === card.id ? <LoaderCircle size={14} className="animate-spin" /> : <Trash2 size={14} />}</button></div></div>
            <p className="mt-3 line-clamp-3 min-h-[4.5rem] whitespace-pre-wrap text-sm font-medium leading-6 text-[#35392f]">{card.question || card.answer || card.excerpt}</p>
            <div className="mt-3 flex items-center justify-between gap-2 border-t border-[#f0f0eb] pt-2.5"><span className={`truncate text-[10px] ${isDue ? "text-[#a66550]" : "text-[#85897d]"}`}>{dueLabel(card.dueAt)}</span><span className="flex shrink-0 items-center gap-1 text-[10px] text-[#718264] opacity-0 transition group-hover:opacity-100">主动温习<ChevronRight size={12} /></span></div>
          </article>
        })}
      </div> : <div className="rounded-2xl border border-dashed border-[#dfe2d8] bg-[#fbfbf8] px-6 py-16 text-center"><div className="mx-auto grid size-14 place-items-center rounded-2xl bg-[#e9eee3] text-[#718264]"><Layers3 size={23} /></div><h2 className="mt-4 text-lg font-semibold text-[#35392f]">{search ? "没有找到匹配的卡片" : "卡片库还是空的"}</h2><p className="mt-2 text-sm text-[#85897d]">你可以直接录入外部资料，也可以从笔记中选取重点。</p><div className="mt-5 flex justify-center gap-2"><button onClick={() => setCreateOpen(true)} className="inline-flex items-center gap-1.5 rounded-xl bg-[#30352a] px-4 py-2.5 text-sm text-white hover:bg-[#41473a]"><Plus size={14} />直接新建卡片</button><Link to="/notes" className="inline-flex rounded-xl border border-[#e2e4dc] bg-white px-4 py-2.5 text-sm text-[#5e6357] hover:bg-[#f8f9f5]">前往笔记</Link></div></div>}

      {selectedCard && <div className="fixed inset-0 z-40 flex justify-end bg-black/25" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedCard(null) }}><aside className="flex h-full w-full max-w-xl flex-col overflow-hidden border-l border-[#e5e6df] bg-white shadow-2xl"><div className="flex items-start justify-between gap-4 border-b border-[#eeefe9] px-5 py-4"><div className="min-w-0"><p className="truncate text-[11px] text-[#8b907f]">{selectedCard.noteTitle || "独立卡片"}</p><h2 className="mt-1 text-lg font-semibold text-[#35392f]">主动温习</h2></div><button onClick={() => setSelectedCard(null)} aria-label="关闭" className="grid size-8 shrink-0 place-items-center rounded-lg text-[#85897d] hover:bg-[#f1f2ed]"><X size={17} /></button></div><div className="flex-1 overflow-y-auto px-5 py-5"><p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-[#8c967f]">复习问题</p><div className="mt-2 whitespace-pre-wrap text-base font-medium leading-7 text-[#35392f]">{selectedCard.question || selectedCard.answer || selectedCard.excerpt}</div><div className="mt-5 rounded-xl border border-[#eee9da] bg-[#fcfaf3] p-4"><p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-[#9c9273]">上下文</p><div className="prose prose-sm mt-2 max-w-none break-words text-[#635f50]"><ReactMarkdown remarkPlugins={[remarkGfm]}>{selectedCard.excerpt || "（没有上下文）"}</ReactMarkdown></div></div><label className="mt-5 block text-xs font-medium text-[#686d61]">你的回答<textarea value={response} onChange={(event) => setResponse(event.target.value)} rows={4} placeholder="先回忆并写下答案" className="mt-1.5 w-full resize-y rounded-xl border border-[#e5e6df] bg-[#fcfcfa] px-3.5 py-3 text-sm leading-6 text-[#45493f] outline-none focus:border-[#bdc9b3]" /></label>{showAnswer && <div className="mt-4 rounded-xl border border-[#e7eadf] bg-[#f8f9f5] p-4"><p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-[#8c967f]">参考答案</p><div className="prose prose-sm mt-2 max-w-none break-words text-[#45493f]"><ReactMarkdown remarkPlugins={[remarkGfm]}>{selectedCard.answer || "（没有单独填写参考答案）"}</ReactMarkdown></div></div>}{reviewed && <div className="mt-4 rounded-xl bg-[#e9eee3] px-4 py-3 text-sm text-[#647555]">回答已保存，FSRS 已更新下次复习时间：{dueLabel(selectedCard.dueAt)}</div>}</div><div className="border-t border-[#eeefe9] bg-white p-5">
            {!showAnswer ? <div className="space-y-2"><button disabled={!response.trim()} onClick={() => setShowAnswer(true)} className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#30352a] py-3 text-sm font-medium text-white hover:bg-[#41473a] disabled:opacity-45">查看参考答案<ChevronRight size={15} /></button><button disabled={reviewing || reviewed} onClick={() => void forgotCard()} className="w-full rounded-xl border border-[#e5e6df] py-3 text-sm font-medium text-[#777b70] hover:bg-[#f8f9f5] disabled:opacity-50">{reviewing ? "正在保存…" : "我不记得了，直接查看答案"}</button></div> : <div>{reviewed ? <p className="mb-2 rounded-xl bg-[#f3eee0] px-3 py-2 text-center text-xs text-[#8d7950]">已按“困难”记录，回答留空，复习计划已更新。</p> : <><p className="mb-2 text-center text-[10px] text-[#a1a398]">对照后选择记忆情况，保存回答并安排下次复习</p><div className="grid grid-cols-4 gap-2">{[{rating:1,label:"忘了",style:"bg-[#f6e8e2] text-[#a66550]"},{rating:2,label:"困难",style:"bg-[#f3eee0] text-[#8d7950]"},{rating:3,label:"记得",style:"bg-[#e9eee3] text-[#647555]"},{rating:4,label:"简单",style:"bg-[#e2ece8] text-[#55786b]"}].map((item) => <button key={item.rating} disabled={reviewing} onClick={() => void submitRating(item.rating)} className={`rounded-xl py-3 text-xs font-semibold disabled:opacity-50 ${item.style}`}>{reviewing ? <LoaderCircle className="mx-auto animate-spin" size={15} /> : item.label}</button>)}</div></>}</div>}
          </div></aside></div>}
      {createOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) closeForm() }}><form onSubmit={(event) => void createCard(event)} className="max-h-[min(90vh,760px)] w-full max-w-xl overflow-y-auto rounded-2xl border border-[#e5e6df] bg-white p-5 shadow-2xl sm:p-6"><div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[#8a957e]">{editingCard ? "Edit card" : "Standalone card"}</p><h2 className="mt-1 text-lg font-semibold text-[#35392f]">{editingCard ? "编辑记忆卡片" : "直接新建记忆卡片"}</h2><p className="mt-1 text-xs text-[#85897d]">{editingCard ? "修改问题、答案或上下文。" : "无需导入整篇资料，摘录需要记忆的内容即可。"}</p></div><button type="button" onClick={closeForm} disabled={creating} aria-label="关闭" className="grid size-8 place-items-center rounded-lg text-[#85897d] hover:bg-[#f1f2ed]"><X size={17} /></button></div><label className="mt-5 block text-xs font-medium text-[#686d61]">复习问题<textarea required autoFocus value={draft.question} onChange={(event) => setDraft({ ...draft, question: event.target.value })} rows={3} placeholder="例如：FSRS 的目标记忆保留率表示什么？" className="mt-1.5 w-full resize-y rounded-xl border border-[#e5e6df] bg-[#fcfcfa] px-3.5 py-3 text-sm leading-6 text-[#45493f] outline-none focus:border-[#bdc9b3]" /></label><label className="mt-4 block text-xs font-medium text-[#686d61]">参考答案<textarea required value={draft.answer} onChange={(event) => setDraft({ ...draft, answer: event.target.value })} rows={4} placeholder="写下你希望复习时回忆出的答案" className="mt-1.5 w-full resize-y rounded-xl border border-[#e5e6df] bg-[#fcfcfa] px-3.5 py-3 text-sm leading-6 text-[#45493f] outline-none focus:border-[#bdc9b3]" /></label><label className="mt-4 block text-xs font-medium text-[#686d61]">上下文 <span className="font-normal text-[#9da095]">（可选）</span><textarea value={draft.context} onChange={(event) => setDraft({ ...draft, context: event.target.value })} rows={3} placeholder="补充来源片段、背景或帮助回忆的线索" className="mt-1.5 w-full resize-y rounded-xl border border-[#e5e6df] bg-[#fcfcfa] px-3.5 py-3 text-sm leading-6 text-[#45493f] outline-none focus:border-[#bdc9b3]" /></label><div className="mt-5 flex justify-end gap-2 border-t border-[#eeefe9] pt-4"><button type="button" disabled={creating} onClick={closeForm} className="rounded-xl border border-[#e5e6df] px-4 py-2.5 text-sm text-[#74796d] hover:bg-[#f8f9f5]">取消</button><button disabled={creating || !draft.question.trim() || !draft.answer.trim()} className="flex min-w-32 items-center justify-center gap-2 rounded-xl bg-[#30352a] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#41473a] disabled:opacity-50">{creating ? <LoaderCircle size={15} className="animate-spin" /> : editingCard ? <Pencil size={15} /> : <Plus size={15} />}{creating ? "保存中…" : editingCard ? "保存修改" : "创建并加入复习"}</button></div></form></div>}
    </div>
  )
}
