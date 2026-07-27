import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import FormError from './FormError'

describe('FormError', () => {
  it('renders the message inside an alert', () => {
    render(<FormError message="Email non valida" />)
    const alert = screen.getByRole('alert')
    expect(alert).toBeInTheDocument()
    expect(alert).toHaveTextContent('Email non valida')
  })
})
