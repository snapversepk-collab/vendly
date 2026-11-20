import { lazy, Suspense, type ReactNode } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/AppShell'
import { FullPageSpinner, RequireAuth, useAuth } from './lib/auth'

const Landing = lazy(() => import('./pages/Landing'))
const SignUp = lazy(() => import('./pages/SignUp'))
const SignIn = lazy(() => import('./pages/SignIn'))
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'))
const ResetPassword = lazy(() => import('./pages/ResetPassword'))
const AcceptInvite = lazy(() => import('./pages/AcceptInvite'))
const SetupTrade = lazy(() => import('./pages/SetupTrade'))
const SetupServices = lazy(() => import('./pages/SetupServices'))
const SetupPage = lazy(() => import('./pages/SetupPage'))
const Today = lazy(() => import('./pages/Today'))
const Calendar = lazy(() => import('./pages/Calendar'))
const Agenda = lazy(() => import('./pages/Agenda'))
const Reports = lazy(() => import('./pages/Reports'))
const BookingDetail = lazy(() => import('./pages/BookingDetail'))
const NewBooking = lazy(() => import('./pages/NewBooking'))
const QuoteEditor = lazy(() => import('./pages/QuoteEditor'))
const Inquiries = lazy(() => import('./pages/Inquiries'))
const Settings = lazy(() => import('./pages/Settings'))
const Upgrade = lazy(() => import('./pages/Upgrade'))
const ClientBookingPage = lazy(() => import('./pages/ClientBookingPage'))
const ClientQuote = lazy(() => import('./pages/ClientQuote'))
const ClientReceipt = lazy(() => import('./pages/ClientReceipt'))

const M = ['owner', 'manager'] as const

/** Signed-in users skip the landing / sign-in pages */
function PublicOnly({ children }: { children: ReactNode }) {
  const { loading, user } = useAuth()
  if (loading) return <FullPageSpinner />
  return user ? <Navigate to="/today" replace /> : <>{children}</>
}

export default function App() {
  return (
    <Suspense fallback={<FullPageSpinner />}>
      <Routes>
        <Route path="/" element={<PublicOnly><Landing /></PublicOnly>} />
        <Route path="/signup" element={<PublicOnly><SignUp /></PublicOnly>} />
        <Route path="/signin" element={<PublicOnly><SignIn /></PublicOnly>} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/invite/:token" element={<AcceptInvite />} />

        {/* Client pages: no login, reached through links */}
        <Route path="/b/:handle" element={<ClientBookingPage />} />
        <Route path="/q/:token" element={<ClientQuote />} />
        <Route path="/r/:token" element={<ClientReceipt />} />

        {/* Setup wizard (owner) */}
        <Route path="/setup/trade" element={<RequireAuth roles={['owner']}><SetupTrade /></RequireAuth>} />
        <Route path="/setup/services" element={<RequireAuth roles={['owner']}><SetupServices /></RequireAuth>} />
        <Route path="/setup/page" element={<RequireAuth roles={['owner']}><SetupPage /></RequireAuth>} />

        {/* App */}
        <Route element={<RequireAuth><AppShell /></RequireAuth>}>
          <Route path="/today" element={<Today />} />
          <Route path="/calendar" element={<Calendar />} />
          <Route path="/agenda" element={<Agenda />} />
          <Route path="/bookings/:id" element={<BookingDetail />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/bookings/new" element={<RequireAuth roles={[...M]}><NewBooking /></RequireAuth>} />
          <Route path="/bookings/:id/quote" element={<RequireAuth roles={[...M]}><QuoteEditor /></RequireAuth>} />
          <Route path="/inquiries" element={<RequireAuth roles={[...M]}><Inquiries /></RequireAuth>} />
          <Route path="/inquiries/:id" element={<RequireAuth roles={[...M]}><Inquiries /></RequireAuth>} />
          <Route path="/reports" element={<RequireAuth roles={[...M]}><Reports /></RequireAuth>} />
          <Route path="/upgrade" element={<RequireAuth roles={['owner']}><Upgrade /></RequireAuth>} />
        </Route>
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  )
}

function NotFound() {
  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 16 }}>
      <div className="stack" style={{ alignItems: 'center', textAlign: 'center' }}>
        <h1 className="h-page">Page not found</h1>
        <p className="muted">This link doesn't go anywhere.</p>
        <a className="btn btn-primary" href="/">Go home</a>
      </div>
    </div>
  )
}
