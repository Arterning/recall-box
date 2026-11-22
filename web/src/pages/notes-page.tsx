import { useCallback, useEffect, useMemo, useRef, useState, type ClipboardEvent } from "react"
import { BookOpen, Brain, Check, ChevronLeft, ChevronRight, Eye, EyeOff, FilePlus2, FileText, Highlighter, ListTree, LoaderCircle, MessageSquareText, PencilLine, Plus, Search, Trash2, Upload, X } from "lucide-react"
import { api, emptyNote, toErrorMessage, type Annotation, type Card, type Note, type NoteListResult } from "@/lib/api"
import { MarkdownNote, markdownOutline, type PreviewSelection } from "@/components/markdown-note"
import { useSearchParams } from "react-router"

type Selection = PreviewSelection
type CardDraft = { question: string; answer: string }


const reviewPriorityBackgrounds = ["bg-[#f1f4ed]", "bg-[#ebf0e5]", "bg-[#e2ead9]", "bg-[#d6e3ca]", "bg-[#c8d9b8]"]

function noteReviewHint(note: Note) {
  if (!note.reviewEnabled) return undefined
  if (!note.reviewDueAt) return "已加入笔记复习队列"
  const dueAt = new Date(note.reviewDueAt)
  if (Number.isNaN(dueAt.getTime())) return "已加入笔记复习队列"
  if (dueAt.getTime() > Date.now()) return `下次复习：${dueAt.toLocaleDateString("zh-CN")}`
  const overdueDays = Math.floor((Date.now() - dueAt.getTime()) / 86_400_000)
  return overdueDays > 0 ? `已到期，逾期 ${overdueDays} 天` : "今天待复习"
}

