import { afterEach, describe, expect, it } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Toast, { showToast } from './Toast'

afterEach(cleanup)

describe('Toast', () => {
  it('renders nothing until a toast is shown', () => {
    const { container } = render(<Toast />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows a message pushed through showToast', () => {
    render(<Toast />)
    act(() => showToast('Something went wrong'))
    expect(screen.getByText('Something went wrong')).toBeInTheDocument()
  })

  it('dismisses a toast when its close button is clicked', async () => {
    const user = userEvent.setup()
    render(<Toast />)
    act(() => showToast('Dismiss me'))

    await user.click(screen.getByRole('button'))
    expect(screen.queryByText('Dismiss me')).not.toBeInTheDocument()
  })
})
