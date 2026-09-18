import type { Note } from "../domain/note";

export interface NotesRepository {
  list(): Promise<Note[]>;
  save(notes: Note[]): Promise<void>;
}
