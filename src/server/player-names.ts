import { randomInt } from 'node:crypto';

const ADJECTIVES = [
  'Amber', 'Brisk', 'Clever', 'Cosmic', 'Electric', 'Feral', 'Golden', 'Lucky',
  'Midnight', 'Neon', 'Quiet', 'Rapid', 'Rogue', 'Rusty', 'Silent', 'Turbo',
  'Velvet', 'Wild', 'Witty', 'Chrome',
] as const;

const NOUNS = [
  'Bandit', 'Bison', 'Comet', 'Coyote', 'Crane', 'Falcon', 'Fox', 'Gator',
  'Hawk', 'Jaguar', 'Lynx', 'Mantis', 'Maverick', 'Panther', 'Raven', 'Rider',
  'Shark', 'Tiger', 'Viper', 'Wolf',
] as const;

/** Generate a short multiplayer name without exposing a player id. */
export function randomPlayerName(usedNames: Iterable<string> = []): string {
  const used = new Set([...usedNames].map(name => name.trim().toLocaleLowerCase()));
  for (let attempt = 0; attempt < 32; attempt++) {
    const name = `${ADJECTIVES[randomInt(ADJECTIVES.length)]} ${NOUNS[randomInt(NOUNS.length)]}`;
    if (!used.has(name.toLocaleLowerCase())) return name;
  }
  return `Player ${randomInt(1000, 10000)}`;
}
