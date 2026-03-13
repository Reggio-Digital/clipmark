import { BrowserRouter, Routes, Route, Navigate, Link, useLocation } from 'react-router-dom'
import { useEffect, useState } from 'react'
import Browse from './pages/Browse'
import Search from './pages/Search'
import ShowEpisodes from './pages/ShowEpisodes'
import Create from './pages/Create'
import Gallery from './pages/Gallery'
import Setup from './pages/Setup'
import Login from './pages/Login'
import Admin from './pages/Admin'
import SharedGif from './pages/SharedGif'
import Toast from './components/Toast'
import Favorites from './pages/Favorites'
import { getAuthStatus, logout, UserInfo } from './api/client'

function NavLink({ to, children }: { to: string; children: React.ReactNode }) {
  const location = useLocation()
  const isActive = location.pathname === to || location.pathname.startsWith(to + '/')
  return (
    <Link
      to={to}
      className={`px-4 py-2 rounded-full text-lg font-medium transition-colors ${
        isActive
          ? 'bg-m3-secondary-container text-m3-on-secondary-container'
          : 'text-m3-on-surface-variant hover:text-m3-on-surface hover:bg-m3-surface-container-highest'
      }`}
    >
      {children}
    </Link>
  )
}

function AuthenticatedApp({ user, onLogout, onUserUpdate }: { user: UserInfo; onLogout: () => void; onUserUpdate: (u: UserInfo) => void }) {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-m3-surface-container-high shadow-elevation-1">
        <nav className="container mx-auto px-4 h-16 flex items-center justify-between">
          <Link to="/" className="text-2xl font-medium text-m3-primary">Clipmark</Link>
          <div className="flex gap-1 items-center">
            <NavLink to="/browse">Browse</NavLink>
            <NavLink to="/favorites">Favorites</NavLink>
            <NavLink to="/gallery">Gallery</NavLink>
            <NavLink to="/settings">Settings</NavLink>
            {user.role === 'admin' && (
              <NavLink to="/admin">Admin</NavLink>
            )}
            <div className="flex items-center gap-2 ml-3 pl-3 border-l border-m3-outline-variant">
              {user.thumb && (
                <img src={user.thumb} alt="" className="w-8 h-8 rounded-full" />
              )}
              <span className="text-base text-m3-on-surface-variant">{user.username}</span>
              <button
                onClick={onLogout}
                className="text-m3-on-surface-variant hover:text-m3-primary text-base px-3 py-1.5 rounded-full hover:bg-m3-surface-container-highest transition-colors"
              >
                Sign Out
              </button>
            </div>
          </div>
        </nav>
      </header>
      <main className="container mx-auto px-4 py-6 flex-1">
        <Routes>
          <Route path="/" element={<Navigate to="/browse" replace />} />
          <Route path="/browse" element={<Browse />} />
          <Route path="/browse/:libraryId" element={<Browse />} />
          <Route path="/favorites" element={<Favorites />} />
          <Route path="/search" element={<Search />} />
          <Route path="/shows/:showId" element={<ShowEpisodes />} />
          <Route path="/create/:mediaId" element={<Create />} />
          <Route path="/gallery" element={<Gallery />} />
          <Route path="/settings" element={<Setup user={user} onUserUpdate={onUserUpdate} />} />
          {user.role === 'admin' && (
            <Route path="/admin" element={<Admin />} />
          )}
          <Route path="/s/:token" element={<SharedGif />} />
          <Route path="*" element={<Navigate to="/browse" replace />} />
        </Routes>
      </main>
      <footer className="bg-m3-surface-container-low py-4 mt-8">
        <div className="container mx-auto px-4 text-center text-base text-m3-on-surface-variant">
          <a
            href="https://github.com/Reggio-Digital/clipmark"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-m3-primary transition-colors"
          >
            GitHub
          </a>
          <span className="mx-2 text-m3-outline-variant">·</span>
          <span>Created by </span>
          <a
            href="https://reggiodigital.com"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-m3-primary transition-colors"
          >
            Reggio Digital
          </a>
        </div>
      </footer>
    </div>
  )
}

function App() {
  const [user, setUser] = useState<UserInfo | null>(null)
  const [needsSetup, setNeedsSetup] = useState(false)
  const [loading, setLoading] = useState(true)

  const checkStatus = async () => {
    try {
      const status = await getAuthStatus()
      if (status.authenticated && status.user) {
        setUser(status.user)
        setNeedsSetup(false)
      } else {
        setUser(null)
        setNeedsSetup(status.needs_setup)
      }
    } catch {
      setUser(null)
    }
    setLoading(false)
  }

  useEffect(() => {
    checkStatus()
  }, [])

  const handleLoginSuccess = (loggedInUser: UserInfo) => {
    setUser(loggedInUser)
    setNeedsSetup(false)
  }

  const handleLogout = async () => {
    await logout()
    setUser(null)
    setNeedsSetup(false)
    checkStatus()
  }

  const handleUserUpdate = (updatedUser: UserInfo) => {
    setUser(updatedUser)
  }

  // Shared GIF pages are always accessible (no auth required)
  if (window.location.pathname.startsWith('/s/')) {
    return (
      <BrowserRouter>
        <Routes>
          <Route path="/s/:token" element={<SharedGif />} />
        </Routes>
      </BrowserRouter>
    )
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-m3-primary"></div>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col">
        <header className="bg-m3-surface-container-high shadow-elevation-1">
          <nav className="container mx-auto px-4 h-20 flex items-center justify-between">
            <span className="text-lg font-medium text-m3-primary">Clipmark</span>
            <span className="text-base text-m3-on-surface-variant">{needsSetup ? 'Startup Wizard' : 'Sign In'}</span>
          </nav>
        </header>
        <Login needsSetup={needsSetup} onSuccess={handleLoginSuccess} />
        <footer className="bg-m3-surface-container-low py-4">
          <div className="container mx-auto px-4 text-center text-base text-m3-on-surface-variant">
            <a
              href="https://github.com/Reggio-Digital/clipmark"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-m3-primary transition-colors"
            >
              GitHub
            </a>
            <span className="mx-2 text-m3-outline-variant">·</span>
            <span>Created by </span>
            <a
              href="https://reggiodigital.com"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-m3-primary transition-colors"
            >
              Reggio Digital
            </a>
          </div>
        </footer>
      </div>
    )
  }

  return (
    <BrowserRouter>
      <AuthenticatedApp user={user} onLogout={handleLogout} onUserUpdate={handleUserUpdate} />
      <Toast />
    </BrowserRouter>
  )
}

export default App
