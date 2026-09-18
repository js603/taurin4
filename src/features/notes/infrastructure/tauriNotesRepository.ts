import { LazyStore } from "@tauri-apps/plugin-store";
import type { NotesRepository } from "../application/notesRepository";
import { NotesSchema, type Note } from "../domain/note";

const STORE_KEY = "notes";
const store = new LazyStore("app.store.json");

export class TauriNotesRepository implements NotesRepository {
  async list(): Promise<Note[]> {
    const value = await store.get<unknown>(STORE_KEY);
    const parsed = NotesSchema.safeParse(value ?? []);
    return parsed.success ? parsed.data : [];
  }

  async save(notes: Note[]): Promise<void> {
    await store.set(STORE_KEY, notes);
    await store.save();
  }
}
