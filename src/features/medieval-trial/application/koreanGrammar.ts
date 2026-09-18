function hasFinalConsonant(text: string): boolean {
  const last = text.at(-1);
  if (!last) return false;
  const code = last.charCodeAt(0);
  return code >= 0xac00 && code <= 0xd7a3 && (code - 0xac00) % 28 !== 0;
}

export function withParticle(text: string, afterConsonant: string, afterVowel: string): string {
  return `${text}${hasFinalConsonant(text) ? afterConsonant : afterVowel}`;
}

export function joinKoreanAnd(first: string, second: string): string {
  return `${withParticle(first, "과", "와")} ${second}`;
}
