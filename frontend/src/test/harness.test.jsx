import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'

describe('harnais frontend', () => {
  it('rend un composant dans jsdom avec les matchers jest-dom', () => {
    render(<p>Bilan</p>)
    expect(screen.getByText('Bilan')).toBeInTheDocument()
  })
})
