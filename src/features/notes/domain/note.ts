import { z } from "zod";

export const NoteSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
  createdAt: z.string().datetime()
});

export const NotesSchema = z.array(NoteSchema);

export type Note = z.infer<typeof NoteSchema>;
