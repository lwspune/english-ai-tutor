import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './lib/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import LandingPage from './pages/LandingPage'
import LoginPage from './pages/LoginPage'
import StudentHome from './pages/student/StudentHome'
import ReadingSession from './pages/student/ReadingSession'
import SessionReport from './pages/student/SessionReport'
import ComprehensionQuiz from './pages/student/ComprehensionQuiz'
import StudentProgress from './pages/student/StudentProgress'
import VocabHome from './pages/student/VocabHome'
import VocabPractice from './pages/student/VocabPractice'
import StumbleDrill from './pages/student/StumbleDrill'
import TeacherDashboard from './pages/teacher/TeacherDashboard'
import PassageManager from './pages/teacher/PassageManager'
import StudentDetail from './pages/teacher/StudentDetail'
import PassageCompletion from './pages/teacher/PassageCompletion'
import AudioReview from './pages/teacher/AudioReview'
import ResetPasswordPage from './pages/ResetPasswordPage'

function RootRoute() {
  const { user, profile, loading } = useAuth()
  if (loading) return null
  // Unauthenticated visitors see the public landing page (waitlist for the
  // NDA-aspirant trial). Logged-in users get redirected to their dashboard.
  if (!user) return <LandingPage />
  if (profile?.role === 'teacher') return <Navigate to="/teacher" replace />
  return <Navigate to="/student" replace />
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/" element={<RootRoute />} />

          <Route path="/student" element={<ProtectedRoute role="student"><StudentHome /></ProtectedRoute>} />
          <Route path="/student/session/:passageId" element={<ProtectedRoute role="student"><ReadingSession /></ProtectedRoute>} />
          <Route path="/student/report/:sessionId" element={<ProtectedRoute role="student"><SessionReport /></ProtectedRoute>} />
          <Route path="/student/comprehension/:sessionId" element={<ProtectedRoute role="student"><ComprehensionQuiz /></ProtectedRoute>} />
          <Route path="/student/progress" element={<ProtectedRoute role="student"><StudentProgress /></ProtectedRoute>} />
          <Route path="/student/vocab" element={<ProtectedRoute role="student"><VocabHome /></ProtectedRoute>} />
          <Route path="/student/vocab/practice" element={<ProtectedRoute role="student"><VocabPractice /></ProtectedRoute>} />
          <Route path="/student/drill/:sessionId/:wordIndex" element={<ProtectedRoute role="student"><StumbleDrill /></ProtectedRoute>} />

          <Route path="/teacher" element={<ProtectedRoute role="teacher"><TeacherDashboard /></ProtectedRoute>} />
          <Route path="/teacher/passages" element={<ProtectedRoute role="teacher"><PassageManager /></ProtectedRoute>} />
          <Route path="/teacher/student/:studentId" element={<ProtectedRoute role="teacher"><StudentDetail /></ProtectedRoute>} />
          <Route path="/teacher/completion" element={<ProtectedRoute role="teacher"><PassageCompletion /></ProtectedRoute>} />
          <Route path="/teacher/audio-review" element={<ProtectedRoute role="teacher"><AudioReview /></ProtectedRoute>} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
