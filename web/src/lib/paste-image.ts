import type { ClipboardEvent } from "react"

export async function uploadClipboardImages(event: ClipboardEvent<HTMLTextAreaElement>) {
  const files = Array.from(event.clipboardData.items)
    .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
    .map((item) => item.getAsFile())
    .filter((file): file is File => file !== null)
  if (files.length === 0) return null

  event.preventDefault()
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
  return references
}
