'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';

type DocumentRow = {
  id: string;
  fileName: string;
  kind: string;
  byteSize: number;
  pageCount: number | null;
  wordCount: number;
  chunkCount: number | null;
};

const formatSize = (bytes: number) => (bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

/**
 * Teacher reference documents for a lesson (PDF, Word, text). Only the extracted text is kept and the
 * AI tutor may use the relevant parts when a student asks. Says plainly what happened to each upload.
 */
export function LessonDocuments({ lessonId }: { lessonId: string }) {
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [reloadKey, setReloadKey] = useState(0);
  const load = () => setReloadKey((value) => value + 1);

  useEffect(() => {
    let active = true;
    fetch(`/api/lessons/${lessonId}/documents`)
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error ?? 'The documents could not be loaded.');
        if (active) setDocuments(payload.data.documents);
      })
      .catch((cause: unknown) => {
        if (active) setMessage({ kind: 'error', text: cause instanceof Error ? cause.message : 'The documents could not be loaded.' });
      })
      .finally(() => {
        if (active) setLoaded(true);
      });
    return () => {
      active = false;
    };
  }, [lessonId, reloadKey]);

  async function upload(event: FormEvent) {
    event.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setMessage({ kind: 'error', text: 'Choose a file first.' });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const form = new FormData();
      form.set('file', file);
      const response = await fetch(`/api/lessons/${lessonId}/documents`, { method: 'POST', body: form });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? 'The upload failed.');
      const doc = payload.data.document as DocumentRow;
      setMessage({ kind: 'ok', text: `Added ${doc.fileName}: ${doc.wordCount.toLocaleString('en-US')} words in ${doc.chunkCount} sections.` });
      if (fileRef.current) fileRef.current.value = '';
      load();
    } catch (cause: unknown) {
      setMessage({ kind: 'error', text: cause instanceof Error ? cause.message : 'The upload failed.' });
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/lessons/${lessonId}/documents/${id}`, { method: 'DELETE' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? 'The document could not be removed.');
      setConfirming(null);
      setMessage({ kind: 'ok', text: 'Document removed.' });
      load();
    } catch (cause: unknown) {
      setMessage({ kind: 'error', text: cause instanceof Error ? cause.message : 'The document could not be removed.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-label="Reference documents" className="card">
      <h3>Reference documents</h3>
      <p>
        Upload notes or worksheets (PDF, Word .docx or text, up to 5 MB), or the caption file of your lesson video (.srt or .vtt). Tuklas keeps
        only the text and the AI tutor may use the parts that match a student&apos;s question; for captions it can point to the time in the
        video. Tuklas does not download videos or captions itself. Scanned or image-only PDFs cannot be read.
      </p>

      <form onSubmit={upload} aria-label="Upload a document" className="inline-form">
        <label htmlFor="lesson-document-file">Document file</label>
        <input id="lesson-document-file" ref={fileRef} type="file" accept=".pdf,.docx,.txt,.md,.markdown,.text,.srt,.vtt" disabled={busy} />
        <button type="submit" className="submit-button" disabled={busy}>
          {busy ? 'Working...' : 'Upload'}
        </button>
      </form>

      {message && (
        <p role={message.kind === 'error' ? 'alert' : 'status'} className={message.kind === 'error' ? 'form-error' : undefined}>
          {message.text}
        </p>
      )}

      {!loaded ? (
        <p role="status">Loading...</p>
      ) : documents.length === 0 ? (
        <p>No documents yet. The tutor will use only the lesson text.</p>
      ) : (
        <div className="table-scroll" role="region" aria-label="Attached documents (scrolls sideways on small screens)" tabIndex={0}>
          <table style={{ borderCollapse: 'separate', borderSpacing: '14px 6px' }}>
            <caption className="sr-only">Documents attached to this lesson</caption>
            <thead>
              <tr>
                <th scope="col">File</th>
                <th scope="col">Type</th>
                <th scope="col">Size</th>
                <th scope="col">Words</th>
                <th scope="col">Sections</th>
                <th scope="col">Action</th>
              </tr>
            </thead>
            <tbody>
              {documents.map((doc) => (
                <tr key={doc.id}>
                  <th scope="row">{doc.fileName}</th>
                  <td>
                    {doc.kind === 'TRANSCRIPT' ? 'Video captions' : doc.kind}
                    {doc.pageCount ? `, ${doc.pageCount} pp` : ''}
                  </td>
                  <td>{formatSize(doc.byteSize)}</td>
                  <td>{doc.wordCount.toLocaleString('en-US')}</td>
                  <td>{doc.chunkCount}</td>
                  <td>
                    {confirming === doc.id ? (
                      <>
                        <button type="button" className="quiet-button" disabled={busy} onClick={() => remove(doc.id)}>
                          Confirm remove {doc.fileName}
                        </button>{' '}
                        <button type="button" className="quiet-button" onClick={() => setConfirming(null)}>
                          Cancel
                        </button>
                      </>
                    ) : (
                      <button type="button" className="quiet-button" onClick={() => setConfirming(doc.id)}>
                        Remove {doc.fileName}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
