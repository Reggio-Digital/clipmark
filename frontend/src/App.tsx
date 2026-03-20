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

function NavLink({ to, children, onClick }: { to: string; children: React.ReactNode; onClick?: () => void }) {
  const location = useLocation()
  const isActive = location.pathname === to || location.pathname.startsWith(to + '/')
  return (
    <Link
      to={to}
      onClick={onClick}
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

function MobileMenu({ user, onLogout }: { user: UserInfo; onLogout: () => void }) {
  const [open, setOpen] = useState(false)
  const close = () => setOpen(false)

  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden'
      return () => { document.body.style.overflow = '' }
    }
  }, [open])

  return (
    <div className="md:hidden">
      <button
        onClick={() => setOpen(!open)}
        className="p-2 rounded-md text-m3-on-surface-variant hover:bg-m3-surface-container-highest transition-colors"
        aria-label="Toggle menu"
      >
        {open ? (
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        )}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10 bg-black/50" onClick={close} />
          <div className="fixed top-16 left-0 right-0 z-20 bg-m3-surface-container-high border-t border-m3-outline-variant shadow-elevation-2">
            <div className="flex flex-col p-3 gap-1">
              <NavLink to="/browse" onClick={close}>Browse</NavLink>
              <NavLink to="/favorites" onClick={close}>Favorites</NavLink>
              <NavLink to="/gallery" onClick={close}>Gallery</NavLink>
              <NavLink to="/settings" onClick={close}>Settings</NavLink>
              {user.role === 'admin' && (
                <NavLink to="/admin" onClick={close}>Admin</NavLink>
              )}
              <div className="border-t border-m3-outline-variant mt-2 pt-2 flex items-center justify-between px-4">
                <div className="flex items-center gap-2">
                  {user.thumb && (
                    <img src={user.thumb} alt="" className="w-8 h-8 rounded-full" />
                  )}
                  <span className="text-base text-m3-on-surface-variant">{user.username}</span>
                </div>
                <button
                  onClick={() => { close(); onLogout() }}
                  className="px-3 py-1.5 text-base text-m3-on-surface-variant hover:text-m3-on-surface hover:bg-m3-surface-container-highest rounded-full transition-colors"
                >
                  Sign Out
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function UserMenu({ user, onLogout }: { user: UserInfo; onLogout: () => void }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="relative ml-3 pl-3 border-l border-m3-outline-variant">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-full hover:bg-m3-surface-container-highest transition-colors"
      >
        {user.thumb && (
          <img src={user.thumb} alt="" className="w-8 h-8 rounded-full" />
        )}
        <span className="text-base text-m3-on-surface-variant">{user.username}</span>
        <svg className={`w-4 h-4 text-m3-on-surface-variant transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-1 bg-m3-surface-container-high border border-m3-outline-variant rounded-md shadow-elevation-2 z-20 min-w-[140px]">
            {user.role === 'admin' && (
              <Link
                to="/admin"
                onClick={() => setOpen(false)}
                className="w-full px-3 py-2 text-base text-left hover:bg-m3-surface-container-highest flex items-center gap-2 text-m3-on-surface transition-colors"
              >
                Admin
              </Link>
            )}
            <button
              onClick={() => { setOpen(false); onLogout() }}
              className="w-full px-3 py-2 text-base text-left hover:bg-m3-surface-container-highest flex items-center gap-2 text-m3-on-surface transition-colors"
            >
              Sign Out
            </button>
          </div>
        </>
      )}
    </div>
  )
}

function AuthenticatedApp({ user, onLogout, onUserUpdate }: { user: UserInfo; onLogout: () => void; onUserUpdate: (u: UserInfo) => void }) {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-m3-surface-container-high shadow-elevation-1">
        <nav className="container mx-auto px-4 h-16 flex items-center justify-between">
          <Link to="/" className="text-2xl font-medium text-m3-primary">Clipmark</Link>
          <div className="hidden md:flex gap-1 items-center">
            <NavLink to="/browse">Browse</NavLink>
            <NavLink to="/favorites">Favorites</NavLink>
            <NavLink to="/gallery">Gallery</NavLink>
            <NavLink to="/settings">Settings</NavLink>
            <UserMenu user={user} onLogout={onLogout} />
          </div>
          <MobileMenu user={user} onLogout={onLogout} />
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
