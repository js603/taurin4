import type { NotesRepository } from "../application/notesRepository";
import { runtimeKind } from "../../../shared/runtime/runtime";
import { WebNotesRepository } from "./webNotesRepository";

export async function createNotesRepository(): Promise<NotesRepository> {
  if (runtimeKind() === "web") {
    return new WebNotesRepository();
  }

  const { TauriNotesRepository } = await import("./tauriNotesRepository");
  return new TauriNotesRepository();
}
