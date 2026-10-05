'use client';

import { FormEvent, useEffect, useState } from 'react';

type Question = {
  id: string;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  skill: string | null;
  misconceptionTags: string[];
};

const EMPTY = { question: '', options: ['', '', '', ''], correctIndex: 0, explanation: '', difficulty: 'MEDIUM' as Question['difficulty'], skill: '', tags: '' };
const LABEL = { EASY: 'Easy', MEDIUM: 'Medium', HARD: 'Hard' };

/**
 * The lesson's practice bank: the questions students practise from. Every answer is checked before saving; plain
 * arithmetic questions are verified by computation and the teacher is told whether that happened.
 */
export function LessonPracticeAuthoring({ lessonId }: { lessonId: string }) {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [editing, setEditing] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    fetch(`/api/lessons/${lessonId}/practice-questions`)
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error ?? 'The practice questions could not be loaded.');
        if (active) setQuestions(payload.data.questions);
      })
      .catch((cause: unknown) => {
        if (active) setMessage({ kind: 'error', text: cause instanceof Error ? cause.message : 'The practice questions could not be loaded.' });
      })
      .finally(() => {
        if (active) setLoaded(true);
      });
    return () => {
      active = false;
    };
  }, [lessonId, reloadKey]);

  function startEdit(item: Question) {
    setEditing(item.id);
    setForm({
      question: item.question,
      options: [...item.options],
      correctIndex: item.correctIndex,
      explanation: item.explanation,
      difficulty: item.difficulty,
      skill: item.skill ?? '',
      tags: item.misconceptionTags.join(', '),
    });
    setMessage(null);
  }

  function reset() {
    setEditing(null);
    setForm(EMPTY);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const body = {
        question: form.question,
        options: form.options,
        correctIndex: form.correctIndex,
        explanation: form.explanation,
        difficulty: form.difficulty,
        skill: form.skill,
        misconceptionTags: form.tags.split(',').map((tag) => tag.trim()).filter(Boolean),
      };
      const response = await fetch(
        editing ? `/api/lessons/${lessonId}/practice-questions/${editing}` : `/api/lessons/${lessonId}/practice-questions`,
        { method: editing ? 'PUT' : 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) },
      );
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? 'The question could not be saved.');
      setMessage({
        kind: 'ok',
        text: `${editing ? 'Question updated' : 'Question added'}. ${payload.data.mathVerified ? 'The answer was verified by computation.' : 'The answer could not be checked by the computer: please double-check it yourself.'}`,
      });
      reset();
      setReloadKey((value) => value + 1);
    } catch (cause: unknown) {
      setMessage({ kind: 'error', text: cause instanceof Error ? cause.message : 'The question could not be saved.' });
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/lessons/${lessonId}/practice-questions/${id}`, { method: 'DELETE' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? 'The question could not be removed.');
      setConfirming(null);
      if (editing === id) reset();
      setMessage({ kind: 'ok', text: 'Question removed.' });
      setReloadKey((value) => value + 1);
    } catch (cause: unknown) {
      setMessage({ kind: 'error', text: cause instanceof Error ? cause.message : 'The question could not be removed.' });
    } finally {
      setBusy(false);
    }
  }

  const setOption = (index: number, value: string) => setForm((current) => ({ ...current, options: current.options.map((o, i) => (i === index ? value : o)) }));

  return (
    <section aria-label="Practice questions" className="card">
      <h3>Practice questions</h3>
      <p>
        Students practise from these questions, and Tuklas uses them to track mistakes and mastery. Add at least four. Each needs an
        explanation, which students see after they answer.
      </p>

      {message && (
        <p role={message.kind === 'error' ? 'alert' : 'status'} className={message.kind === 'error' ? 'form-error' : undefined}>
          {message.text}
        </p>
      )}

      <form onSubmit={save} aria-label={editing ? 'Edit a practice question' : 'Add a practice question'} className="stack-form">
        <label htmlFor="pq-question">Question</label>
        <input id="pq-question" value={form.question} onChange={(e) => setForm({ ...form, question: e.target.value })} maxLength={600} required />

        <fieldset>
          <legend>Choices (select the correct one)</legend>
          {form.options.map((option, index) => (
            <div key={index} className="option-edit-row">
              <input
                type="radio"
                name="pq-correct"
                aria-label={`Choice ${index + 1} is correct`}
                checked={form.correctIndex === index}
                onChange={() => setForm({ ...form, correctIndex: index })}
              />
              <input aria-label={`Choice ${index + 1}`} value={option} onChange={(e) => setOption(index, e.target.value)} maxLength={200} required />
            </div>
          ))}
        </fieldset>

        <label htmlFor="pq-explanation">Explanation shown after answering</label>
        <textarea id="pq-explanation" value={form.explanation} onChange={(e) => setForm({ ...form, explanation: e.target.value })} rows={2} maxLength={1000} required />

        <label htmlFor="pq-skill">Skill this practises</label>
        <input id="pq-skill" value={form.skill} onChange={(e) => setForm({ ...form, skill: e.target.value })} maxLength={80} placeholder="e.g. Adding integers" required />

        <label htmlFor="pq-difficulty">Difficulty</label>
        <select id="pq-difficulty" value={form.difficulty} onChange={(e) => setForm({ ...form, difficulty: e.target.value as Question['difficulty'] })}>
          <option value="EASY">Easy</option>
          <option value="MEDIUM">Medium</option>
          <option value="HARD">Hard</option>
        </select>

        <label htmlFor="pq-tags">Common mistakes (optional, separated by commas)</label>
        <input id="pq-tags" value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="e.g. forgets the negative sign, adds instead of subtracts" />

        <div className="action-row">
          <button type="submit" className="submit-button" disabled={busy}>
            {busy ? 'Saving...' : editing ? 'Save changes' : 'Add question'}
          </button>
          {editing && (
            <button type="button" className="quiet-button" onClick={reset} disabled={busy}>
              Cancel editing
            </button>
          )}
        </div>
      </form>

      {!loaded ? (
        <p role="status">Loading...</p>
      ) : questions.length === 0 ? (
        <p>No practice questions yet. Students cannot practise this lesson until you add some.</p>
      ) : (
        <ol aria-label="Practice questions in this lesson" className="review-list">
          {questions.map((item) => (
            <li key={item.id} className="review-item">
              <p style={{ margin: 0 }}>
                <strong>{item.question}</strong>
              </p>
              <p style={{ margin: '4px 0', color: '#475569' }}>
                {LABEL[item.difficulty]} · {item.skill ?? 'No skill'} · Correct: {item.options[item.correctIndex]}
                {item.misconceptionTags.length > 0 ? ` · Common mistakes: ${item.misconceptionTags.join('; ')}` : ''}
              </p>
              <div className="action-row">
                <button type="button" className="quiet-button" onClick={() => startEdit(item)} aria-label={`Edit the question ${item.question}`}>
                  Edit
                </button>
                {confirming === item.id ? (
                  <>
                    <button type="button" className="quiet-button" disabled={busy} onClick={() => remove(item.id)}>
                      Confirm remove {item.question}
                    </button>
                    <button type="button" className="quiet-button" onClick={() => setConfirming(null)}>
                      Cancel
                    </button>
                  </>
                ) : (
                  <button type="button" className="quiet-button" onClick={() => setConfirming(item.id)}>
                    Remove {item.question}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
