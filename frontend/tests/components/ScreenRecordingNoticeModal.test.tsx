import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import ScreenRecordingNoticeModal from '../../src/components/ScreenRecordingNoticeModal'

/* L'informativa prima della condivisione: le tre cose che vanno dette e il
 * bottone che non dice "Accetto". */

describe('ScreenRecordingNoticeModal', () => {
  it('dice cosa si registra, chi lo guarda e cosa succede interrompendo', () => {
    render(<ScreenRecordingNoticeModal onAccept={vi.fn()} onClose={vi.fn()} />)

    expect(screen.getByText('Questo test registra lo schermo')).toBeInTheDocument()
    expect(screen.getByText('intero schermo')).toBeInTheDocument()
    expect(screen.getByText('consultabile dai formatori')).toBeInTheDocument()
    expect(screen.getByText('interrompi la condivisione')).toBeInTheDocument()
    expect(screen.getByText(/pagina Profilo/)).toBeInTheDocument()
  })

  it('informa e non chiede un consenso', async () => {
    const onAccept = vi.fn()
    render(<ScreenRecordingNoticeModal onAccept={onAccept} onClose={vi.fn()} />)

    const conferma = screen.getByRole('button', { name: 'Ho capito, condividi lo schermo' })
    expect(screen.queryByRole('button', { name: /accetto/i })).toBeNull()
    await userEvent.click(conferma)

    expect(onAccept).toHaveBeenCalled()
  })
})
