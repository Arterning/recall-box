import { useEffect, useState } from "react"
import { Bot, Check, LoaderCircle, SlidersHorizontal } from "lucide-react"
import { api, toErrorMessage } from "@/lib/api"

export function SettingsPage() {
  const [retention, setRetention] = useState(90)
  const [savedRetention, setSavedRetention] = useState(90)
  const [aiBaseURL, setAIBaseURL] = useState("")
  const [aiAPIKey, setAIAPIKey] = useState("")
  const [aiModel, setAIModel] = useState("")
  const [aiAPIKeyConfigured, setAIAPIKeyConfigured] = useState(false)
  const [clearAIAPIKey, setClearAIAPIKey] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")

  useEffect(() => {
    api<{ desiredRetention: number; aiBaseURL: string; aiModel: string; aiAPIKeyConfigured: boolean }>("/api/settings")
      .then((settings) => {
        const percent = Math.round(settings.desiredRetention * 100)
        setRetention(percent)
        setSavedRetention(percent)
        setAIBaseURL(settings.aiBaseURL || "")
        setAIModel(settings.aiModel || "")
        setAIAPIKeyConfigured(settings.aiAPIKeyConfigured)
      })
      .catch((cause: unknown) => setError(toErrorMessage(cause, "加载设置失败")))
      .finally(() => setLoading(false))
  }, [])

  const save = async () => {
    setSaving(true)
    setError("")
    setMessage("")
    try {
      const settings = await api<{ desiredRetention: number }>("/api/settings", {
        method: "PUT",
        body: JSON.stringify({ desiredRetention: retention / 100 }),
      })
      const percent = Math.round(settings.desiredRetention * 100)
      setRetention(percent)
      setSavedRetention(percent)
      setMessage("目标记忆保留率已保存")
    } catch (cause) {
      setError(toErrorMessage(cause, "保存设置失败"))
    } finally {
      setSaving(false)
    }
  }

  const saveAI = async () => {
    setSaving(true)
    setError("")
    setMessage("")
    try {
      const settings = await api<{ aiAPIKeyConfigured: boolean }>("/api/settings", {
        method: "PUT",
        body: JSON.stringify({ desiredRetention: retention / 100, aiBaseURL, aiModel, aiAPIKey, clearAIAPIKey }),
      })
      setAIAPIKey("")
      setAIAPIKeyConfigured(settings.aiAPIKeyConfigured)
      setClearAIAPIKey(false)
      setMessage("AI 配置已保存")
    } catch (cause) {
      setError(toErrorMessage(cause, "保存 AI 配置失败"))
    } finally {
      setSaving(false)
    }
  }

  return <div className="mx-auto max-w-3xl">
    <div className="mb-6"><p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-[#8a957e]">Preferences</p><h1 className="mt-1 text-2xl font-semibold tracking-tight text-[#35392f]">设置</h1><p className="mt-1 text-sm text-[#898d82]">调整 FSRS 复习调度。</p></div>
    {error && <div className="mb-4 rounded-xl border border-[#efd5ce] bg-[#fff5f1] px-4 py-2.5 text-sm text-[#9b5748]">{error}</div>}
    {message && <div className="mb-4 rounded-xl border border-[#dfe5d7] bg-[#f4f7f0] px-4 py-2.5 text-sm text-[#687b58]">{message}</div>}

    <section className="rounded-2xl border border-[#e5e6df] bg-white p-5 sm:p-6">
      <div className="flex items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#edf0e8] text-[#758469]"><SlidersHorizontal size={18} /></span><div><h2 className="text-sm font-semibold text-[#45493f]">目标记忆保留率</h2><p className="mt-1 text-xs leading-5 text-[#8b8f83]">FSRS 用这个目标计算每张卡片的下次复习时间。</p></div></div>
      {loading ? <div className="flex min-h-36 items-center justify-center gap-2 text-sm text-[#8e9287]"><LoaderCircle size={16} className="animate-spin" />正在读取设置…</div> : <>
        <div className="mt-7 flex items-end justify-between"><div><span className="text-4xl font-semibold tracking-tight text-[#35392f]">{retention}%</span><p className="mt-1 text-[11px] text-[#92968b]">希望卡片到期时仍能成功回忆的比例</p></div><span className="rounded-full bg-[#f1f3ed] px-2.5 py-1 text-[10px] text-[#737b68]">默认 90%</span></div>
        <input aria-label="目标记忆保留率" type="range" min={70} max={97} step={1} value={retention} onChange={(event) => { setRetention(Number(event.target.value)); setMessage("") }} className="mt-6 w-full accent-[#788b68]" />
        <div className="flex justify-between text-[10px] text-[#a0a297]"><span>70% · 复习较少</span><span>90% · 推荐起点</span><span>97% · 复习较多</span></div>
        <div className="mt-5 rounded-xl border border-[#e8eae3] bg-[#fbfbf8] p-4 text-xs leading-5 text-[#777c70]">提高目标保留率通常会缩短复习间隔、增加复习量；降低则会减少复习量，但更容易忘记。调整后只用于之后的评分调度，不会立即重排已有卡片的到期时间。</div>
        <div className="mt-5 flex justify-end"><button onClick={() => void save()} disabled={saving || retention === savedRetention} className="flex min-w-28 items-center justify-center gap-2 rounded-xl bg-[#30352a] px-4 py-2.5 text-xs font-medium text-white hover:bg-[#41473a] disabled:cursor-default disabled:bg-[#eef0e9] disabled:text-[#8d9185]">{saving ? <LoaderCircle size={14} className="animate-spin" /> : <Check size={14} />}{saving ? "保存中" : "保存设置"}</button></div>
      </>}
    </section>

    <section className="mt-4 rounded-2xl border border-[#e5e6df] bg-white p-5 sm:p-6">
      <div className="flex items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#edf0e8] text-[#758469]"><Bot size={18} /></span><div><h2 className="text-sm font-semibold text-[#45493f]">AI 服务</h2><p className="mt-1 text-xs leading-5 text-[#8b8f83]">配置兼容 OpenAI API 格式的服务。密钥保存在本机，不会在读取设置时返回。</p></div></div>
      <div className="mt-6 grid gap-4">
        <label className="block text-xs font-medium text-[#686d61]">API 地址<input value={aiBaseURL} onChange={(event) => setAIBaseURL(event.target.value)} placeholder="https://api.openai.com/v1" className="mt-1.5 w-full rounded-xl border border-[#e5e6df] bg-[#fcfcfa] px-3.5 py-2.5 text-sm text-[#45493f] outline-none focus:border-[#bdc9b3]" /></label>
        <label className="block text-xs font-medium text-[#686d61]">模型名称<input value={aiModel} onChange={(event) => setAIModel(event.target.value)} placeholder="例如 gpt-4o-mini" className="mt-1.5 w-full rounded-xl border border-[#e5e6df] bg-[#fcfcfa] px-3.5 py-2.5 text-sm text-[#45493f] outline-none focus:border-[#bdc9b3]" /></label>
        <label className="block text-xs font-medium text-[#686d61]">API Key<input type="password" autoComplete="new-password" value={aiAPIKey} onChange={(event) => setAIAPIKey(event.target.value)} placeholder={aiAPIKeyConfigured ? "已配置；留空表示保持不变" : "输入 API Key"} className="mt-1.5 w-full rounded-xl border border-[#e5e6df] bg-[#fcfcfa] px-3.5 py-2.5 text-sm text-[#45493f] outline-none focus:border-[#bdc9b3]" /></label>
        {aiAPIKeyConfigured && <label className="flex items-center gap-2 text-xs text-[#8b5e50]"><input type="checkbox" checked={clearAIAPIKey} onChange={(event) => setClearAIAPIKey(event.target.checked)} />清除已保存的 API Key</label>}
      </div>
      <div className="mt-5 flex justify-end"><button onClick={() => void saveAI()} disabled={saving} className="flex min-w-28 items-center justify-center gap-2 rounded-xl bg-[#30352a] px-4 py-2.5 text-xs font-medium text-white hover:bg-[#41473a] disabled:opacity-50">{saving ? <LoaderCircle size={14} className="animate-spin" /> : <Check size={14} />}保存 AI 配置</button></div>
    </section>
  </div>
}
