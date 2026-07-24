import { afterEach, describe, expect, it, vi } from 'vitest'
import { getHealth, getGif, deleteGif } from './client'

function mockFetch(response: Partial<Response> & { json?: () => Promise<unknown> }) {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({}),
    ...response,
  } as Response)
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('fetchJson (via client functions)', () => {
  it('returns parsed JSON on a 2xx response', async () => {
    const payload = { status: 'ok', version: '1.0.0' }
    vi.stubGlobal('fetch', mockFetch({ json: async () => payload }))

    const result = await getHealth()
    expect(result).toMatchObject(payload)
  })

  it('sends the JSON content-type header', async () => {
    const fetchMock = mockFetch({ json: async () => ({}) })
    vi.stubGlobal('fetch', fetchMock)

    await getHealth()

    const [, options] = fetchMock.mock.calls[0]
    expect(options.headers).toMatchObject({ 'Content-Type': 'application/json' })
  })

  it("throws the backend's detail message on a non-2xx response", async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch({
        ok: false,
        status: 404,
        json: async () => ({ detail: 'GIF not found' }),
      }),
    )

    await expect(getGif('missing')).rejects.toThrow('GIF not found')
  })

  it('falls back to a generic message when the error body is not JSON', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch({
        ok: false,
        status: 500,
        json: async () => {
          throw new Error('not json')
        },
      }),
    )

    await expect(getGif('boom')).rejects.toThrow('Request failed')
  })

  it('resolves to undefined on a 204 No Content response', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch({
        status: 204,
        json: async () => {
          throw new Error('204 has no body')
        },
      }),
    )

    await expect(deleteGif('abc')).resolves.toBeUndefined()
  })
})
