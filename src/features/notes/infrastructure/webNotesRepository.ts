import { NotesSchema, type Note } from "../domain/note";
import type { NotesRepository } from "../application/notesRepository";

const STORAGE_KEY = "vibe-starter.notes";

export class WebNotesRepository implements NotesRepository {
  async list(): Promise<Note[]> {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];

    try {
      return NotesSchema.parse(JSON.parse(raw));
    } catch {
      return [];
    }
  }

  async save(notes: Note[]): Promise<void> {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
  }
}
