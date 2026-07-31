export const LOBBY_CODE_LENGTH = 5

/** Ambiguous glyphs (0/O, 1/I) are excluded so codes survive being read aloud. */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export function generateLobbyCode(isTaken: (code: string) => boolean): string {
  for (let attempt = 0; attempt < 200; attempt++) {
    let code = ''
    for (let i = 0; i < LOBBY_CODE_LENGTH; i++) {
      code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)]
    }
    if (!isTaken(code)) return code
  }
  throw new Error('Could not allocate a free lobby code')
}

export function normalizeLobbyCode(input: string): string {
  return input.trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
}

export function isValidLobbyCode(input: string): boolean {
  const code = normalizeLobbyCode(input)
  return code.length === LOBBY_CODE_LENGTH && [...code].every((c) => ALPHABET.includes(c))
}
