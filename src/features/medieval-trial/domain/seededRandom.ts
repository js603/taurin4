export interface RandomSource {
  next(): number;
  int(minInclusive: number, maxInclusive: number): number;
  pick<T>(items: readonly T[]): T;
  shuffle<T>(items: readonly T[]): T[];
}

export class Mulberry32 implements RandomSource {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  next(): number {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  int(minInclusive: number, maxInclusive: number): number {
    if (maxInclusive < minInclusive) {
      throw new Error("invalid integer range");
    }
    const width = maxInclusive - minInclusive + 1;
    return minInclusive + Math.floor(this.next() * width);
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error("cannot pick from empty list");
    return items[this.int(0, items.length - 1)]!;
  }

  shuffle<T>(items: readonly T[]): T[] {
    const copy = [...items];
    for (let index = copy.length - 1; index > 0; index -= 1) {
      const other = this.int(0, index);
      [copy[index], copy[other]] = [copy[other]!, copy[index]!];
    }
    return copy;
  }
}
