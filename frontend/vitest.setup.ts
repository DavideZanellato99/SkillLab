// Adds the jest-dom matchers (toBeInTheDocument, toHaveClass, ...) to
// Vitest's expect, and cleans the DOM between tests.
import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

afterEach(() => {
  cleanup()
})
