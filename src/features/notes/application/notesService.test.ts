import { describe, expect, it } from "vitest";
import type { Note } from "../domain/note";
import type { NotesRepository } from "./notesRepository";
import { NotesService } from "./notesService";

class MemoryNotesRepository implements NotesRepository {
  constructor(private notes: Note[] = []) {}

  async list(): Promise<Note[]> {
    return structuredClone(this.notes);
  }

  async save(notes: Note[]): Promise<void> {
    this.notes = structuredClone(notes);
  }
}

describe("NotesService", () => {
  it("adds and removes notes", async () => {
    const service = new NotesService(new MemoryNotesRepository());

    const created = await service.add("hello");
    expect(created).toHaveLength(1);
    expect(created[0]?.text).toBe("hello");

    const removed = await service.remove(created[0]!.id);
    expect(removed).toHaveLength(0);
  });
});
