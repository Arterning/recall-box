import { useCallback, useEffect, useRef, useState } from "react"
import {
  BookOpen,
  Check,
  Eye,
  FilePlus2,
  FileText,
  Highlighter,
  LoaderCircle,
  PencilLine,
  Plus,
  Search,
  Trash2,
  Upload,
  X,
} from "lucide-react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { api, emptyNote, toErrorMessage, type Card, type Note } from "@/lib/api"

type Selection = { start: number; end: number; text: string }
type CardDraft = { question: string; answer: string }

export function NotesPage() {
  const [notes, setNotes] = useState<Note[]>([])
  const [note, setNote] = useState<Note>(emptyNote)
  const [cards, setCards] = useState<Card[]>([])
  const [query, setQuery] = useState("")
  const [selection, setSelection] = useState<Selection | null>(null)
  const [draft, setDraft] = useState<CardDraft | null>(null)
  const [view, setView] = useState<"edit" | "preview">("edit")
  const [editing, setEditing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [toast, setToast] = useState("")
  const editorRef = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const loadNotes = useCallback(async (search: string) => {
    const result = await api<Note[]>(`/api/notes${search ? `?q=${encodeURIComponent(search)}` : ""}`)
    setNotes(result)
  }, [])

  const loadCards = useCallback(async (noteId: number) => {
    setCards(await api<Card[]>(`/api/notes/${noteId}/cards`))
  }, [])

  useEffect(() => {
    loadNotes("").catch((cause: unknown) => setError(toErrorMessage(cause, "无法加载笔记"))).finally(() => setLoading(false))
  }, [loadNotes])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      loadNotes(query).catch((cause: unknown) => setError(toErrorMessage(cause, "搜索失败")))
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
      await loadCards(saved.id)
      setNotes((current) => [saved, ...current.filter((item) => item.id !== saved.id)].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)))
      setToast("笔记已保存")
      return saved
    } finally {
      setSaving(false)
    }
  }, [loadCards, note])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault()
        void persistNote().catch((cause: unknown) => setError(toErrorMessage(cause, "保存失败")))
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [persistNote])

  const openNote = async (id: number) => {
    setError("")
    try {
      const loaded = await api<Note>(`/api/notes/${id}`)
      setNote(loaded)
      setEditing(true)
      setSelection(null)
      setDraft(null)
      setView("edit")
      await loadCards(id)
    } catch (cause) {
      setError(toErrorMessage(cause, "无法打开笔记"))
    }
  }

  const createNote = () => {
    setNote({ ...emptyNote })
    setEditing(true)
    setCards([])
    setSelection(null)
    setDraft(null)
    setView("edit")
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

  const beginCard = () => {
    if (!selection) return
    setDraft({ question: "这段重点说明了什么？", answer: selection.text })
  }

  const createCard = async () => {
    if (!draft || !selection || !draft.question.trim() || !draft.answer.trim()) return
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
          question: draft.question,
          answer: draft.answer,
        }),
      })
      setCards((current) => [card, ...current])
      setDraft(null)
      setSelection(null)
      setToast("复习卡片已创建")
    } catch (cause) {
      setError(toErrorMessage(cause, "创建卡片失败"))
    } finally {
      setBusy(false)
    }
  }

  const removeCard = async (id: number) => {
    try {
      await api<void>(`/api/cards/${id}`, { method: "DELETE" })
      setCards((current) => current.filter((card) => card.id !== id))
      setToast("卡片已删除")
    } catch (cause) {
      setError(toErrorMessage(cause, "删除失败"))
    }
  }

  const importFile = async (file?: File) => {
    if (!file) return
    try {
      const content = await file.text()
      const format = file.name.toLowerCase().endsWith(".txt") ? "text" : "markdown"
      setNote({ ...emptyNote, title: file.name.replace(/\.(md|markdown|txt)$/i, ""), format, content })
      setCards([])
      setEditing(true)
      setSelection(null)
      setDraft(null)
      setView("edit")
      setToast("文件已载入，保存后加入笔记")
    } catch (cause) {
      setError(toErrorMessage(cause, "读取文件失败"))
    } finally {
      if (fileRef.current) fileRef.current.value = ""
    }
  }

  const jumpToCard = (card: Card) => {
    if (!editorRef.current || !card.anchorValid) return
    setView("edit")
    editorRef.current.focus()
    editorRef.current.setSelectionRange(card.startOffset, card.endOffset)
    setSelection({ start: card.startOffset, end: card.endOffset, text: card.excerpt })
  }

  const baseline = notes.find((item) => item.id === note.id)
  const dirty = !note.id || baseline?.content !== note.content || baseline?.title !== note.title || baseline?.format !== note.format || baseline?.tags !== note.tags

  return (
    <div className="grid min-h-[calc(100vh-8.5rem)] gap-4 lg:grid-cols-[230px_minmax(0,1fr)_270px]">
      <input ref={fileRef} type="file" accept=".md,.markdown,.txt,text/plain,text/markdown" className="hidden" onChange={(event) => void importFile(event.target.files?.[0])} />
      <aside className="flex min-h-[190px] flex-col rounded-2xl border border-[#e5e6df] bg-[#fbfbf8] p-3.5 lg:min-h-0">
        <div className="flex items-center justify-between px-1 pb-3"><div><p className="text-xs font-semibold text-[#72766b]">我的笔记</p><p className="mt-1 text-[11px] text-[#a0a297]">{notes.length} 篇笔记</p></div><button onClick={createNote} title="新建笔记" className="grid size-8 place-items-center rounded-lg bg-[#30352a] text-white hover:bg-[#41473a]"><Plus size={16} /></button></div>
        <label className="flex items-center gap-2 rounded-lg border border-[#e8e9e2] bg-white px-2.5 py-2 text-[#92958b]"><Search size={14} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索笔记" className="w-full bg-transparent text-xs text-[#3f433a] outline-none placeholder:text-[#b2b4aa]" /></label>
        <div className="mt-3 flex-1 space-y-1 overflow-y-auto">
          {loading ? <div className="px-2 py-5 text-xs text-[#96988f]">正在加载…</div> : notes.length === 0 ? <div className="px-2 py-7 text-center"><FileText size={20} className="mx-auto text-[#bdc0b4]" /><p className="mt-2 text-xs text-[#92958b]">还没有笔记</p><p className="mt-1 text-[11px] text-[#b0b2a8]">新建或导入 Markdown / TXT</p></div> : notes.map((item) => <button key={item.id} onClick={() => void openNote(item.id)} className={`w-full rounded-xl px-3 py-2.5 text-left transition ${note.id === item.id ? "bg-[#e9ece3]" : "hover:bg-[#f0f1eb]"}`}><div className="flex items-start gap-2.5"><FileText size={15} className={`mt-0.5 shrink-0 ${note.id === item.id ? "text-[#68785e]" : "text-[#a4a79d]"}`} /><div className="min-w-0 flex-1"><p className="truncate text-[13px] font-medium text-[#42463d]">{item.title || "未命名笔记"}</p><p className="mt-1 truncate text-[11px] text-[#9b9e93]">{item.content.slice(0, 70).replace(/\n/g, " ") || "空白笔记"}</p></div></div></button>)}
        </div>
        <button onClick={() => fileRef.current?.click()} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-[#d7d9d0] px-3 py-2.5 text-xs text-[#75796e] hover:border-[#aeb5a5] hover:bg-white"><Upload size={14} />导入 Markdown / TXT</button>
      </aside>

      <section className="flex min-h-[520px] min-w-0 flex-col overflow-hidden rounded-2xl border border-[#e5e6df] bg-white shadow-[0_12px_36px_-32px_rgba(47,52,40,.35)] lg:min-h-0">
        {error && <div className="m-3 flex items-center justify-between rounded-lg border border-[#efd5ce] bg-[#fff5f1] px-3 py-2 text-xs text-[#9b5748]">{error}<button onClick={() => setError("")} aria-label="关闭"><X size={14} /></button></div>}
        {editing || note.id || note.title || note.content ? <>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#eeefe9] px-5 py-3.5">
            <div className="flex min-w-0 flex-1 items-center gap-3"><div className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#f0f2ec] text-[#7a8870]"><BookOpen size={17} /></div><div className="min-w-0 flex-1"><input value={note.title} onChange={(event) => setNote({ ...note, title: event.target.value })} placeholder="给笔记起个名字" className="w-full bg-transparent text-[15px] font-semibold tracking-tight text-[#34382f] outline-none placeholder:text-[#b2b4aa]" /><p className="mt-0.5 text-[10px] text-[#a4a69d]">{note.id ? `上次修改 ${formatDate(note.updatedAt)}` : "新笔记 · 尚未保存"}</p></div></div>
            <div className="flex items-center gap-2"><div className="flex rounded-lg bg-[#f3f4ef] p-0.5"><button onClick={() => setView("edit")} className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[10px] font-medium ${view === "edit" ? "bg-white text-[#4d5547] shadow-sm" : "text-[#96988e]"}`}><PencilLine size={12} />编辑</button>{note.format === "markdown" && <button onClick={() => setView("preview")} className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[10px] font-medium ${view === "preview" ? "bg-white text-[#4d5547] shadow-sm" : "text-[#96988e]"}`}><Eye size={12} />预览</button>}</div><button onClick={() => setNote({ ...note, format: note.format === "markdown" ? "text" : "markdown" })} className="rounded-lg border border-[#e6e8e0] px-2.5 py-1.5 text-[10px] text-[#85897d]">{note.format === "markdown" ? "Markdown" : "纯文本"}</button><button onClick={() => void persistNote().catch((cause: unknown) => setError(toErrorMessage(cause, "保存失败")))} disabled={saving || !dirty} className="flex items-center gap-1.5 rounded-lg bg-[#30352a] px-3 py-2 text-xs font-medium text-white transition hover:bg-[#41473a] disabled:cursor-default disabled:bg-[#eef0e9] disabled:text-[#8d9185]">{saving ? <LoaderCircle className="animate-spin" size={13} /> : <Check size={13} />}{saving ? "保存中" : dirty ? "保存" : "已保存"}</button></div>
          </div>
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex items-center justify-between px-6 pt-4 text-[10px] text-[#a6a89e]"><span>{view === "edit" ? "Markdown 编辑器 · 选中原文后可创建问答卡" : "Markdown 预览 · 支持 GFM 表格、任务列表和删除线"}</span><span>{view === "edit" ? "Ctrl / ⌘ + S 保存" : "选择“编辑”继续修改"}</span></div>
            {view === "edit" ? <textarea ref={editorRef} value={note.content} onChange={(event) => { setNote({ ...note, content: event.target.value }); setSelection(null) }} onMouseUp={captureSelection} onKeyUp={captureSelection} onSelect={captureSelection} placeholder={note.format === "markdown" ? "从一个想法开始…\n\n支持 Markdown。选中一段文字，就能为它编写复习问题。" : "在这里记录内容…\n\n选中一段文字，就能为它编写复习问题。"} spellCheck={false} className="min-h-0 flex-1 resize-none px-6 pb-8 pt-5 font-mono text-[13px] leading-[1.9] text-[#45493f] outline-none placeholder:font-sans placeholder:text-[#c0c2b9]" /> : <article className="markdown-preview min-h-0 flex-1 overflow-y-auto px-7 pb-10 pt-5 text-[14px] leading-7 text-[#45493f]"><ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml>{note.content || "*还没有内容*"}</ReactMarkdown></article>}
            <div className="flex items-center justify-between border-t border-[#f0f0eb] px-5 py-2.5 text-[10px] text-[#a5a79d]"><span>{note.content.length.toLocaleString()} 字符</span>{view === "edit" ? selection ? <button onMouseDown={(event) => event.preventDefault()} onClick={beginCard} className="flex items-center gap-1.5 rounded-lg bg-[#e5ebde] px-3 py-1.5 text-[11px] font-medium text-[#52644a] hover:bg-[#dbe4d2]"><Highlighter size={13} />为选中段落创建问答卡</button> : <span>选中一段文字以创建卡片</span> : <span>预览模式</span>}</div>
          </div>
        </> : <div className="flex flex-1 flex-col items-center justify-center px-8 text-center"><div className="grid size-14 place-items-center rounded-2xl bg-[#f0f2ec] text-[#829078]"><FilePlus2 size={23} /></div><h1 className="mt-5 text-lg font-semibold tracking-tight">把值得记住的内容放进来</h1><p className="mt-2 max-w-sm text-sm leading-6 text-[#85897d]">创建一篇笔记，粘贴或编辑 Markdown 内容，再选中重点编写复习问题。</p><div className="mt-6 flex gap-2"><button onClick={createNote} className="flex items-center gap-2 rounded-xl bg-[#30352a] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#41473a]"><Plus size={15} />新建笔记</button><button onClick={() => fileRef.current?.click()} className="flex items-center gap-2 rounded-xl border border-[#e2e4dc] bg-white px-4 py-2.5 text-sm text-[#5e6357] hover:bg-[#f8f9f5]"><Upload size={15} />导入文件</button></div></div>}
      </section>

      <aside className="flex min-h-[260px] flex-col rounded-2xl border border-[#e5e6df] bg-[#fbfbf8] p-4 lg:min-h-0">
        <div className="flex items-center justify-between"><div><p className="text-xs font-semibold text-[#686d61]">复习卡片</p><p className="mt-1 text-[11px] text-[#a0a297]">来自当前笔记的重点</p></div><span className="grid size-8 place-items-center rounded-lg bg-[#edf0e8] text-[#7c896f]"><Highlighter size={15} /></span></div>
        {draft && <div className="mt-4 rounded-xl border border-[#dfe5d7] bg-white p-3.5 shadow-sm"><div className="flex items-center justify-between"><p className="text-[11px] font-semibold text-[#5d6b53]">新建问答卡片</p><button onClick={() => setDraft(null)} aria-label="关闭"><X size={14} className="text-[#9da095]" /></button></div><label className="mt-3 block text-[10px] font-medium text-[#8b8e83]">复习时看到的问题<textarea value={draft.question} onChange={(event) => setDraft({ ...draft, question: event.target.value })} rows={3} placeholder="你希望下次复习时回答什么？" className="mt-1.5 w-full resize-y rounded-lg border border-[#e9eae4] bg-[#fcfcfa] px-2.5 py-2 text-xs leading-5 text-[#45493f] outline-none focus:border-[#bdc9b3]" /></label><label className="mt-2.5 block text-[10px] font-medium text-[#8b8e83]">参考答案<textarea value={draft.answer} onChange={(event) => setDraft({ ...draft, answer: event.target.value })} rows={3} placeholder="默认使用选中的段落" className="mt-1.5 w-full resize-y rounded-lg border border-[#e9eae4] bg-[#fcfcfa] px-2.5 py-2 text-xs leading-5 text-[#45493f] outline-none focus:border-[#bdc9b3]" /></label><div className="mt-2 rounded-lg bg-[#f5f6f1] px-2.5 py-2 text-[10px] leading-4 text-[#979a8f]">原文重点会单独保存，复习时可与你的回答对照。</div><button disabled={busy || !draft.question.trim() || !draft.answer.trim()} onClick={() => void createCard()} className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-[#30352a] py-2.5 text-xs font-medium text-white hover:bg-[#41473a] disabled:opacity-50">{busy ? <LoaderCircle className="animate-spin" size={13} /> : <Plus size={13} />}创建复习卡片</button></div>}
        <div className="mt-3 flex-1 space-y-2 overflow-y-auto">
          {!note.id || cards.length === 0 ? <div className="rounded-xl border border-dashed border-[#e1e3dc] px-3 py-8 text-center"><Highlighter size={18} className="mx-auto text-[#b3b7aa]" /><p className="mt-2 text-xs text-[#8e9287]">选中重点，建立问题</p><p className="mt-1 text-[10px] text-[#b0b2a8]">新卡会立即进入复习队列</p></div> : cards.map((card) => <div key={card.id} className="group rounded-xl border border-[#e9eae4] bg-white p-3 transition hover:border-[#d9ded2]"><div className="flex items-start justify-between gap-2"><button disabled={!card.anchorValid} title={card.anchorValid ? "跳转到原文重点" : "原文已修改，无法定位该重点"} onClick={() => jumpToCard(card)} className="flex min-w-0 items-start gap-2 text-left disabled:cursor-default"><span className={`mt-0.5 size-1.5 shrink-0 rounded-full ${card.anchorValid ? "bg-[#b8c6ac]" : "bg-[#d9b59e]"}`} /><span className="line-clamp-3 text-[11px] leading-[1.65] text-[#676c60]">{card.excerpt}</span></button><button onClick={() => void removeCard(card.id)} aria-label="删除卡片" className="shrink-0 text-[#c0c2b9] opacity-0 transition hover:text-[#b45f51] group-hover:opacity-100"><Trash2 size={13} /></button></div><p className="mt-2 line-clamp-2 border-t border-[#f0f0eb] pt-2 text-[10px] text-[#8b8f83]">{card.question}{!card.anchorValid && <span className="ml-2 text-[#b47e62]">原文已改动</span>}</p></div>)}
        </div>
      </aside>

      {toast && <div className="fixed bottom-5 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-xl bg-[#30352a] px-4 py-2.5 text-xs text-white shadow-lg"><Check size={14} className="text-[#b8cba9]" />{toast}</div>}
    </div>
  )
}

function formatDate(value: string) {
  if (!value) return "刚刚"
  return new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value))
}
