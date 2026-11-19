import { useEffect, useState } from "react"
import { ArrowLeft, History, LoaderCircle } from "lucide-react"
import { Link } from "react-router"
import { api, toErrorMessage } from "@/lib/api"

type ReviewHistoryItem = {
  id: number
  cardId: number
  rating: number
  response: string
  reviewedAt: string
  question: string
  excerpt: string
  noteTitle: string
}

const ratingLabels: Record<number, string> = { 1: "忘了", 2: "困难", 3: "记得", 4: "简单" }

export function ReviewHistoryPage() {
  const [items, setItems] = useState<ReviewHistoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    api<ReviewHistoryItem[]>("/api/reviews/history")
      .then(setItems)
      .catch((cause: unknown) => setError(toErrorMessage(cause, "加载复习历史失败")))
      .finally(() => setLoading(false))
  }, [])

  return <div className="mx-auto max-w-4xl">
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3"><div><p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-[#8a957e]">Review history</p><h1 className="mt-1 text-2xl font-semibold tracking-tight text-[#35392f]">提交历史</h1><p className="mt-1 text-sm text-[#898d82]">查看每次复习时提交的回答、评分和卡片内容。</p></div><Link to="/review" className="flex items-center gap-1.5 rounded-xl border border-[#e5e6df] bg-white px-3 py-2.5 text-xs text-[#666c5d] hover:bg-[#f8f9f5]"><ArrowLeft size={14} />返回复习</Link></div>
    {error && <div className="mb-4 rounded-xl border border-[#efd5ce] bg-[#fff5f1] px-4 py-2.5 text-sm text-[#9b5748]">{error}</div>}
    {loading ? <div className="flex min-h-56 items-center justify-center gap-2 text-sm text-[#8e9287]"><LoaderCircle size={17} className="animate-spin" />正在加载提交历史…</div> : items.length ? <div className="space-y-3">{items.map((item) => <article key={item.id} className="rounded-2xl border border-[#e5e6df] bg-white p-5"><div className="flex flex-wrap items-center justify-between gap-2"><p className="truncate text-[11px] text-[#8b907f]">{item.noteTitle || "笔记已删除"} · 卡片 #{item.cardId}</p><div className="flex items-center gap-2"><span className="rounded-full bg-[#eef1e9] px-2.5 py-1 text-[10px] font-medium text-[#647555]">{ratingLabels[item.rating] || `评分 ${item.rating}`}</span><time className="text-[10px] text-[#999c91]">{new Date(item.reviewedAt).toLocaleString("zh-CN", { dateStyle: "medium", timeStyle: "short" })}</time></div></div><h2 className="mt-3 whitespace-pre-wrap text-sm font-medium leading-6 text-[#35392f]">{item.question || item.excerpt || "卡片问题已不可用"}</h2><div className="mt-3 rounded-xl border border-[#e7eadf] bg-[#f8f9f5] p-3.5"><p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-[#8c967f]">我的回答</p><p className="mt-1.5 whitespace-pre-wrap text-sm leading-6 text-[#45493f]">{item.response || "（未填写回答）"}</p></div><details className="mt-3"><summary className="cursor-pointer text-[11px] text-[#85897d]">查看笔记原文重点</summary><p className="mt-2 whitespace-pre-wrap rounded-xl bg-[#fcfaf3] p-3.5 text-sm leading-6 text-[#635f50]">{item.excerpt || "原文不可用"}</p></details></article>)}</div> : <div className="rounded-2xl border border-dashed border-[#dfe2d8] bg-[#fbfbf8] px-6 py-16 text-center"><History size={22} className="mx-auto text-[#8b967f]" /><h2 className="mt-4 text-lg font-semibold text-[#35392f]">还没有提交记录</h2><p className="mt-2 text-sm text-[#85897d]">完成一次复习并评分后，回答会出现在这里。</p><Link to="/review" className="mt-5 inline-flex rounded-xl bg-[#30352a] px-4 py-2.5 text-sm text-white hover:bg-[#41473a]">开始复习</Link></div>}
  </div>
}
