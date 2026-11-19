import { useEffect, useState } from "react"
import { ArrowUpRight, Check, Circle, Command, Layers3, Sparkles } from "lucide-react"

type Health = { status: string; time: string }

export function App() {
  const [health, setHealth] = useState<Health | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let active = true
    fetch("http://127.0.0.1:34115/api/health")
      .then((response) => {
        if (!response.ok) throw new Error("API unavailable")
        return response.json() as Promise<Health>
      })
      .then((result) => active && setHealth(result))
      .catch(() => active && setError(true))
    return () => { active = false }
  }, [])

  return (
    <main className="min-h-svh bg-[#f7f7f5] px-8 py-7 text-[#252722] sm:px-14 sm:py-10">
      <div className="mx-auto flex min-h-[calc(100svh-5rem)] max-w-5xl flex-col">
        <header className="flex items-center justify-between">
          <a href="#" className="flex items-center gap-2.5 font-semibold tracking-tight">
            <span className="grid size-9 place-items-center rounded-xl bg-[#242820] text-white"><Layers3 size={18} /></span>
            recall box
          </a>
          <span className="flex items-center gap-2 rounded-full border border-black/8 bg-white/70 px-3 py-1.5 text-xs text-[#73766d]"><Command size={13} /> desktop workspace</span>
        </header>
        <section className="my-auto grid gap-14 py-20 md:grid-cols-[1.1fr_0.9fr] md:items-center">
          <div>
            <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-[#e9eee4] px-3 py-1.5 text-xs font-medium text-[#53634c]"><Sparkles size={14} /> Your ideas, in one place</div>
            <h1 className="max-w-xl text-5xl font-medium leading-[1.08] tracking-[-0.055em] sm:text-6xl">A little space<br />for <span className="text-[#819176]">what matters.</span></h1>
            <p className="mt-6 max-w-md text-base leading-7 text-[#73766d]">Recall Box is ready for its first thought. This starter brings your web interface and Go service together in one desktop app.</p>
            <button className="mt-8 inline-flex items-center gap-2 rounded-xl bg-[#252820] px-5 py-3 text-sm font-medium text-white transition hover:bg-[#40443a]">Start building <ArrowUpRight size={16} /></button>
          </div>
          <div className="rounded-[1.75rem] border border-black/6 bg-white p-6 shadow-[0_22px_70px_-45px_rgba(35,39,30,0.28)] sm:p-8">
            <div className="flex items-start justify-between"><div><p className="text-sm font-medium">Project status</p><p className="mt-1 text-xs text-[#92948d]">Everything in its place</p></div><span className="grid size-10 place-items-center rounded-xl bg-[#f2f3ef] text-[#66715e]"><Layers3 size={18} /></span></div>
            <div className="mt-7 divide-y divide-black/6">
              <StatusRow label="Desktop shell" detail="Wails window" ok />
              <StatusRow label="Web interface" detail="React · Tailwind CSS" ok />
              <StatusRow label="Go HTTP API" detail={error ? "Not reachable" : health ? "Connected · 127.0.0.1:34115" : "Connecting…"} ok={!!health} pending={!health && !error} />
            </div>
            <div className="mt-6 rounded-xl bg-[#f7f7f5] px-4 py-3.5"><p className="text-xs leading-5 text-[#777a71]">A clean starting point. Add your own data, screens, and workflows whenever you&apos;re ready.</p></div>
          </div>
        </section>
        <footer className="flex items-center justify-between border-t border-black/8 pt-5 text-[11px] text-[#92948d]"><span>Made for ideas worth keeping.</span><span>GO · WAILS · REACT</span></footer>
      </div>
    </main>
  )
}

function StatusRow({ label, detail, ok, pending }: { label: string; detail: string; ok: boolean; pending?: boolean }) {
  return <div className="flex items-center justify-between py-4"><div><p className="text-sm font-medium">{label}</p><p className="mt-1 text-xs text-[#92948d]">{detail}</p></div><span className={`grid size-7 place-items-center rounded-full ${ok ? "bg-[#edf2e9] text-[#697a60]" : pending ? "bg-[#f4f3ed] text-[#a29b7e]" : "bg-[#f8ece9] text-[#a77263]"}`}>{ok ? <Check size={14} /> : <Circle size={12} />}</span></div>
}

export default App