export function NotesPage() {
  const [searchParams] = useSearchParams()
  const [notes, setNotes] = useState<Note[]>([])
  const [noteTotal, setNoteTotal] = useState(0)
  const [notesPage, setNotesPage] = useState(1)
  const notesPageSize = 30
  const [note, setNote] = useState<Note>(emptyNote)
  const [cards, setCards] = useState<Card[]>([])
  const [annotations, setAnnotations] = useState<Annotation[]>([])
  const [query, setQuery] = useState("")
  const [selection, setSelection] = useState<Selection | null>(null)
  const [draft, setDraft] = useState<CardDraft | null>(null)
  const [annotationDraft, setAnnotationDraft] = useState<string | null>(null)
  const [pendingAnnotationId, setPendingAnnotationId] = useState<number | null>(null)
  const [savedAnnotationComment, setSavedAnnotationComment] = useState("")
  const [view, setView] = useState<"edit" | "preview">("preview")
  const [editing, setEditing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [toast, setToast] = useState("")
  const [imageUploading, setImageUploading] = useState(false)
  const [showOutline, setShowOutline] = useState(true)
  const [hideAnnotations, setHideAnnotations] = useState(true)
  const [annotationPopover, setAnnotationPopover] = useState<{ item: Annotation; x: number; y: number } | null>(null)
  const [editingPopover, setEditingPopover] = useState(false)
  const [popoverComment, setPopoverComment] = useState("")
  const editorRef = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const outline = useMemo(() => markdownOutline(note.content), [note.content])

  const loadNotes = useCallback(async (search: string, page: number) => {
    setLoading(true)
    const params = new URLSearchParams({ page: String(page), pageSize: String(notesPageSize) })
    if (search.trim()) params.set("q", search.trim())
    try {
      const result = await api<NoteListResult>(`/api/notes?${params}`)
      setNotes(result.items)
      setNoteTotal(result.total)
    } finally {
      setLoading(false)
    }
  }, [])
  const loadCards = useCallback(async (noteId: number) => setCards(await api<Card[]>(`/api/notes/${noteId}/cards`)), [])
  const loadAnnotations = useCallback(async (noteId: number) => setAnnotations(await api<Annotation[]>(`/api/notes/${noteId}/annotations`)), [])

  useEffect(() => {
    const timer = window.setTimeout(() => loadNotes(query, notesPage).catch((cause: unknown) => setError(toErrorMessage(cause, "加载笔记失败"))), 180)
    return () => window.clearTimeout(timer)
  }, [query, notesPage, loadNotes])
  useEffect(() => { setNotesPage(1) }, [query])
  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(""), 2400)
    return () => window.clearTimeout(timer)
  }, [toast])

  const persistNote = useCallback(async () => {
    const isNew = !note.id
    const payload = { title: note.title.trim() || "未命名笔记", content: note.content, format: "markdown", tags: note.tags }
    setSaving(true)
    try {
      const saved = note.id
        ? await api<Note>(`/api/notes/${note.id}`, { method: "PUT", body: JSON.stringify(payload) })
        : await api<Note>("/api/notes", { method: "POST", body: JSON.stringify(payload) })
      setNote(saved)
      setEditing(true)
      await Promise.all([loadCards(saved.id), loadAnnotations(saved.id)])
      const listPage = isNew ? 1 : notesPage
      if (isNew) setNotesPage(1)
      await loadNotes(query, listPage)
      setToast("笔记已保存")
      return saved
    } finally {
      setSaving(false)
    }
  }, [loadAnnotations, loadCards, loadNotes, note, notesPage, query])

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
      setPendingAnnotationId(null)
      setSavedAnnotationComment("")
      setAnnotationPopover(null)
      setView("preview")
      await Promise.all([loadCards(id), loadAnnotations(id)])
    } catch (cause) {
      setError(toErrorMessage(cause, "无法打开笔记"))
    }
  }

  useEffect(() => {
    const requestedID = Number(searchParams.get("noteId"))
    if (requestedID > 0) void openNote(requestedID)
  }, [searchParams])

  const createNote = () => {
    setNote({ ...emptyNote, format: "markdown" })
    setEditing(true)
    setCards([])
    setAnnotations([])
    setSelection(null)
    setDraft(null)
    setAnnotationDraft(null)
    setPendingAnnotationId(null)
    setSavedAnnotationComment("")
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

  const beginAnnotation = async (openEditor: boolean) => {
    if (!selection) return
    setDraft(null)
    setView("preview")
    setBusy(true)
    setError("")
    try {
      const savedNote = await persistNote()
      const annotation = await api<Annotation>(`/api/notes/${savedNote.id}/annotations`, {
        method: "POST",
        body: JSON.stringify({ excerpt: selection.excerpt, sourceText: selection.sourceText, startOffset: selection.start, endOffset: selection.end, comment: "" }),
      })
      setAnnotations((current) => [annotation, ...current])
      setPendingAnnotationId(annotation.id)
      setSavedAnnotationComment("")
      setAnnotationDraft(openEditor ? "" : null)
      if (!openEditor) {
        setSelection(null)
        window.getSelection()?.removeAllRanges()
      }
    } catch (cause) {
      setError(toErrorMessage(cause, "添加批注失败"))
    } finally {
      setBusy(false)
    }
  }

  const cancelAnnotation = async () => {
    if (annotationDraft !== null && annotationDraft !== savedAnnotationComment) await saveAnnotation()
    setPendingAnnotationId(null)
    setAnnotationDraft(null)
    setSelection(null)
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
    if (pendingAnnotationId === null || annotationDraft === null || annotationDraft === savedAnnotationComment) return
    setBusy(true)
    setError("")
    try {
      const annotation = await api<Annotation>(`/api/annotations/${pendingAnnotationId}`, { method: "PUT", body: JSON.stringify({ comment: annotationDraft }) })
      setAnnotations((current) => current.map((item) => item.id === annotation.id ? annotation : item))
      setSavedAnnotationComment(annotation.comment)
      setToast("批注已自动保存")
    } catch (cause) {
      setError(toErrorMessage(cause, "自动保存批注失败"))
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    if (pendingAnnotationId === null || annotationDraft === null || annotationDraft === savedAnnotationComment) return
    const timer = window.setTimeout(() => void saveAnnotation(), 450)
    return () => window.clearTimeout(timer)
  }, [annotationDraft, pendingAnnotationId, savedAnnotationComment])

  const removeNote = async () => {
    if (!note.id || !window.confirm(`确定删除笔记“${note.title || "未命名笔记"}”及其批注和复习卡片吗？`)) return
    setError("")
    try {
      await api<void>(`/api/notes/${note.id}`, { method: "DELETE" })
      setNotes((current) => current.filter((item) => item.id !== note.id))
      setNoteTotal((total) => Math.max(0, total - 1))
      if (notes.length === 1 && notesPage > 1) setNotesPage((page) => page - 1)
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
    } catch (cause) {
      setError(toErrorMessage(cause, "更新批注失败"))
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    if (!annotationPopover || !editingPopover || popoverComment === annotationPopover.item.comment) return
    const timer = window.setTimeout(() => void savePopoverAnnotation(), 450)
    return () => window.clearTimeout(timer)
  }, [annotationPopover, editingPopover, popoverComment])

  const closeAnnotationPopover = async () => {
    if (annotationPopover && editingPopover && popoverComment !== annotationPopover.item.comment) await savePopoverAnnotation()
    setAnnotationPopover(null)
    setEditingPopover(false)
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

  const pasteImage = async (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const files = Array.from(event.clipboardData.items)
      .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
      .map((item) => item.getAsFile())
      .filter((file): file is File => file !== null)
    if (!files.length) return
    event.preventDefault()
    if (imageUploading) return

    const editor = event.currentTarget
    const start = editor.selectionStart
    const end = editor.selectionEnd
    const before = note.content.slice(0, start)
    const after = note.content.slice(end)
    const noteID = note.id
    setImageUploading(true)
    setError("")
    try {
      const references: string[] = []
      for (const [index, file] of files.entries()) {
        const form = new FormData()
        form.append("file", file, file.name || `pasted-image-${index + 1}.png`)
        const response = await fetch("/api/assets", { method: "POST", body: form })
        if (!response.ok) {
          const result = await response.json().catch(() => ({})) as { error?: string }
          throw new Error(result.error || `图片上传失败（${response.status}）`)
        }
        const result = await response.json() as { url: string }
        references.push(`![粘贴图片](${result.url})`)
      }
      const insertion = references.join("\n\n")
      const prefix = before && !before.endsWith("\n\n") ? (before.endsWith("\n") ? "\n" : "\n\n") : ""
      const suffix = after && !after.startsWith("\n\n") ? (after.startsWith("\n") ? "\n" : "\n\n") : ""
      const nextContent = before + prefix + insertion + suffix + after
      setNote((current) => current.id === noteID ? { ...current, content: nextContent } : current)
      requestAnimationFrame(() => {
        editor.focus()
        const caret = before.length + prefix.length + insertion.length + suffix.length
        editor.setSelectionRange(caret, caret)
      })
      setToast("图片已插入笔记")
    } catch (cause) {
      setError(toErrorMessage(cause, "图片上传失败"))
    } finally {
      setImageUploading(false)
    }
  }

  const baseline = notes.find((item) => item.id === note.id)
  const dirty = !note.id || baseline?.content !== note.content || baseline?.title !== note.title || baseline?.tags !== note.tags

  const enrollNoteForReview = async () => {
    if (saving) return
    setError("")
    if (!note.content.trim()) {
      setError("先为笔记添加一些内容，再加入复习。")
      return
    }
    try {
      const saved = dirty ? await persistNote() : note
      const enrolled = saved.reviewEnabled
        ? saved
        : await api<Note>(`/api/notes/${saved.id}/review/enroll`, { method: "POST" })
      setNote(enrolled)
      await loadNotes(query, notesPage)
      setToast("笔记已加入复习队列")
    } catch (cause) {
      setError(toErrorMessage(cause, "无法加入笔记复习"))
    }
  }

  const unenrollNoteFromReview = async () => {
    if (!note.id || saving) return
    if (!window.confirm("将这篇笔记移出复习队列？之后可以随时重新加入。")) return
    setError("")
    try {
      const updated = await api<Note>(`/api/notes/${note.id}/review/enroll`, { method: "DELETE" })
      setNote(updated)
      setNotes((current) => current.map((item) => item.id === updated.id ? updated : item))
      setToast("笔记已移出复习队列，可随时重新加入")
    } catch (cause) {
      setError(toErrorMessage(cause, "移出复习队列失败"))
    }
  }

  return (
    <div className={`grid min-h-[calc(100vh-8.5rem)] gap-4 lg:h-[calc(100vh-11rem)] lg:min-h-[520px] ${showOutline ? "lg:grid-cols-[230px_minmax(0,1fr)_240px]" : "lg:grid-cols-[230px_minmax(0,1fr)]"}`}>
      <input ref={fileRef} type="file" accept=".md,.markdown,.txt,text/plain,text/markdown" className="hidden" onChange={(event) => void importFile(event.target.files?.[0])} />
      <aside className="flex min-h-[190px] flex-col rounded-2xl border border-[#e5e6df] bg-[#fbfbf8] p-3.5 lg:min-h-0">
        <div className="flex items-center justify-between px-1 pb-3"><div><p className="text-xs font-semibold text-[#72766b]">我的笔记</p><p className="mt-1 text-[11px] text-[#a0a297]">{noteTotal} 篇笔记</p></div><div className="flex items-center gap-1.5"><button onClick={() => fileRef.current?.click()} title="导入 Markdown / TXT" aria-label="导入 Markdown / TXT" className="grid size-7 place-items-center rounded-lg border border-[#e5e6df] text-[#777d70] hover:bg-white"><Upload size={14} /></button><button onClick={createNote} title="新建笔记" aria-label="新建笔记" className="grid size-7 place-items-center rounded-lg bg-[#30352a] text-white hover:bg-[#41473a]"><Plus size={15} /></button></div></div>
        <label className="flex items-center gap-2 rounded-lg border border-[#e8e9e2] bg-white px-2.5 py-2 text-[#92958b]"><Search size={14} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索笔记" className="w-full bg-transparent text-xs text-[#3f433a] outline-none placeholder:text-[#b2b4aa]" /></label>
        <div className="mt-3 flex-1 space-y-1 overflow-y-auto">
          {loading ? <div className="px-2 py-5 text-xs text-[#96988f]">正在加载…</div> : notes.length === 0 ? <div className="px-2 py-7 text-center"><FileText size={20} className="mx-auto text-[#bdc0b4]" /><p className="mt-2 text-xs text-[#92958b]">还没有笔记</p><p className="mt-1 text-[11px] text-[#b0b2a8]">新建或导入 Markdown / TXT</p></div> : notes.map((item) => { const priority = item.reviewEnabled ? Math.max(0, Math.min(4, item.reviewPriority ?? 0)) : null; const selected = note.id === item.id; const priorityClass = priority === null ? "" : reviewPriorityBackgrounds[priority]; return <button key={item.id} onClick={() => void openNote(item.id)} title={noteReviewHint(item)} className={`w-full rounded-xl px-3 py-2.5 text-left transition ${priorityClass || (selected ? "bg-[#e9ece3]" : "hover:bg-[#f0f1eb]")} ${priorityClass && selected ? "ring-1 ring-inset ring-[#82936e]" : ""} ${priorityClass ? "hover:brightness-[0.98]" : ""}`}><div className="flex items-start gap-2.5"><FileText size={15} className={`mt-0.5 shrink-0 ${selected ? "text-[#68785e]" : "text-[#a4a79d]"}`} /><div className="min-w-0 flex-1"><p className="truncate text-[13px] font-medium text-[#42463d]">{item.title || "未命名笔记"}</p><p className="mt-1 truncate text-[11px] text-[#9b9e93]">{item.content.slice(0, 70).replace(/\n/g, " ") || "空白笔记"}</p></div></div></button>})}
        </div>
        {noteTotal > 0 && <div className="mt-3 flex items-center justify-between border-t border-[#e9eae4] pt-2.5"><span className="text-[10px] text-[#92958b]">{notesPage} / {Math.max(1, Math.ceil(noteTotal / notesPageSize))}</span><div className="flex gap-1"><button disabled={notesPage <= 1 || loading} onClick={() => setNotesPage((page) => page - 1)} aria-label="上一页笔记" className="grid size-7 place-items-center rounded-lg border border-[#e5e6df] bg-white text-[#666c5d] hover:bg-[#f8f9f5] disabled:opacity-40"><ChevronLeft size={14} /></button><button disabled={notesPage >= Math.ceil(noteTotal / notesPageSize) || loading} onClick={() => setNotesPage((page) => page + 1)} aria-label="下一页笔记" className="grid size-7 place-items-center rounded-lg border border-[#e5e6df] bg-white text-[#666c5d] hover:bg-[#f8f9f5] disabled:opacity-40"><ChevronRight size={14} /></button></div></div>}
      </aside>

      <section className="flex min-h-[520px] min-w-0 flex-col overflow-hidden rounded-2xl border border-[#e5e6df] bg-white shadow-[0_12px_36px_-32px_rgba(47,52,40,.35)] lg:min-h-0">
        {error && <div className="m-3 flex items-center justify-between rounded-lg border border-[#efd5ce] bg-[#fff5f1] px-3 py-2 text-xs text-[#9b5748]">{error}<button onClick={() => setError("")} aria-label="关闭"><X size={14} /></button></div>}
        {editing || note.id || note.title || note.content ? <>
          <div className="border-b border-[#eeefe9]">
            <div className="flex min-w-0 items-center gap-3 px-5 pb-2 pt-3.5">
              <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#f0f2ec] text-[#7a8870]"><BookOpen size={17} /></div>
              <div className="min-w-0 flex-1">
                <input value={note.title} onChange={(event) => setNote({ ...note, title: event.target.value })} placeholder="给笔记起个名字" className="w-full bg-transparent text-lg font-semibold tracking-tight text-[#34382f] outline-none placeholder:text-[#b2b4aa]" />
                <p className="mt-0.5 text-[10px] text-[#a4a69d]">{note.id ? `上次修改 ${formatDate(note.updatedAt)}` : "新笔记 · 尚未保存"}</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 px-5 pb-3">
              <div className="flex flex-wrap items-center gap-1.5">
                <div className="flex rounded-lg bg-[#f3f4ef] p-0.5"><button onClick={() => { setView("edit"); setSelection(null) }} className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[10px] font-medium ${view === "edit" ? "bg-white text-[#4d5547] shadow-sm" : "text-[#96988e]"}`}><PencilLine size={12} />编辑</button><button onClick={() => { setView("preview"); setSelection(null) }} className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[10px] font-medium ${view === "preview" ? "bg-white text-[#4d5547] shadow-sm" : "text-[#96988e]"}`}><Eye size={12} />预览</button></div>
                <button onClick={() => setHideAnnotations((value) => !value)} title={hideAnnotations ? "显示批注原文" : "遮挡批注原文"} className="flex items-center gap-1.5 rounded-lg border border-[#e5e6df] px-2.5 py-2 text-[10px] text-[#74796d] hover:bg-[#f8f9f5]">{hideAnnotations ? <EyeOff size={13} /> : <Eye size={13} />}{hideAnnotations ? "批注遮挡" : "批注可见"}</button>
                <button onClick={() => setShowOutline((value) => !value)} title={showOutline ? "隐藏大纲" : "显示大纲"} aria-label={showOutline ? "隐藏大纲" : "显示大纲"} className={`grid size-8 place-items-center rounded-lg border transition ${showOutline ? "border-[#dce4d5] bg-[#f1f4ed] text-[#607451]" : "border-[#e5e6df] text-[#74796d] hover:bg-[#f8f9f5]"}`}><ListTree size={15} /></button>
              </div>
              <div className="ml-auto flex flex-wrap items-center justify-end gap-1.5">
                {note.id > 0 && (note.reviewEnabled ? <div className="flex items-center gap-1"><span title={note.reviewDueAt ? `下次复习 ${formatDate(note.reviewDueAt)}` : "已加入笔记复习队列"} className="flex items-center gap-1.5 rounded-lg border border-[#dce4d5] bg-[#f1f4ed] px-2.5 py-2 text-[10px] font-medium text-[#607451]"><Brain size={13} />已加入复习</span><button onClick={() => void unenrollNoteFromReview()} disabled={saving} title="移出复习队列" aria-label="移出复习队列" className="grid size-8 place-items-center rounded-lg border border-[#e5e6df] text-[#85897d] hover:bg-[#f8f9f5] disabled:opacity-50"><X size={13} /></button></div> : <button onClick={() => void enrollNoteForReview()} disabled={saving} title="加入 FSRS 笔记复习队列" className="flex items-center gap-1.5 rounded-lg border border-[#dce4d5] bg-[#f7f9f4] px-2.5 py-2 text-[10px] font-medium text-[#607451] hover:bg-[#edf1e8] disabled:opacity-50"><Brain size={13} />加入复习</button>)}
                {note.id > 0 && <button onClick={() => void removeNote()} className="flex items-center gap-1.5 rounded-lg border border-[#f0dcd6] px-3 py-2 text-xs font-medium text-[#a75e4e] hover:bg-[#fff5f1]"><Trash2 size={13} />删除</button>}
                <button onClick={() => void persistNote().catch((cause: unknown) => setError(toErrorMessage(cause, "保存失败")))} disabled={saving || !dirty} className="flex items-center gap-1.5 rounded-lg bg-[#30352a] px-3 py-2 text-xs font-medium text-white transition hover:bg-[#41473a] disabled:cursor-default disabled:bg-[#eef0e9] disabled:text-[#8d9185]">{saving ? <LoaderCircle className="animate-spin" size={13} /> : <Check size={13} />}{saving ? "保存中" : dirty ? "保存" : "已保存"}</button>
              </div>
            </div>
          </div>
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex items-center justify-between px-6 pt-4 text-[10px] text-[#a6a89e]"><span>{view === "edit" ? "Markdown 编辑器 · 选中原文后可批注或创建问答卡" : "预览 · 选择一段内容添加批注或复习卡片"}</span><span>{view === "edit" ? "Ctrl / ⌘ + S 保存" : "点击“编辑”继续修改"}</span></div>
            {view === "edit" ? <textarea ref={editorRef} value={note.content} disabled={imageUploading} onPaste={(event) => void pasteImage(event)} onChange={(event) => { setNote({ ...note, content: event.target.value }); setSelection(null) }} onMouseUp={captureEditorSelection} onKeyUp={captureEditorSelection} onSelect={captureEditorSelection} placeholder="从一个想法开始…\n\n所有笔记都使用 Markdown。选中一段文字，可添加批注或创建复习卡片。也可以粘贴图片。" spellCheck={false} className="min-h-0 flex-1 resize-none px-6 pb-8 pt-5 font-mono text-[13px] leading-[1.9] text-[#45493f] outline-none placeholder:font-sans placeholder:text-[#c0c2b9] disabled:opacity-70" /> : <article className="min-h-0 flex-1 overflow-y-auto px-7 pb-10 pt-5"><MarkdownNote content={note.content} cards={cards} annotations={annotations} onSelect={setSelection} onAnnotationClick={openAnnotation} hideAnnotations={hideAnnotations} /></article>}
            <div className="flex items-center justify-between border-t border-[#f0f0eb] px-5 py-2.5 text-[10px] text-[#a5a79d]"><span>{note.content.length.toLocaleString()} 字符</span>{view === "edit" ? selection ? <span>使用选区菜单添加批注或卡片</span> : <span>选中一段文字以添加批注或卡片</span> : <span>批注会划线显示，悬停可查看</span>}</div>
          </div>
        </> : <div className="flex flex-1 flex-col items-center justify-center px-8 text-center"><div className="grid size-14 place-items-center rounded-2xl bg-[#f0f2ec] text-[#829078]"><FilePlus2 size={23} /></div><h1 className="mt-5 text-lg font-semibold tracking-tight">把值得记住的内容放进来</h1><p className="mt-2 max-w-sm text-sm leading-6 text-[#85897d]">创建一篇笔记，粘贴或导入 Markdown 内容，再选择文字添加批注或复习卡片。</p><div className="mt-6 flex gap-2"><button onClick={createNote} className="flex items-center gap-2 rounded-xl bg-[#30352a] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#41473a]"><Plus size={15} />新建笔记</button><button onClick={() => fileRef.current?.click()} className="flex items-center gap-2 rounded-xl border border-[#e2e4dc] bg-white px-4 py-2.5 text-sm text-[#5e6357] hover:bg-[#f8f9f5]"><Upload size={15} />导入文件</button></div></div>}
      </section>

      {showOutline && <aside className="flex min-h-[260px] flex-col rounded-2xl border border-[#e5e6df] bg-[#fbfbf8] p-4 lg:min-h-0">
        <div className="flex items-center justify-between border-b border-[#e9eae4] pb-3"><div><p className="text-xs font-semibold text-[#686d61]">Markdown 大纲</p><p className="mt-1 text-[11px] text-[#a0a297]">{outline.length} 个标题</p></div><ListTree size={16} className="text-[#7c896f]" /></div>
        {draft && <div className="mt-3 rounded-xl border border-[#dfe5d7] bg-white p-3.5 shadow-sm"><div className="flex items-center justify-between"><p className="text-[11px] font-semibold text-[#5d6b53]">新建复习卡</p><button onClick={() => setDraft(null)} aria-label="关闭"><X size={14} className="text-[#9da095]" /></button></div><p className="mt-3 text-[10px] font-medium text-[#8b8e83]">挖空上下文预览</p><div className="mt-1.5 max-h-32 overflow-y-auto whitespace-pre-wrap rounded-lg border border-[#eee9da] bg-[#fcfaf3] px-2.5 py-2 text-xs leading-5 text-[#635f50]">{draft.question || "（问题为空）"}</div><label className="mt-3 block text-[10px] font-medium text-[#8b8e83]">复习时看到的问题（可编辑）<textarea value={draft.question} onChange={(event) => setDraft({ ...draft, question: event.target.value })} rows={3} className="mt-1.5 w-full resize-y rounded-lg border border-[#e9eae4] bg-[#fcfcfa] px-2.5 py-2 text-xs leading-5 text-[#45493f] outline-none focus:border-[#bdc9b3]" /></label><label className="mt-2.5 block text-[10px] font-medium text-[#8b8e83]">参考答案（选中的重点）<textarea value={draft.answer} onChange={(event) => setDraft({ ...draft, answer: event.target.value })} rows={3} className="mt-1.5 w-full resize-y rounded-lg border border-[#e9eae4] bg-[#fcfcfa] px-2.5 py-2 text-xs leading-5 text-[#45493f] outline-none focus:border-[#bdc9b3]" /></label><p className="mt-2 text-[10px] leading-4 text-[#a0a297]">默认问题会去掉选中的重点，并保留所在段落的其余上下文。</p><button disabled={busy || !draft.question.trim() || !draft.answer.trim()} onClick={() => void saveCard()} className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-[#30352a] py-2.5 text-xs font-medium text-white hover:bg-[#41473a] disabled:opacity-50">{busy ? <LoaderCircle className="animate-spin" size={13} /> : <Plus size={13} />}创建复习卡</button></div>}
        {!draft && <nav className="mt-3 flex-1 space-y-0.5 overflow-y-auto">{outline.length ? outline.map((heading) => <button key={heading.id} onClick={() => jumpToHeading(heading.id)} title={heading.title} className="flex w-full items-center gap-1.5 rounded-lg py-2 pr-2 text-left text-xs text-[#686d61] hover:bg-[#f0f1eb] hover:text-[#41463a]" style={{ paddingLeft: `${8 + (heading.level - 1) * 12}px` }}><ChevronRight size={12} className="shrink-0 text-[#a4aa9a]" /><span className="truncate">{heading.title}</span></button>) : <div className="px-2 py-6 text-center text-xs text-[#9b9e93]">笔记中还没有 Markdown 标题</div>}</nav>}
      </aside>}

      {annotationPopover && <div className="fixed z-50 w-[min(300px,calc(100vw-24px))] overflow-hidden rounded-xl border border-[#e5e6df] bg-white shadow-[0_16px_45px_-18px_rgba(35,39,30,.45)]" style={{ left: annotationPopover.x, top: annotationPopover.y }} onMouseDown={(event) => event.stopPropagation()}><div className="flex items-center justify-between border-b border-[#eeefe9] px-3 py-2"><span className="text-xs font-semibold text-[#686d61]">批注</span><button onClick={() => void closeAnnotationPopover()} aria-label="关闭批注" className="grid size-6 place-items-center rounded-md text-[#85897d] hover:bg-[#f1f2ed]"><X size={13} /></button></div>{editingPopover ? <div className="p-3"><textarea autoFocus value={popoverComment} onChange={(event) => setPopoverComment(event.target.value)} rows={3} placeholder="批注可以留空" className="w-full resize-y rounded-lg border border-[#e5e6df] bg-[#fcfcfa] px-3 py-2 text-sm text-[#45493f] outline-none focus:border-[#bdc9b3]" /><div className="mt-2 flex justify-end gap-1.5"><button disabled={busy} onClick={() => { setEditingPopover(false); setPopoverComment(annotationPopover.item.comment) }} className="rounded-lg border border-[#e2e4dc] px-3 py-1.5 text-xs text-[#74796d]">取消</button><span className="px-2 text-[10px] text-[#8e9287]">输入后自动保存</span></div></div> : <div className="p-3"><p className="whitespace-pre-wrap text-sm leading-6 text-[#45493f]">{annotationPopover.item.comment || <span className="text-[#a1a398]">（空批注）</span>}</p><button onClick={() => setEditingPopover(true)} className="mt-3 flex items-center gap-1.5 rounded-lg border border-[#e5e6df] px-3 py-1.5 text-xs text-[#666c5d] hover:bg-[#f8f9f5]"><PencilLine size={12} />编辑批注</button></div>}</div>}      {selection && !draft && annotationDraft === null && <div className="fixed z-40 w-max rounded-xl border border-[#e3e5dd] bg-white p-1.5 shadow-[0_12px_38px_-18px_rgba(35,39,30,.4)]" style={{ left: Math.max(12, Math.min((selection.right ?? selection.x + 160) - 160, window.innerWidth - 172)), top: Math.max(12, Math.min((selection.bottom ?? selection.y + 48) + 8, window.innerHeight - 184)) }} onMouseDown={(event) => event.preventDefault()}><div className="flex w-40 flex-col gap-0.5"><button onClick={() => void beginAnnotation(true)} className="flex items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-medium text-[#7a6c45] hover:bg-[#f6f2e6]"><MessageSquareText size={14} />批注</button><button disabled={busy} onClick={() => void beginAnnotation(false)} className="flex items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-medium text-[#7a6c45] hover:bg-[#f6f2e6] disabled:opacity-50"><Highlighter size={14} />{busy ? "保存中…" : "划线"}</button><button onClick={beginCard} className="flex items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-medium text-[#57664e] hover:bg-[#edf1e9]"><Plus size={14} />创建复习卡</button><button onClick={() => { setSelection(null); window.getSelection()?.removeAllRanges() }} className="flex items-center gap-2 rounded-lg px-3 py-2 text-left text-xs text-[#85897d] hover:bg-[#f3f4ef]"><X size={14} />取消选中</button></div></div>}
      {selection && annotationDraft !== null && <div className="fixed z-40 w-[min(300px,calc(100vw-24px))] overflow-hidden rounded-xl border border-[#e5e6df] bg-white shadow-[0_12px_38px_-18px_rgba(35,39,30,.4)]" style={{ left: Math.max(12, Math.min((selection.right ?? selection.x + 280) - 288, window.innerWidth - 300)), top: Math.max(12, Math.min((selection.bottom ?? selection.y + 48) + 8, window.innerHeight - 220)) }} onMouseDown={(event) => event.stopPropagation()}><div className="flex items-center justify-between border-b border-[#eeefe9] px-3 py-2"><span className="text-xs font-semibold text-[#686d61]">添加批注</span><button onClick={() => void cancelAnnotation()} aria-label="关闭批注编辑" className="grid size-6 place-items-center rounded-md text-[#85897d] hover:bg-[#f1f2ed]"><X size={13} /></button></div><div className="p-3"><p className="mb-2 line-clamp-2 border-l-2 border-[#d8c98d] pl-2 text-[10px] leading-4 text-[#858273]">{selection.excerpt}</p><textarea autoFocus value={annotationDraft} onChange={(event) => setAnnotationDraft(event.target.value)} rows={3} placeholder="写下你的补充、想法或疑问…（可留空）" className="w-full resize-y rounded-lg border border-[#e9eae4] bg-[#fcfcfa] px-2.5 py-2 text-xs leading-5 text-[#45493f] outline-none focus:border-[#d4c99d]" /><p className="mt-2 text-[10px] text-[#a0a297]">批注已经保存；输入内容会自动保存。</p></div></div>}      {toast && <div className="fixed bottom-5 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-xl bg-[#30352a] px-4 py-2.5 text-xs text-white shadow-lg"><Check size={14} className="text-[#b8cba9]" />{toast}</div>}
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
