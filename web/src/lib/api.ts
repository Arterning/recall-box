export type Note = {
  id: number
  title: string
  content: string
  format: "markdown" | "text"
  tags: string
  updatedAt: string
}
export type NoteListResult = { items: Note[]; total: number; page: number; pageSize: number }
export type DiaryEntry = { id: number; date: string; content: string; createdAt: string; updatedAt: string }
export type DiarySummary = { id: number; date: string; excerpt: string; updatedAt: string }

export type Card = {
  id: number
  noteId?: number | null
  excerpt: string
  startOffset: number
  endOffset: number
  anchorValid: boolean
  question: string
  answer: string
  dueAt: string | null
  createdAt: string
  noteTitle?: string
  noteFormat?: "markdown" | "text"
}

export type Annotation = {
  id: number
  noteId?: number
  cardId?: number
  field?: "question" | "answer" | "context"
  excerpt: string
  startOffset: number
  endOffset: number
  comment: string
  anchorValid: boolean
  createdAt: string
}

export type Stats = { notes: number; cards: number; due: number; reviewedToday: number }
export type CardListResult = { items: Card[]; total: number; dueCount: number; page: number; pageSize: number }

export const emptyNote: Note = {
  id: 0,
  title: "",
  content: "",
  format: "markdown",
  tags: "",
  updatedAt: "",
}

export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  })
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error || `Request failed (${response.status})`)
  }
  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

export function toErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
}
