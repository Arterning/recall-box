import { BrowserRouter, Navigate, Route, Routes } from "react-router"
import { AppShell } from "@/components/app-shell"
import { NotesPage } from "@/pages/notes-page"
import { PlaceholderPage } from "@/pages/placeholder-page"
import { ReviewPage } from "@/pages/review-page"

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<Navigate to="/notes" replace />} />
          <Route path="notes" element={<NotesPage />} />
          <Route path="review" element={<ReviewPage />} />
          <Route path="cards" element={<PlaceholderPage page="cards" />} />
          <Route path="statistics" element={<PlaceholderPage page="statistics" />} />
          <Route path="settings" element={<PlaceholderPage page="settings" />} />
          <Route path="*" element={<PlaceholderPage page="not-found" />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App
