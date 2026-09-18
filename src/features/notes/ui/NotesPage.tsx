import { useEffect, useMemo, useState } from "react";
import type { Note } from "../domain/note";
import { NotesService } from "../application/notesService";
import { createNotesRepository } from "../infrastructure/createNotesRepository";

export function NotesPage() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [text, setText] = useState("");
  const [service, setService] = useState<NotesService | null>(null);

  useEffect(() => {
    let cancelled = false;

    void createNotesRepository().then(async (repository) => {
      if (cancelled) return;
      const nextService = new NotesService(repository);
      setService(nextService);
      setNotes(await nextService.list());
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const countLabel = useMemo(() => `${notes.length}개`, [notes.length]);

  async function addNote() {
    if (!service) return;
    const next = await service.add(text);
    setNotes(next);
    setText("");
  }

  async function removeNote(id: string) {
    if (!service) return;
    setNotes(await service.remove(id));
  }

  return (
    <section className="panel">
      <div className="notes-toolbar">
        <div>
          <h2>Notes</h2>
          <p>같은 UI, 다른 저장소 어댑터 · {countLabel}</p>
        </div>
      </div>

      <div className="note-form">
        <input
          className="input"
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void addNote();
          }}
          placeholder="메모를 입력하세요"
          aria-label="새 메모"
        />
        <button className="button" onClick={() => void addNote()} disabled={!service}>
          추가
        </button>
      </div>

      <div className="note-list">
        {notes.length === 0 ? (
          <p className="empty">아직 메모가 없습니다.</p>
        ) : (
          notes.map((note) => (
            <article className="note-card" key={note.id}>
              <div className="note-card__top">
                <time>{new Date(note.createdAt).toLocaleString()}</time>
                <button
                  className="button button--ghost"
                  onClick={() => void removeNote(note.id)}
                >
                  삭제
                </button>
              </div>
              <p>{note.text}</p>
            </article>
          ))
        )}
      </div>
    </section>
  );
}
