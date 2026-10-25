import { listNotes } from "@/lib/db";
import { addNote, removeNote } from "../actions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default function Home() {
  const notes = listNotes();
  return (
    <main>
      <header><a className="brand" href="/notebook">▧ Notebook</a><a href="/research">Company research ↗</a></header>
      <section className="intro">
        <p className="eyebrow">A LITTLE SPACE FOR YOUR IDEAS</p>
        <h1>Make a note of it.</h1>
        <p>Quick thoughts, bright ideas, and things to remember. All saved here.</p>
      </section>
      <form action={addNote} className="composer">
        <label htmlFor="body">What’s on your mind?</label>
        <textarea id="body" name="body" placeholder="Start writing something…" required maxLength={1000} rows={4} />
        <div className="composer-footer"><span>Up to 1,000 characters</span><button type="submit">Save note <span aria-hidden="true">↗</span></button></div>
      </form>
      <section aria-labelledby="notes-heading" className="notes-section">
        <div className="section-heading"><h2 id="notes-heading">Your notes</h2><span>{notes.length} {notes.length === 1 ? "note" : "notes"}</span></div>
        {notes.length === 0 ? <div className="empty"><span aria-hidden="true">✎</span><h3>A fresh page.</h3><p>Save your first note and it will appear here.</p></div> :
          <div className="notes">{notes.map(note => <article key={note.id}>
            <p className="note-body">{note.body}</p>
            <div className="note-footer"><time dateTime={note.created_at}>{new Date(note.created_at).toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}</time>
              <form action={removeNote}><input type="hidden" name="id" value={note.id} /><button className="delete" aria-label={`Delete note: ${note.body.slice(0, 40)}`}>Delete</button></form>
            </div>
          </article>)}</div>}
      </section>
      <footer>Built with Next.js. Saved with SQLite.</footer>
    </main>
  );
}
