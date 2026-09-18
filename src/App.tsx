import { NotesPage } from "./features/notes/ui/NotesPage";
import { runtimeLabel } from "./shared/runtime/runtime";

export default function App() {
  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">AI-first cross-platform starter</p>
          <h1>taurin4</h1>
        </div>
        <span className="runtime-badge">{runtimeLabel()}</span>
      </header>

      <NotesPage />
    </main>
  );
}
