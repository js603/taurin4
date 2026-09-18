import type { Note } from "../domain/note";
import type { NotesRepository } from "./notesRepository";

export class NotesService {
  constructor(private readonly repository: NotesRepository) {}

  async list(): Promise<Note[]> {
    const notes = await this.repository.list();
    return [...notes].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async add(text: string): Promise<Note[]> {
    const normalized = text.trim();
    if (!normalized) return this.list();

    const notes = await this.repository.list();
    const next: Note[] = [
      {
        id: crypto.randomUUID(),
        text: normalized,
        createdAt: new Date().toISOString()
      },
      ...notes
    ];

    await this.repository.save(next);
    return next;
  }

  async remove(id: string): Promise<Note[]> {
    const notes = await this.repository.list();
    const next = notes.filter((note) => note.id !== id);
    await this.repository.save(next);
    return next;
  }
}
