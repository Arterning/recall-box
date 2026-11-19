import { useCallback, useEffect, useRef, useState } from "react"
import {
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Clock3,
  FilePlus2,
  FileText,
  Highlighter,
  Layers3,
  LoaderCircle,
  Plus,
  Search,
  Sparkles,
  Trash2,
  Upload,
  X,
} from "lucide-react"

type Note = {
  id: number
  title: string
  content: string
  format: "markdown" | "text"
  tags: string
  updatedAt: string
}
type Card = {
  id: number
  noteId: number
  excerpt: string
  startOffset: number
  endOffset: number
  anchorValid: boolean
  prompt: string
  answer: string
  dueAt: string | null
  createdAt: string
  note?: Note
  noteTitle?: string
}
type Stats = { notes: number; cards: number; due: number; reviewedToday: number }
type Selection = { start: number; end: number; text: string } | null

const emptyNote: Note = {
  id: 0,
  title: "",
  content: "",
  format: "markdown",
  tags: "",
  updatedAt: "",
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  })
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error || `请求失败 (${response.status})`)
  }
  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

export function App() {
  const [notes, setNotes] = useState<Note[]>([])
  const [note, setNote] = useState<Note>(emptyNote)
  const [cards, setCards] = useState<Card[]>([])
  const [dueCards, setDueCards] = useState<Card[]>([])
  const [stats, setStats] = useState<Stats>({ notes: 0, cards: 0, due: 0, reviewedToday: 0 })
  const [mode, setMode] = useState<"notes" | "review">("notes")
  const [editing, setEditing] = useState(false)
  const [query, setQuery] = useState("")
  const [selection, setSelection] = useState<Selection>(null)
  const [draftCard, setDraftCard] = useState<{ prompt: string; answer: string } | null>(null)
  const [revealed, setRevealed] = useState(false)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [toast, setToast] = useState("")
  const editorRef = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const loadNotes = useCallback(async (search = query) => {
    const result = await api<Note[]>(`/api/notes${search ? `?q=${encodeURIComponent(search)}` : ""}`)
    setNotes(result)
  }, [query])

  const loadStats = useCallback(async () => {
    setStats(await api<Stats>("/api/reviews/stats"))
  }, [])

  const loadDue = useCallback(async () => {
    setDueCards(await api<Card[]>("/api/cards/due"))
  }, [])

  const loadNote = useCallback(async (id: number) => {
    const loaded = await api<Note>(`/api/notes/${id}`)
    const loadedCards = await api<Card[]>(`/api/notes/${id}/cards`)
    setNote(loaded)
    setEditing(true)
    setCards(loadedCards)
    setSelection(null)
    setDraftCard(null)
  }, [])

  useEffect(() => {
    Promise.all([loadNotes(""), loadStats(), loadDue()])
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "无法连接本地服务"))
      .finally(() => setLoading(false))
  }, [loadDue, loadNotes, loadStats])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      loadNotes(query).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "搜索失败"))
    }, 180)
    return () => window.clearTimeout(timer)
  }, [query, loadNotes])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(""), 2400)
    return () => window.clearTimeout(timer)
  }, [toast])

  const persistNote = useCallback(async () => {
    const payload = {
      title: note.title.trim() || "未命名笔记",
      content: note.content,
      format: note.format,
      tags: note.tags,
    }
    setSaving(true)
    try {
      const saved = note.id
        ? await api<Note>(`/api/notes/${note.id}`, { method: "PUT", body: JSON.stringify(payload) })
        : await api<Note>("/api/notes", { method: "POST", body: JSON.stringify(payload) })
      setNote(saved)
      setEditing(true)
      setCards(await api<Card[]>(`/api/notes/${saved.id}/cards`))
      setNotes((current) => [saved, ...current.filter((item) => item.id !== saved.id)].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)))
      setToast("笔记已保存")
      return saved
    } finally {
      setSaving(false)
    }
  }, [note])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault()
        void persistNote().catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "保存失败"))
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [persistNote])

  const createNote = () => {
    setMode("notes")
    setNote({ ...emptyNote })
    setEditing(true)
    setCards([])
    setSelection(null)
    setDraftCard(null)
  }

  const captureSelection = () => {
    const editor = editorRef.current
    if (!editor) return
    const start = editor.selectionStart
    const end = editor.selectionEnd
    if (end <= start) {
      setSelection(null)
      return
    }
    setSelection({ start, end, text: note.content.slice(start, end) })
  }

  const startCardDraft = () => {
    if (!selection) return
    const lineStart = note.content.lastIndexOf("\n", selection.start - 1) + 1
    const lineEndIndex = note.content.indexOf("\n", selection.end)
    const lineEnd = lineEndIndex < 0 ? note.content.length : lineEndIndex
    const cloze = note.content.slice(lineStart, selection.start) + "＿＿＿＿" + note.content.slice(selection.end, lineEnd)
    setDraftCard({ prompt: cloze || "回忆这段重点", answer: selection.text })
  }

  const saveCard = async () => {
    if (!draftCard || !selection || !note.content.slice(selection.start, selection.end)) return
    setBusy(true)
    setError("")
    try {
      const savedNote = await persistNote()
      const card = await api<Card>(`/api/notes/${savedNote.id}/cards`, {
        method: "POST",
        body: JSON.stringify({
          excerpt: selection.text,
          startOffset: selection.start,
          endOffset: selection.end,
          prompt: draftCard.prompt,
          answer: draftCard.answer,
        }),
      })
      setCards((current) => [card, ...current])
      setDraftCard(null)
      setSelection(null)
      await Promise.all([loadStats(), loadDue()])
      setToast("重点已加入复习卡片")
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "创建卡片失败")
    } finally {
      setBusy(false)
    }
  }

  const removeCard = async (id: number) => {
    try {
      await api<void>(`/api/cards/${id}`, { method: "DELETE" })
      setCards((current) => current.filter((card) => card.id !== id))
      await Promise.all([loadStats(), loadDue()])
      setToast("卡片已删除")
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "删除失败")
    }
  }

  const importFile = async (file?: File) => {
    if (!file) return
    const format = file.name.toLowerCase().endsWith(".txt") ? "text" : "markdown"
    const content = await file.text()
    setNote({ ...emptyNote, title: file.name.replace(/\.(md|markdown|txt)$/i, ""), format, content })
    setEditing(true)
    setCards([])
    setMode("notes")
    setToast("文件已载入，保存后加入笔记")
    if (fileRef.current) fileRef.current.value = ""
  }

  const openReview = async () => {
    setMode("review")
    setRevealed(false)
    setError("")
    try {
      await loadDue()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "加载复习卡片失败")
    }
  }

  const rateCard = async (rating: number) => {
    const current = dueCards[0]
    if (!current) return
    setBusy(true)
    setError("")
    try {
      await api(`/api/cards/${current.id}/review`, { method: "POST", body: JSON.stringify({ rating }) })
      setRevealed(false)
      await Promise.all([loadDue(), loadStats()])
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "提交评分失败")
    } finally {
      setBusy(false)
    }
  }

  const jumpToCard = (card: Card) => {
    if (!editorRef.current || !card.anchorValid) return
    editorRef.current.focus()
    editorRef.current.setSelectionRange(card.startOffset, card.endOffset)
    setSelection({ start: card.startOffset, end: card.endOffset, text: card.excerpt })
  }

  const savedNote = notes.find((item) => item.id === note.id)
  const isDirty = !note.id || savedNote?.content !== note.content || savedNote?.title !== note.title || savedNote?.format !== note.format || savedNote?.tags !== note.tags
  const currentReview = dueCards[0]

  return (
    <main className="min-h-screen bg-[#f4f4ef] text-[#262920]">
      <input ref={fileRef} type="file" accept=".md,.markdown,.txt,text/plain,text/markdown" className="hidden" onChange={(event) => void importFile(event.target.files?.[0])} />
      <div className="mx-auto flex min-h-screen max-w-[1600px] flex-col px-4 py-4 sm:px-7 sm:py-6">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-[#e4e5de] pb-4">
          <div className="flex items-center gap-3">
            <div className="grid size-9 place-items-center rounded-xl bg-[#30352a] text-[#f5f4eb]"><Layers3 size={18} /></div>
            <div><p className="text-[15px] font-semibold tracking-tight">recall box</p><p className="text-[10px] tracking-[0.14em] text-[#999b91]">LOCAL KNOWLEDGE STUDIO</p></div>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden items-center gap-2 rounded-full border border-[#e3e4dd] bg-white/70 px-3 py-1.5 text-[11px] text-[#777b6f] sm:flex"><span className="size-1.5 rounded-full bg-[#7e966e]" />仅保存在本机</span>
            <button onClick={() => void openReview()} className={`relative flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm transition ${mode === "review" ? "bg-[#30352a] text-white" : "bg-white text-[#4f5548] hover:bg-[#eceee7]"}`}><Sparkles size={15} />今日复习{stats.due > 0 && <span className="grid min-w-5 place-items-center rounded-full bg-[#dfe8d6] px-1 text-[10px] font-semibold text-[#516248]">{stats.due}</span>}</button>
          </div>
        </header>

        {error && <div className="mt-3 flex items-center justify-between rounded-xl border border-[#efd5ce] bg-[#fff5f1] px-4 py-2.5 text-sm text-[#9b5748]"><span>{error}</span><button onClick={() => setError("")} aria-label="关闭"><X size={15} /></button></div>}

        {mode === "notes" ? (
          <div className="grid min-h-0 flex-1 gap-4 pt-5 lg:grid-cols-[260px_minmax(0,1fr)_300px]">
            <aside className="flex min-h-[220px] flex-col rounded-2xl border border-[#e5e6df] bg-[#fbfbf8] p-3.5 lg:min-h-0">
              <div className="flex items-center justify-between px-1 pb-3"><div><p className="text-xs font-semibold text-[#72766b]">我的笔记</p><p className="mt-1 text-[11px] text-[#a0a297]">{stats.notes} 篇笔记</p></div><button onClick={createNote} title="新建笔记" className="grid size-8 place-items-center rounded-lg bg-[#30352a] text-white hover:bg-[#41473a]"><Plus size={16} /></button></div>
              <label className="flex items-center gap-2 rounded-lg border border-[#e8e9e2] bg-white px-2.5 py-2 text-[#92958b]"><Search size={14} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索笔记" className="w-full bg-transparent text-xs text-[#3f433a] outline-none placeholder:text-[#b2b4aa]" /></label>
              <div className="mt-3 flex-1 space-y-1 overflow-y-auto">
                {loading ? <div className="flex items-center gap-2 px-2 py-5 text-xs text-[#96988f]"><LoaderCircle className="animate-spin" size={14} />正在连接本地数据库…</div> : notes.length === 0 ? <div className="px-2 py-7 text-center"><FileText size={20} className="mx-auto text-[#bdc0b4]" /><p className="mt-2 text-xs text-[#92958b]">还没有笔记</p><p className="mt-1 text-[11px] text-[#b0b2a8]">创建笔记或导入 Markdown / TXT</p></div> : notes.map((item) => <button key={item.id} onClick={() => void loadNote(item.id)} className={`w-full rounded-xl px-3 py-2.5 text-left transition ${note.id === item.id ? "bg-[#e9ece3]" : "hover:bg-[#f0f1eb]"}`}><div className="flex items-start gap-2.5"><FileText size={15} className={`mt-0.5 shrink-0 ${note.id === item.id ? "text-[#68785e]" : "text-[#a4a79d]"}`} /><div className="min-w-0 flex-1"><p className="truncate text-[13px] font-medium text-[#42463d]">{item.title || "未命名笔记"}</p><p className="mt-1 truncate text-[11px] text-[#9b9e93]">{item.content.slice(0, 70).replace(/\n/g, " ") || "空白笔记"}</p></div></div></button>)}
              </div>
              <button onClick={() => fileRef.current?.click()} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-[#d7d9d0] px-3 py-2.5 text-xs text-[#75796e] hover:border-[#aeb5a5] hover:bg-white"><Upload size={14} />导入 Markdown / TXT</button>
            </aside>

            <section className="flex min-h-[520px] min-w-0 flex-col overflow-hidden rounded-2xl border border-[#e5e6df] bg-white shadow-[0_12px_36px_-32px_rgba(47,52,40,.35)] lg:min-h-0">
              {editing || note.id || note.title || note.content ? <>
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#eeefe9] px-5 py-3.5">
                  <div className="flex min-w-0 flex-1 items-center gap-3"><div className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#f0f2ec] text-[#7a8870]"><BookOpen size={17} /></div><div className="min-w-0 flex-1"><input value={note.title} onChange={(event) => setNote({ ...note, title: event.target.value })} placeholder="给笔记起个名字" className="w-full bg-transparent text-[15px] font-semibold tracking-tight text-[#34382f] outline-none placeholder:text-[#b2b4aa]" /><p className="mt-0.5 text-[10px] text-[#a4a69d]">{note.id ? `上次修改 ${formatDate(note.updatedAt)}` : "新笔记 · 尚未保存"}</p></div></div>
                  <div className="flex items-center gap-2"><div className="flex rounded-lg bg-[#f3f4ef] p-0.5"><button onClick={() => setNote({ ...note, format: "markdown" })} className={`rounded-md px-2.5 py-1.5 text-[10px] font-medium ${note.format === "markdown" ? "bg-white text-[#4d5547] shadow-sm" : "text-[#96988e]"}`}>Markdown</button><button onClick={() => setNote({ ...note, format: "text" })} className={`rounded-md px-2.5 py-1.5 text-[10px] font-medium ${note.format === "text" ? "bg-white text-[#4d5547] shadow-sm" : "text-[#96988e]"}`}>纯文本</button></div><button onClick={() => void persistNote().catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "保存失败"))} disabled={saving || !isDirty} className="flex items-center gap-1.5 rounded-lg bg-[#30352a] px-3 py-2 text-xs font-medium text-white transition hover:bg-[#41473a] disabled:cursor-default disabled:bg-[#eef0e9] disabled:text-[#8d9185]">{saving ? <LoaderCircle className="animate-spin" size={13} /> : <Check size={13} />}{saving ? "保存中" : isDirty ? "保存" : "已保存"}</button></div>
                </div>
                <div className="relative flex min-h-0 flex-1 flex-col">
                  <div className="flex items-center justify-between px-6 pt-4 text-[10px] text-[#a6a89e]"><span>编辑器 · 选择文字即可制作复习卡</span><span>Ctrl / ⌘ + S 保存</span></div>
                  <textarea ref={editorRef} value={note.content} onChange={(event) => { setNote({ ...note, content: event.target.value }); setSelection(null) }} onMouseUp={captureSelection} onKeyUp={captureSelection} onSelect={captureSelection} placeholder={note.format === "markdown" ? "从一个想法开始…\n\n支持 Markdown。选中任何一段内容，就能把它变成复习卡片。" : "在这里记录内容…\n\n选中任何一段内容，就能把它变成复习卡片。"} spellCheck={false} className="min-h-0 flex-1 resize-none px-6 pb-8 pt-5 font-mono text-[13px] leading-[1.9] text-[#45493f] outline-none placeholder:font-sans placeholder:text-[#c0c2b9]" />
                  <div className="flex items-center justify-between border-t border-[#f0f0eb] px-5 py-2.5 text-[10px] text-[#a5a79d]"><span>{note.content.length.toLocaleString()} 字符 · {note.content.split(/\s+/).filter(Boolean).length} 词</span>{selection ? <button onMouseDown={(event) => event.preventDefault()} onClick={startCardDraft} className="flex items-center gap-1.5 rounded-lg bg-[#e5ebde] px-3 py-1.5 text-[11px] font-medium text-[#52644a] hover:bg-[#dbe4d2]"><Highlighter size={13} />将选中内容制成卡片</button> : <span>选中一段文字以创建卡片</span>}</div>
                </div>
              </> : <div className="flex flex-1 flex-col items-center justify-center px-8 text-center"><div className="grid size-14 place-items-center rounded-2xl bg-[#f0f2ec] text-[#829078]"><FilePlus2 size={23} /></div><h1 className="mt-5 text-lg font-semibold tracking-tight">把值得记住的内容放进来</h1><p className="mt-2 max-w-sm text-sm leading-6 text-[#85897d]">创建一篇笔记，粘贴或编辑 Markdown 内容，再选中重点生成复习卡片。</p><div className="mt-6 flex gap-2"><button onClick={createNote} className="flex items-center gap-2 rounded-xl bg-[#30352a] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#41473a]"><Plus size={15} />新建笔记</button><button onClick={() => fileRef.current?.click()} className="flex items-center gap-2 rounded-xl border border-[#e2e4dc] bg-white px-4 py-2.5 text-sm text-[#5e6357] hover:bg-[#f8f9f5]"><Upload size={15} />导入文件</button></div></div>}
            </section>

            <aside className="flex min-h-[280px] flex-col rounded-2xl border border-[#e5e6df] bg-[#fbfbf8] p-4 lg:min-h-0">
              <div className="flex items-center justify-between"><div><p className="text-xs font-semibold text-[#686d61]">复习卡片</p><p className="mt-1 text-[11px] text-[#a0a297]">来自当前笔记的重点</p></div><span className="grid size-8 place-items-center rounded-lg bg-[#edf0e8] text-[#7c896f]"><Layers3 size={15} /></span></div>
              {draftCard && <div className="mt-4 rounded-xl border border-[#dfe5d7] bg-white p-3.5 shadow-sm"><div className="flex items-center justify-between"><p className="text-[11px] font-semibold text-[#5d6b53]">新建复习卡</p><button onClick={() => setDraftCard(null)} aria-label="关闭"><X size={14} className="text-[#9da095]" /></button></div><label className="mt-3 block text-[10px] font-medium text-[#8b8e83]">正面 · 回忆提示<textarea value={draftCard.prompt} onChange={(event) => setDraftCard({ ...draftCard, prompt: event.target.value })} rows={3} className="mt-1.5 w-full resize-y rounded-lg border border-[#e9eae4] bg-[#fcfcfa] px-2.5 py-2 text-xs leading-5 text-[#45493f] outline-none focus:border-[#bdc9b3]" /></label><label className="mt-2.5 block text-[10px] font-medium text-[#8b8e83]">背面 · 答案<textarea value={draftCard.answer} onChange={(event) => setDraftCard({ ...draftCard, answer: event.target.value })} rows={3} className="mt-1.5 w-full resize-y rounded-lg border border-[#e9eae4] bg-[#fcfcfa] px-2.5 py-2 text-xs leading-5 text-[#45493f] outline-none focus:border-[#bdc9b3]" /></label><div className="mt-2 rounded-lg bg-[#f5f6f1] px-2.5 py-2 text-[10px] leading-4 text-[#979a8f]">选中的原文会保留为重点锚点，之后可从卡片跳回对应位置。</div><button disabled={busy || !draftCard.answer.trim()} onClick={() => void saveCard()} className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-[#30352a] py-2.5 text-xs font-medium text-white hover:bg-[#41473a] disabled:opacity-50">{busy ? <LoaderCircle className="animate-spin" size={13} /> : <Plus size={13} />}创建复习卡片</button></div>}
              <div className="mt-3 flex-1 space-y-2 overflow-y-auto">
                {!note.id || cards.length === 0 ? <div className="rounded-xl border border-dashed border-[#e1e3dc] px-3 py-8 text-center"><Highlighter size={18} className="mx-auto text-[#b3b7aa]" /><p className="mt-2 text-xs text-[#8e9287]">选中文字生成第一张卡片</p><p className="mt-1 text-[10px] text-[#b0b2a8]">新卡会立即进入复习队列</p></div> : cards.map((card) => <div key={card.id} className="group rounded-xl border border-[#e9eae4] bg-white p-3 transition hover:border-[#d9ded2]"><div className="flex items-start justify-between gap-2"><button disabled={!card.anchorValid} title={card.anchorValid ? "跳转到原文" : "原文已修改，无法定位该重点"} onClick={() => jumpToCard(card)} className="flex min-w-0 items-start gap-2 text-left disabled:cursor-default"><span className={`mt-0.5 size-1.5 shrink-0 rounded-full ${card.anchorValid ? "bg-[#b8c6ac]" : "bg-[#d9b59e]"}`} /><span className="line-clamp-3 text-[11px] leading-[1.65] text-[#676c60]">{card.excerpt}</span></button><button onClick={() => void removeCard(card.id)} aria-label="删除卡片" className="shrink-0 text-[#c0c2b9] opacity-0 transition hover:text-[#b45f51] group-hover:opacity-100"><Trash2 size={13} /></button></div><p className="mt-2 truncate border-t border-[#f0f0eb] pt-2 text-[10px] text-[#a1a398]">{card.prompt || "回忆这段重点"}{!card.anchorValid && <span className="ml-2 text-[#b47e62]">原文已改动</span>}</p></div>)}
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 border-t border-[#e8e9e2] pt-3"><MiniStat label="全部卡片" value={stats.cards} /><MiniStat label="今日复习" value={stats.reviewedToday} /></div>
            </aside>
          </div>
        ) : (
          <section className="flex flex-1 items-center justify-center py-8">
            <div className="w-full max-w-xl overflow-hidden rounded-[24px] border border-[#e4e6dd] bg-white shadow-[0_26px_80px_-55px_rgba(45,51,38,.42)]">
              <div className="flex items-center justify-between border-b border-[#eeefe9] px-5 py-4"><button onClick={() => setMode("notes")} className="flex items-center gap-1.5 text-xs text-[#83877b] hover:text-[#44483e]"><ChevronLeft size={15} />返回笔记</button><span className="text-[11px] text-[#a1a398]">{dueCards.length > 0 ? `${stats.due} 张待复习` : "复习完成"}</span></div>
              {currentReview ? <div className="px-7 py-8 sm:px-10 sm:py-10"><div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.13em] text-[#86927b]"><Sparkles size={14} /> active recall <span className="ml-auto tracking-normal text-[#aaaca2]">{currentReview.noteTitle || "重点卡片"}</span></div><div className="mt-9 min-h-48"><p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[#a7aa9f]">{revealed ? "答案" : "回忆一下"}</p><div className="mt-4 whitespace-pre-wrap text-[20px] font-medium leading-[1.65] tracking-[-0.02em] text-[#35392f]">{revealed ? currentReview.answer || currentReview.excerpt : currentReview.prompt || "回忆这段重点"}</div>{revealed && currentReview.prompt && <p className="mt-5 border-l-2 border-[#dfe5d8] pl-3 text-xs leading-5 text-[#92968a]">{currentReview.prompt}</p>}</div>{!revealed ? <button onClick={() => setRevealed(true)} className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-[#30352a] py-3.5 text-sm font-medium text-white hover:bg-[#41473a]">显示答案<ChevronRight size={16} /></button> : <div className="mt-5"><p className="mb-2.5 text-center text-[10px] text-[#a1a398]">你觉得自己记得怎么样？</p><div className="grid grid-cols-4 gap-2">{([{ label: "忘了", hint: "Again", rating: 1, style: "bg-[#f6e8e2] text-[#a66550] hover:bg-[#f1ddd4]" }, { label: "困难", hint: "Hard", rating: 2, style: "bg-[#f3eee0] text-[#8d7950] hover:bg-[#eee7d4]" }, { label: "记得", hint: "Good", rating: 3, style: "bg-[#e9eee3] text-[#647555] hover:bg-[#dfe7d6]" }, { label: "简单", hint: "Easy", rating: 4, style: "bg-[#e2ece8] text-[#55786b] hover:bg-[#d7e6e0]" }] as const).map((item) => <button key={item.rating} disabled={busy} onClick={() => void rateCard(item.rating)} className={`rounded-xl py-2.5 transition disabled:opacity-50 ${item.style}`}><span className="block text-xs font-semibold">{item.label}</span><span className="mt-0.5 block text-[9px] opacity-70">{item.hint}</span></button>)}</div></div>}<div className="mt-7 flex items-center justify-between border-t border-[#f0f0eb] pt-4 text-[10px] text-[#a4a69b]"><span className="flex items-center gap-1.5"><Clock3 size={12} /> FSRS 会按评分安排下次复习</span><span>{dueCards.length} 张剩余</span></div></div> : <div className="px-7 py-16 text-center sm:px-10"><div className="mx-auto grid size-14 place-items-center rounded-2xl bg-[#e9eee3] text-[#718264]"><Check size={24} /></div><h1 className="mt-5 text-xl font-semibold tracking-tight">今天的复习完成了</h1><p className="mt-2 text-sm text-[#8b8f83]">新卡片和到期卡片会出现在这里。</p><div className="mt-6 flex justify-center gap-2"><button onClick={() => setMode("notes")} className="rounded-xl border border-[#e3e5dd] px-4 py-2.5 text-sm text-[#5b6054] hover:bg-[#f8f9f5]">回到笔记</button><button onClick={createNote} className="flex items-center gap-2 rounded-xl bg-[#30352a] px-4 py-2.5 text-sm text-white hover:bg-[#41473a]"><Plus size={14} />创建笔记</button></div></div>}
            </div>
          </section>
        )}
        <footer className="flex shrink-0 items-center justify-between border-t border-[#e4e5de] pt-3 text-[10px] text-[#aaaca2]"><span>Recall Box · 本地知识复习</span><span className="hidden items-center gap-1.5 sm:flex"><CircleHelp size={11} />内容保存在此设备的 SQLite 数据库</span></footer>
      </div>
      {toast && <div className="fixed bottom-5 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-xl bg-[#30352a] px-4 py-2.5 text-xs text-white shadow-lg"><Check size={14} className="text-[#b8cba9]" />{toast}</div>}
    </main>
  )
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return <div className="rounded-lg bg-[#f3f4ef] px-2.5 py-2"><p className="text-[9px] text-[#999c91]">{label}</p><p className="mt-0.5 text-sm font-semibold text-[#62685a]">{value}</p></div>
}

function formatDate(value: string) {
  if (!value) return "刚刚"
  return new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value))
}

export default App
