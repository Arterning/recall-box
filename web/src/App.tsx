import { BrowserRouter, Navigate, Route, Routes } from "react-router"
import { AppShell } from "@/components/app-shell"
import { NotesPage } from "@/pages/notes-page"
import { CardsPage } from "@/pages/cards-page"
import { PlaceholderPage } from "@/pages/placeholder-page"
import { ReviewPage } from "@/pages/review-page"
import { ReviewHistoryPage } from "@/pages/review-history-page"
import { StatisticsPage } from "@/pages/statistics-page"
import { SettingsPage } from "@/pages/settings-page"
import { DiaryPage } from "@/pages/diary-page"
import { NoteReviewPage } from "@/pages/note-review-page"

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<Navigate to="/notes" replace />} />
          <Route path="notes" element={<NotesPage />} />
          <Route path="notes/review" element={<NoteReviewPage />} />
          <Route path="review" element={<ReviewPage />} />
          <Route path="review/history" element={<ReviewHistoryPage />} />
          <Route path="cards" element={<CardsPage />} />
          <Route path="diary" element={<DiaryPage />} />
          <Route path="statistics" element={<StatisticsPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="*" element={<PlaceholderPage page="not-found" />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App
