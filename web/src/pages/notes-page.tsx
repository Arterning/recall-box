import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { BookOpen, Check, ChevronRight, Eye, EyeOff, FilePlus2, FileText, Highlighter, ListTree, LoaderCircle, MessageSquareText, PencilLine, Plus, Search, Trash2, Upload, X } from "lucide-react"
import { api, emptyNote, toErrorMessage, type Annotation, type Card, type Note } from "@/lib/api"
import { MarkdownNote, markdownOutline, type PreviewSelection } from "@/components/markdown-note"

type Selection = PreviewSelection
type CardDraft = { question: string; answer: string }

export function NotesPage() {
  const [notes, setNotes] = useState<Note[]>([])
  const [note, setNote] = useState<Note>(emptyNote)
  const [cards, setCards] = useState<Card[]>([])
  const [annotations, setAnnotations] = useState<Annotation[]>([])
  const [query, setQuery] = useState("")
  const [selection, setSelection] = useState<Selection | null>(null)
  const [draft, setDraft] = useState<CardDraft | null>(null)
  const [annotationDraft, setAnnotationDraft] = useState<string | null>(null)
  const [pendingAnnotationId, setPendingAnnotationId] = useState<number | null>(null)
  const [view, setView] = useState<"edit" | "preview">("preview")
  const [editing, setEditing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [toast, setToast] = useState("")
  const [showOutline, setShowOutline] = useState(true)
  const [hideAnnotations, setHideAnnotations] = useState(true)
  const [annotationPopover, setAnnotationPopover] = useState<{ item: Annotation; x: number; y: number } | null>(null)
  const [editingPopover, setEditingPopover] = useState(false)
  const [popoverComment, setPopoverComment] = useState("")
  const editorRef = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const outline = useMemo(() => markdownOutline(note.content), [note.content])

  const loadNotes = useCallback(async (search: string) => {
    setNotes(await api<Note[]>(`/api/notes${search ? `?q=${encodeURIComponent(search)}` : ""}`))
  }, [])
  const loadCards = useCallback(async (noteId: number) => setCards(await api<Card[]>(`/api/notes/${noteId}/cards`)), [])
  const loadAnnotations = useCallback(async (noteId: number) => setAnnotations(await api<Annotation[]>(`/api/notes/${noteId}/annotations`)), [])

  useEffect(() => {
    loadNotes("").catch((cause: unknown) => setError(toErrorMessage(cause, "无法加载笔记"))).finally(() => setLoading(false))
  }, [loadNotes])
  useEffect(() => {
    const timer = window.setTimeout(() => loadNotes(query).catch((cause: unknown) => setError(toErrorMessage(cause, "搜索失败"))), 180)
    return () => window.clearTimeout(timer)
  }, [query, loadNotes])
  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(""), 2400)
    return () => window.clearTimeout(timer)
  }, [toast])

  const persistNote = useCallback(async () => {
    const payload = { title: note.title.trim() || "未命名笔记", content: note.content, format: "markdown", tags: note.tags }
    setSaving(true)
    try {
      const saved = note.id
        ? await api<Note>(`/api/notes/${note.id}`, { method: "PUT", body: JSON.stringify(payload) })
        : await api<Note>("/api/notes", { method: "POST", body: JSON.stringify(payload) })
      setNote(saved)
      setEditing(true)
      await Promise.all([loadCards(saved.id), loadAnnotations(saved.id)])
      setNotes((current) => [saved, ...current.filter((item) => item.id !== saved.id)].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)))
      setToast("笔记已保存")
      return saved
    } finally {
      setSaving(false)
    }
  }, [loadAnnotations, loadCards, note])

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
      setAnnotationDraft(null)
      setAnnotationPopover(null)
      setView("preview")
      await Promise.all([loadCards(id), loadAnnotations(id)])
    } catch (cause) {
      setError(toErrorMessage(cause, "无法打开笔记"))
    }
  }

  const createNote = () => {
    setNote({ ...emptyNote, format: "markdown" })
    setEditing(true)
    setCards([])
    setAnnotations([])
    setSelection(null)
    setDraft(null)
    setAnnotationDraft(null)
    setAnnotationPopover(null)
    setView("edit")
  }

  const captureEditorSelection = () => {
    const editor = editorRef.current
    if (!editor) return
    const start = editor.selectionStart
    const end = editor.selectionEnd
    if (end <= start) {
      setSelection(null)
      return
    }
    const sourceText = note.content.slice(start, end)
    const rect = editor.getBoundingClientRect()
    setSelection({ start, end, excerpt: sourceText, sourceText, x: Math.max(16, Math.min(window.innerWidth - 280, rect.left + 100)), y: Math.max(10, rect.top + 55) })
  }

  const beginCard = () => {
    if (!selection) return
    setAnnotationDraft(null)
    setDraft({ question: makeClozeQuestion(note.content, selection.start, selection.end), answer: selection.excerpt })
  }

  const beginAnnotation = () => {
    if (!selection) return
    setDraft(null)
    setView("preview")
    const id = -Date.now()
    setPendingAnnotationId(id)
    setAnnotations((current) => [{ id, noteId: note.id, excerpt: selection.excerpt, startOffset: selection.start, endOffset: selection.end, comment: "", anchorValid: true, createdAt: new Date().toISOString() }, ...current])
    setAnnotationDraft("")
  }

  const cancelAnnotation = () => {
    if (pendingAnnotationId !== null) setAnnotations((current) => current.filter((item) => item.id !== pendingAnnotationId))
    setPendingAnnotationId(null)
    setAnnotationDraft(null)
  }

  const saveCard = async () => {
    if (!draft || !selection || !draft.question.trim() || !draft.answer.trim()) return
    setBusy(true)
    setError("")
    try {
      const savedNote = await persistNote()
      const card = await api<Card>(`/api/notes/${savedNote.id}/cards`, {
        method: "POST",
        body: JSON.stringify({ excerpt: selection.excerpt, sourceText: selection.sourceText, startOffset: selection.start, endOffset: selection.end, question: draft.question, answer: draft.answer }),
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

  const saveAnnotation = async () => {
    if (!selection || annotationDraft === null) return
    setBusy(true)
    setError("")
    try {
      const savedNote = await persistNote()
      const annotation = await api<Annotation>(`/api/notes/${savedNote.id}/annotations`, {
        method: "POST",
        body: JSON.stringify({ excerpt: selection.excerpt, sourceText: selection.sourceText, startOffset: selection.start, endOffset: selection.end, comment: annotationDraft }),
      })
      setAnnotations((current) => [annotation, ...current.filter((item) => item.id !== pendingAnnotationId)])
      setPendingAnnotationId(null)
      setAnnotationDraft(null)
      setSelection(null)
      setToast("批注已保存，原文已划线")
    } catch (cause) {
      setError(toErrorMessage(cause, "保存批注失败"))
    } finally {
      setBusy(false)
    }
  }

  const removeNote = async () => {
    if (!note.id || !window.confirm(`确定删除笔记“${note.title || "未命名笔记"}”及其批注和复习卡片吗？`)) return
    setError("")
    try {
      await api<void>(`/api/notes/${note.id}`, { method: "DELETE" })
      setNotes((current) => current.filter((item) => item.id !== note.id))
      setNote(emptyNote)
      setCards([])
      setAnnotations([])
      setEditing(false)
      setSelection(null)
      setToast("笔记已删除")
    } catch (cause) {
      setError(toErrorMessage(cause, "删除笔记失败"))
    }
  }

  const openAnnotation = (id: number, rect: DOMRect) => {
    const item = annotations.find((annotation) => annotation.id === id)
    if (!item) return
    setAnnotationPopover({ item, x: Math.max(12, Math.min(rect.left, window.innerWidth - 312)), y: Math.max(12, Math.min(rect.bottom + 8, window.innerHeight - 240)) })
    setPopoverComment(item.comment)
    setEditingPopover(false)
    setSelection(null)
  }

  const savePopoverAnnotation = async () => {
    if (!annotationPopover) return
    setBusy(true)
    try {
      const updated = await api<Annotation>(`/api/annotations/${annotationPopover.item.id}`, { method: "PUT", body: JSON.stringify({ comment: popoverComment }) })
      setAnnotations((current) => current.map((item) => item.id === updated.id ? updated : item))
      setAnnotationPopover({ ...annotationPopover, item: updated })
      setPopoverComment(updated.comment)
      setEditingPopover(false)
    } catch (cause) {
      setError(toErrorMessage(cause, "更新批注失败"))
    } finally {
      setBusy(false)
    }
  }

  const jumpToHeading = (id: string) => {
    if (view !== "preview") setView("preview")
    window.setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" }), 0)
  }

  const importFile = async (file?: File) => {
    if (!file) return
    try {
      const content = await file.text()
      setNote({ ...emptyNote, title: file.name.replace(/\.(md|markdown|txt)$/i, ""), format: "markdown", content })
      setCards([])
      setAnnotations([])
      setEditing(true)
      setSelection(null)
      setDraft(null)
      setAnnotationDraft(null)
      setView("preview")
      setToast("文件已载入，保存后加入笔记")
    } catch (cause) {
      setError(toErrorMessage(cause, "读取文件失败"))
    } finally {
      if (fileRef.current) fileRef.current.value = ""
    }
  }

  const baseline = notes.find((item) => item.id === note.id)
  const dirty = !note.id || baseline?.content !== note.content || baseline?.title !== note.title || baseline?.tags !== note.tags

  return (
    <div className={`grid min-h-[calc(100vh-8.5rem)] gap-4 lg:h-[calc(100vh-11rem)] lg:min-h-[520px] ${showOutline ? "lg:grid-cols-[230px_minmax(0,1fr)_240px]" : "lg:grid-cols-[230px_minmax(0,1fr)]"}`}>
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
            <div className="flex items-center gap-2"><div className="flex rounded-lg bg-[#f3f4ef] p-0.5"><button onClick={() => { setView("edit"); setSelection(null) }} className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[10px] font-medium ${view === "edit" ? "bg-white text-[#4d5547] shadow-sm" : "text-[#96988e]"}`}><PencilLine size={12} />编辑</button><button onClick={() => { setView("preview"); setSelection(null) }} className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[10px] font-medium ${view === "preview" ? "bg-white text-[#4d5547] shadow-sm" : "text-[#96988e]"}`}><Eye size={12} />预览</button></div><button onClick={() => setHideAnnotations((value) => !value)} title={hideAnnotations ? "显示批注原文" : "遮挡批注原文"} className="flex items-center gap-1.5 rounded-lg border border-[#e5e6df] px-2.5 py-2 text-[10px] text-[#74796d] hover:bg-[#f8f9f5]">{hideAnnotations ? <EyeOff size={13} /> : <Eye size={13} />}{hideAnnotations ? "批注遮挡" : "批注可见"}</button><button onClick={() => setShowOutline((value) => !value)} title={showOutline ? "隐藏大纲" : "显示大纲"} className="flex items-center gap-1.5 rounded-lg border border-[#e5e6df] px-2.5 py-2 text-[10px] text-[#74796d] hover:bg-[#f8f9f5]"><ListTree size={13} />{showOutline ? "隐藏大纲" : "显示大纲"}</button>{note.id > 0 && <button onClick={() => void removeNote()} className="flex items-center gap-1.5 rounded-lg border border-[#f0dcd6] px-3 py-2 text-xs font-medium text-[#a75e4e] hover:bg-[#fff5f1]"><Trash2 size={13} />删除</button>}<button onClick={() => void persistNote().catch((cause: unknown) => setError(toErrorMessage(cause, "保存失败")))} disabled={saving || !dirty} className="flex items-center gap-1.5 rounded-lg bg-[#30352a] px-3 py-2 text-xs font-medium text-white transition hover:bg-[#41473a] disabled:cursor-default disabled:bg-[#eef0e9] disabled:text-[#8d9185]">{saving ? <LoaderCircle className="animate-spin" size={13} /> : <Check size={13} />}{saving ? "保存中" : dirty ? "保存" : "已保存"}</button></div>
          </div>
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex items-center justify-between px-6 pt-4 text-[10px] text-[#a6a89e]"><span>{view === "edit" ? "Markdown 编辑器 · 选中原文后可批注或创建问答卡" : "预览 · 选择一段内容添加批注或复习卡片"}</span><span>{view === "edit" ? "Ctrl / ⌘ + S 保存" : "点击“编辑”继续修改"}</span></div>
            {view === "edit" ? <textarea ref={editorRef} value={note.content} onChange={(event) => { setNote({ ...note, content: event.target.value }); setSelection(null) }} onMouseUp={captureEditorSelection} onKeyUp={captureEditorSelection} onSelect={captureEditorSelection} placeholder="从一个想法开始…\n\n所有笔记都使用 Markdown。选中一段文字，可添加批注或创建复习卡片。" spellCheck={false} className="min-h-0 flex-1 resize-none px-6 pb-8 pt-5 font-mono text-[13px] leading-[1.9] text-[#45493f] outline-none placeholder:font-sans placeholder:text-[#c0c2b9]" /> : <article className="min-h-0 flex-1 overflow-y-auto px-7 pb-10 pt-5"><MarkdownNote content={note.content} cards={cards} annotations={annotations} onSelect={setSelection} onAnnotationClick={openAnnotation} hideAnnotations={hideAnnotations} /></article>}
            <div className="flex items-center justify-between border-t border-[#f0f0eb] px-5 py-2.5 text-[10px] text-[#a5a79d]"><span>{note.content.length.toLocaleString()} 字符</span>{view === "edit" ? selection ? <span>使用选区菜单添加批注或卡片</span> : <span>选中一段文字以添加批注或卡片</span> : <span>批注会划线显示，悬停可查看</span>}</div>
          </div>
        </> : <div className="flex flex-1 flex-col items-center justify-center px-8 text-center"><div className="grid size-14 place-items-center rounded-2xl bg-[#f0f2ec] text-[#829078]"><FilePlus2 size={23} /></div><h1 className="mt-5 text-lg font-semibold tracking-tight">把值得记住的内容放进来</h1><p className="mt-2 max-w-sm text-sm leading-6 text-[#85897d]">创建一篇笔记，粘贴或导入 Markdown 内容，再选择文字添加批注或复习卡片。</p><div className="mt-6 flex gap-2"><button onClick={createNote} className="flex items-center gap-2 rounded-xl bg-[#30352a] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#41473a]"><Plus size={15} />新建笔记</button><button onClick={() => fileRef.current?.click()} className="flex items-center gap-2 rounded-xl border border-[#e2e4dc] bg-white px-4 py-2.5 text-sm text-[#5e6357] hover:bg-[#f8f9f5]"><Upload size={15} />导入文件</button></div></div>}
      </section>

      {showOutline && <aside className="flex min-h-[260px] flex-col rounded-2xl border border-[#e5e6df] bg-[#fbfbf8] p-4 lg:min-h-0">
        <div className="flex items-center justify-between border-b border-[#e9eae4] pb-3"><div><p className="text-xs font-semibold text-[#686d61]">Markdown 大纲</p><p className="mt-1 text-[11px] text-[#a0a297]">{outline.length} 个标题</p></div><ListTree size={16} className="text-[#7c896f]" /></div>
        {draft && <div className="mt-3 rounded-xl border border-[#dfe5d7] bg-white p-3.5 shadow-sm"><div className="flex items-center justify-between"><p className="text-[11px] font-semibold text-[#5d6b53]">新建复习卡</p><button onClick={() => setDraft(null)} aria-label="关闭"><X size={14} className="text-[#9da095]" /></button></div><p className="mt-3 text-[10px] font-medium text-[#8b8e83]">挖空上下文预览</p><div className="mt-1.5 max-h-32 overflow-y-auto whitespace-pre-wrap rounded-lg border border-[#eee9da] bg-[#fcfaf3] px-2.5 py-2 text-xs leading-5 text-[#635f50]">{draft.question || "（问题为空）"}</div><label className="mt-3 block text-[10px] font-medium text-[#8b8e83]">复习时看到的问题（可编辑）<textarea value={draft.question} onChange={(event) => setDraft({ ...draft, question: event.target.value })} rows={3} className="mt-1.5 w-full resize-y rounded-lg border border-[#e9eae4] bg-[#fcfcfa] px-2.5 py-2 text-xs leading-5 text-[#45493f] outline-none focus:border-[#bdc9b3]" /></label><label className="mt-2.5 block text-[10px] font-medium text-[#8b8e83]">参考答案（选中的重点）<textarea value={draft.answer} onChange={(event) => setDraft({ ...draft, answer: event.target.value })} rows={3} className="mt-1.5 w-full resize-y rounded-lg border border-[#e9eae4] bg-[#fcfcfa] px-2.5 py-2 text-xs leading-5 text-[#45493f] outline-none focus:border-[#bdc9b3]" /></label><p className="mt-2 text-[10px] leading-4 text-[#a0a297]">默认问题会去掉选中的重点，并保留所在段落的其余上下文。</p><button disabled={busy || !draft.question.trim() || !draft.answer.trim()} onClick={() => void saveCard()} className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-[#30352a] py-2.5 text-xs font-medium text-white hover:bg-[#41473a] disabled:opacity-50">{busy ? <LoaderCircle className="animate-spin" size={13} /> : <Plus size={13} />}创建复习卡</button></div>}
        {annotationDraft !== null && <div className="mt-3 rounded-xl border border-[#e8dfc8] bg-white p-3.5 shadow-sm"><div className="flex items-center justify-between"><p className="text-[11px] font-semibold text-[#887b58]">添加批注</p><button onClick={cancelAnnotation} aria-label="关闭"><X size={14} className="text-[#9da095]" /></button></div><p className="mt-2 line-clamp-3 border-l-2 border-[#d8c98d] pl-2 text-[10px] leading-4 text-[#858273]">{selection?.excerpt}</p><textarea autoFocus value={annotationDraft} onChange={(event) => setAnnotationDraft(event.target.value)} rows={3} placeholder="写下你的补充、想法或疑问…（可留空）" className="mt-2 w-full resize-y rounded-lg border border-[#e9eae4] bg-[#fcfcfa] px-2.5 py-2 text-xs leading-5 text-[#45493f] outline-none focus:border-[#d4c99d]" /><button disabled={busy} onClick={() => void saveAnnotation()} className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg bg-[#82764f] py-2.5 text-xs font-medium text-white hover:bg-[#726744] disabled:opacity-50">{busy ? <LoaderCircle className="animate-spin" size={13} /> : <Check size={13} />}保存批注</button></div>}
        {!draft && annotationDraft === null && <nav className="mt-3 flex-1 space-y-0.5 overflow-y-auto">{outline.length ? outline.map((heading) => <button key={heading.id} onClick={() => jumpToHeading(heading.id)} title={heading.title} className="flex w-full items-center gap-1.5 rounded-lg py-2 pr-2 text-left text-xs text-[#686d61] hover:bg-[#f0f1eb] hover:text-[#41463a]" style={{ paddingLeft: `${8 + (heading.level - 1) * 12}px` }}><ChevronRight size={12} className="shrink-0 text-[#a4aa9a]" /><span className="truncate">{heading.title}</span></button>) : <div className="px-2 py-6 text-center text-xs text-[#9b9e93]">笔记中还没有 Markdown 标题</div>}</nav>}
      </aside>}

      {annotationPopover && <div className="fixed z-50 w-[min(300px,calc(100vw-24px))] overflow-hidden rounded-xl border border-[#e5e6df] bg-white shadow-[0_16px_45px_-18px_rgba(35,39,30,.45)]" style={{ left: annotationPopover.x, top: annotationPopover.y }} onMouseDown={(event) => event.stopPropagation()}><div className="flex items-center justify-between border-b border-[#eeefe9] px-3 py-2"><span className="text-xs font-semibold text-[#686d61]">批注</span><button onClick={() => { setAnnotationPopover(null); setEditingPopover(false) }} aria-label="关闭批注" className="grid size-6 place-items-center rounded-md text-[#85897d] hover:bg-[#f1f2ed]"><X size={13} /></button></div>{editingPopover ? <div className="p-3"><textarea autoFocus value={popoverComment} onChange={(event) => setPopoverComment(event.target.value)} rows={3} placeholder="批注可以留空" className="w-full resize-y rounded-lg border border-[#e5e6df] bg-[#fcfcfa] px-3 py-2 text-sm text-[#45493f] outline-none focus:border-[#bdc9b3]" /><div className="mt-2 flex justify-end gap-1.5"><button disabled={busy} onClick={() => { setEditingPopover(false); setPopoverComment(annotationPopover.item.comment) }} className="rounded-lg border border-[#e2e4dc] px-3 py-1.5 text-xs text-[#74796d]">取消</button><button disabled={busy} onClick={() => void savePopoverAnnotation()} className="rounded-lg bg-[#30352a] px-3 py-1.5 text-xs text-white disabled:opacity-50">{busy ? "保存中…" : "保存修改"}</button></div></div> : <div className="p-3"><p className="whitespace-pre-wrap text-sm leading-6 text-[#45493f]">{annotationPopover.item.comment || <span className="text-[#a1a398]">（空批注）</span>}</p><button onClick={() => setEditingPopover(true)} className="mt-3 flex items-center gap-1.5 rounded-lg border border-[#e5e6df] px-3 py-1.5 text-xs text-[#666c5d] hover:bg-[#f8f9f5]"><PencilLine size={12} />编辑批注</button></div>}</div>}      {selection && !draft && annotationDraft === null && <div className="fixed z-40 flex items-center gap-1 rounded-xl border border-[#e3e5dd] bg-white p-1.5 shadow-[0_12px_38px_-18px_rgba(35,39,30,.4)]" style={{ left: selection.x, top: selection.y }} onMouseDown={(event) => event.preventDefault()}><button onClick={beginAnnotation} className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium text-[#7a6c45] hover:bg-[#f6f2e6]"><MessageSquareText size={14} />批注</button><span className="h-5 w-px bg-[#ecece6]" /><button onClick={beginCard} className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium text-[#57664e] hover:bg-[#edf1e9]"><Highlighter size={14} />创建复习卡</button><button onClick={() => setSelection(null)} aria-label="关闭" className="grid size-7 place-items-center rounded-lg text-[#a1a398] hover:bg-[#f3f4ef]"><X size={13} /></button></div>}
      {toast && <div className="fixed bottom-5 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-xl bg-[#30352a] px-4 py-2.5 text-xs text-white shadow-lg"><Check size={14} className="text-[#b8cba9]" />{toast}</div>}
    </div>
  )
}

function makeClozeQuestion(content: string, start: number, end: number) {
  if (start < 0 || end <= start || end > content.length) return "［选中内容］"
  const previousParagraphBreak = content.lastIndexOf("\n\n", Math.max(0, start - 1))
  const nextParagraphBreak = content.indexOf("\n\n", end)
  const paragraphStart = previousParagraphBreak < 0 ? 0 : previousParagraphBreak + 2
  const paragraphEnd = nextParagraphBreak < 0 ? content.length : nextParagraphBreak
  const before = content.slice(paragraphStart, start).trim()
  const after = content.slice(end, paragraphEnd).trim()
  if (!before && !after) return "［选中内容］"
  return `${before} ［　］ ${after}`.trim()
}

function formatDate(value: string) {
  if (!value) return "刚刚"
  return new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value))
}
