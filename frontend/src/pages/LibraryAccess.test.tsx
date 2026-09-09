import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Link, MemoryRouter, Route, Routes } from 'react-router'
import Browse from './Browse'
import ShowEpisodes from './ShowEpisodes'
import Search from './Search'
import Create from './Create'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('Plex access errors', () => {
  it.each([
    ['/browse', '/browse', Browse, '/api/libraries', 403, 'Sign in to Plex again to access libraries'],
    ['/browse/2', '/browse/:libraryId', Browse, '/api/libraries/2/items', 404, 'Plex library or media not found'],
    ['/shows/40', '/shows/:showId', ShowEpisodes, '/api/shows/40', 404, 'Plex library or media not found'],
    ['/search?q=Private', '/search', Search, '/api/search', 403, 'Plex access denied. Sign in to Plex again.'],
    ['/create/20', '/create/:mediaId', Create, '/api/media/20', 404, 'Plex library or media not found'],
  ] as const)('displays the API error on %s', async (entry, route, Page, deniedPath, status, detail) => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.startsWith(deniedPath)) {
        return new Response(JSON.stringify({ detail }), { status })
      }
      const data = url === '/api/libraries' || url === '/api/favorites/ids' ? [] : { configured: false }
      return new Response(JSON.stringify(data), { status: 200 })
    }))

    render(
      <MemoryRouter initialEntries={[entry]}>
        <Routes><Route path={route} element={<Page />} /></Routes>
      </MemoryRouter>,
    )

    expect(await screen.findByRole('alert')).toHaveTextContent(detail)
    expect(screen.queryByText('Home Videos')).not.toBeInTheDocument()
  })

  it('clears the denied-library error when returning to the library list', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.startsWith('/api/libraries/2/items')) {
        return new Response(JSON.stringify({ detail: 'Plex library or media not found' }), { status: 404 })
      }
      const data = url === '/api/libraries'
        ? [{ id: '1', title: 'Movies', type: 'movie' }]
        : url === '/api/favorites/ids' ? [] : { configured: false }
      return new Response(JSON.stringify(data), { status: 200 })
    }))

    render(
      <MemoryRouter initialEntries={['/browse/2']}>
        <Link to="/browse">All libraries</Link>
        <Routes>
          <Route path="/browse" element={<Browse />} />
          <Route path="/browse/:libraryId" element={<Browse />} />
        </Routes>
      </MemoryRouter>,
    )

    expect(await screen.findByRole('alert')).toHaveTextContent('Plex library or media not found')
    await userEvent.click(screen.getByText('All libraries'))
    expect(await screen.findByText('Movies')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
