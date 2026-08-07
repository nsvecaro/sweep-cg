import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import type { Difficulty } from './engine'
import type { SweepTransport } from './net/transport'
import './styles/tokens.css'
import './styles/app.css'

/**
 * Dev-only solo harness. `?local` runs the whole game in memory against bots so the
 * table can be driven from one window; `?local&auto=3&mode=hard` also deals a
 * three-handed table immediately, which is the fast way back to a given screen.
 * `import.meta.env.DEV` is a compile-time constant, so production drops the branch
 * and never pulls LocalTransport into the bundle.
 */
async function devTransport(): Promise<SweepTransport | undefined> {
  const params = new URLSearchParams(location.search)
  if (import.meta.env.DEV && params.has('local')) {
    const { LocalTransport } = await import('./net/localTransport')
    const transport = new LocalTransport()
    if (params.has('auto')) {
      const seats = Math.max(2, Number(params.get('auto')) || 2)
      const passSeats = Number(params.get('pass')) || 0
      await transport.setUsername('Rook', false)
      await transport.createLobby()
      for (let i = 0; i < passSeats; i++) await transport.addLocalPlayer('')
      for (let i = 1 + passSeats; i < seats; i++) await transport.addBot()
      await transport.startGame((params.get('mode') as Difficulty | null) ?? 'medium')
    }
    // Console access for cheats like transport.debugStackHand(9, 4) — dev-only, dropped from prod.
    ;(window as unknown as { transport: LocalTransport }).transport = transport
    return transport
  }
  return undefined
}

void devTransport().then((transport) => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App transport={transport} />
    </StrictMode>,
  )
})
