const ADJECTIVES = [
  'Brisk', 'Crooked', 'Velvet', 'Iron', 'Quiet', 'Lucky', 'Restless', 'Golden',
  'Hollow', 'Sly', 'Midnight', 'Feral', 'Copper', 'Vagrant', 'Bitter', 'Swift',
]

const NOUNS = [
  'Magpie', 'Dealer', 'Jackal', 'Sparrow', 'Vulture', 'Fox', 'Marlin', 'Crow',
  'Otter', 'Wolf', 'Heron', 'Bandit', 'Mantis', 'Badger', 'Falcon', 'Ferret',
]

export const MAX_USERNAME_LENGTH = 16

export function randomUsername(): string {
  const adjective = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)]
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)]
  return `${adjective}${noun}`
}

export function sanitizeUsername(input: string): string {
  return input.replace(/\s+/g, ' ').trim().slice(0, MAX_USERNAME_LENGTH)
}
