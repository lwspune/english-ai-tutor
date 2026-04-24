import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './lib/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import LoginPage from './pages/LoginPage'
import StudentHome from './pages/student/StudentHome'
import ReadingSession from './pages/student/ReadingSession'
import SessionReport from './pages/student/SessionReport'
import ComprehensionQuiz from './pages/student/ComprehensionQuiz'
import StudentProgress from './pages/student/StudentProgress'
import TeacherDashboard from './pages/teacher/TeacherDashboard'
import PassageManager from './pages/teacher/PassageManager'
import StudentDetail from './pages/teacher/StudentDetail'

function RootRedirect() {
  const { profile, loading } = useAuth()
  if (loading) return null
  if (!profile) return <Navigate to="/login" replace />
  if (profile.role === 'teacher') return <Navigate to="/teacher" replace />
  return <Navigate to="/student" replace />
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<ProtectedRoute><RootRedirect /></ProtectedRoute>} />

          <Route path="/student" element={<ProtectedRoute role="student"><StudentHome /></ProtectedRoute>} />
          <Route path="/student/session/:passageId" element={<ProtectedRoute role="student"><ReadingSession /></ProtectedRoute>} />
          <Route path="/student/report/:sessionId" element={<ProtectedRoute role="student"><SessionReport /></ProtectedRoute>} />
          <Route path="/student/comprehension/:sessionId" element={<ProtectedRoute role="student"><ComprehensionQuiz /></ProtectedRoute>} />
          <Route path="/student/progress" element={<ProtectedRoute role="student"><StudentProgress /></ProtectedRoute>} />

          <Route path="/teacher" element={<ProtectedRoute role="teacher"><TeacherDashboard /></ProtectedRoute>} />
          <Route path="/teacher/passages" element={<ProtectedRoute role="teacher"><PassageManager /></ProtectedRoute>} />
          <Route path="/teacher/student/:studentId" element={<ProtectedRoute role="teacher"><StudentDetail /></ProtectedRoute>} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
