'use client';

import { useRouter } from 'next/navigation';
import { VoiceControls } from './voice-controls';
import { FormEvent, useEffect, useRef, useState } from 'react';

type Message = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  source?: 'AI' | 'AUTOMATIC' | null;
  rung?: number | null;
  label?: string | null;
  /** What the teaching policy suggests the student DO next (practice, submit, review), if anything. */
  nextStep?: string | null;
  /** Set when the tutor recommends practice: the lesson and skill to practise. */
  practice?: { lessonId: string; skillId: string; skillName: string } | null;
};

type Props = {
  /** Help with one practice question (hint ladder applies). */
  practiceQuestionId?: string;
  /** Or general help with a lesson. */
  lessonId?: string;
  heading?: string;
};

const QUICK_ACTIONS = [
  { label: 'Give me a hint', message: 'Can I have a hint?' },
  { label: "I don't understand", message: "I don't understand." },
  { label: 'Another example', message: 'Can you give me another example?' },
];

const REPORT_REASONS = [
  { value: 'WRONG_MATH', label: 'The maths was wrong' },
  { value: 'CONFUSING', label: 'It was confusing' },
  { value: 'UNSAFE', label: 'It was not appropriate' },
  { value: 'OTHER', label: 'Another problem' },
];

/** "Report this reply": tells the teacher a tutor reply was bad (names are not shown to the teacher). */
function ReportReply({ messageId }: { messageId: string }) {
  const [state, setState] = useState<'idle' | 'open' | 'sending' | 'done'>('idle');
  const [reason, setReason] = useState('WRONG_MATH');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  async function send(event: FormEvent) {
    event.preventDefault();
    setState('sending');
    setError('');
    try {
      const response = await fetch('/api/ai/tutor/report', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ messageId, reason, note: note.trim() || undefined }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? 'The report could not be sent.');
      setState('done');
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'The report could not be sent.');
      setState('open');
    }
  }

  if (state === 'done') return <p className="tutor-voice-note">Thank you. Your teacher can see that you reported this reply.</p>;
  if (state === 'idle') {
    return (
      <button type="button" className="quiet-button" onClick={() => setState('open')}>
        Report this reply
      </button>
    );
  }
  return (
    <form onSubmit={send} aria-label="Report this reply" className="inline-form">
      <label htmlFor={`report-reason-${messageId}`}>What was wrong?</label>
      <select id={`report-reason-${messageId}`} value={reason} onChange={(event) => setReason(event.target.value)}>
        {REPORT_REASONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <label htmlFor={`report-note-${messageId}`}>Tell your teacher more (optional)</label>
      <input id={`report-note-${messageId}`} value={note} onChange={(event) => setNote(event.target.value)} maxLength={300} autoComplete="off" />
      {error && <p role="alert">{error}</p>}
      <button type="submit" className="submit-button" disabled={state === 'sending'}>
        {state === 'sending' ? 'Sending...' : 'Send report'}
      </button>
      <button type="button" className="quiet-button" onClick={() => setState('idle')}>
        Cancel
      </button>
    </form>
  );
}

/**
 * "Ask Tuklas": Socratic help from the AI tutor. Every reply says whether it came from the AI
 * or is an automatic (rule-based) hint, and the page says plainly when the AI is unavailable.
 */
export function TutorPanel({ practiceQuestionId, lessonId, heading = 'Ask Tuklas' }: Props) {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [aiAvailable, setAiAvailable] = useState(true);
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [hintLevel, setHintLevel] = useState(0);
  const [maxLevel, setMaxLevel] = useState(6);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  // Until the earlier conversation has loaded, sending would let the late-arriving history overwrite the new messages.
  const ready = loaded || Boolean(error);

  /** Targeted practice: a session made only of questions for the skill the tutor named. */
  async function startTargetedPractice(target: NonNullable<Message['practice']>) {
    setSending(true);
    setError('');
    try {
      const response = await fetch('/api/practice/sessions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ source: 'LESSON_BANK', lessonId: target.lessonId, skillId: target.skillId, total: 6 }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? 'Could not start practice.');
      router.push(`/student/practice/${payload.data.session.id}`);
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'Could not start practice.');
      setSending(false);
    }
  }

  useEffect(() => {
    if (!open || loaded) return;
    let active = true;
    const query = practiceQuestionId
      ? `practiceQuestionId=${encodeURIComponent(practiceQuestionId)}`
      : lessonId
        ? `lessonId=${encodeURIComponent(lessonId)}`
        : '';
    fetch(`/api/ai/tutor?${query}`)
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error ?? 'The tutor could not be loaded.');
        if (!active) return;
        setAiAvailable(payload.data.aiAvailable);
        setMaxLevel(payload.data.maxHintLevel);
        if (payload.data.conversation) {
          setConversationId(payload.data.conversation.id);
          setHintLevel(payload.data.conversation.hintLevel);
          setMessages(payload.data.conversation.messages as Message[]);
        }
        setLoaded(true);
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : 'The tutor could not be loaded.');
      });
    return () => {
      active = false;
    };
  }, [open, loaded, practiceQuestionId, lessonId]);

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: 'nearest' });
  }, [messages.length]);

  async function send(message: string) {
    const trimmed = message.trim();
    if (!trimmed || sending) return;
    setSending(true);
    setError('');
    setMessages((current) => [...current, { id: `local-${current.length}`, role: 'user', content: trimmed }]);
    setText('');
    try {
      const response = await fetch('/api/ai/tutor', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message: trimmed, conversationId, practiceQuestionId, lessonId }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? 'The tutor could not answer.');
      const { data } = payload;
      setConversationId(data.conversationId);
      setHintLevel(data.hintLevel);
      setMaxLevel(data.maxHintLevel);
      setAiAvailable(data.aiAvailable);
      setMessages((current) => [...current, data.reply as Message]);
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'The tutor could not answer.');
    } finally {
      setSending(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void send(text);
  }

  const panelId = `tutor-${practiceQuestionId ?? lessonId ?? 'general'}`;

  return (
    <section className="tutor-panel" aria-label={heading}>
      <button
        type="button"
        className="quiet-button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
      >
        {open ? 'Hide help' : 'Need help? Ask Tuklas'}
      </button>

      {open && (
        <div id={panelId} className="tutor-body">
          <p className="tutor-status" role="status">
            {!loaded && !error
              ? 'Loading...'
              : aiAvailable
                ? 'Ask Tuklas will guide you with hints and questions. It will not just give you the answer.'
                : 'The AI tutor is not available right now. You can still ask for automatic hints (rule-based, not AI).'}
          </p>

          <p className="tutor-voice-note">Please do not type personal details such as your address or phone number. Your messages are kept and may be seen by your teacher.</p>

          {practiceQuestionId && hintLevel > 0 && (
            <p className="tutor-level" aria-label={`Hint ${hintLevel} of ${maxLevel}`}>
              Hint {hintLevel} of {maxLevel}
            </p>
          )}

          {/* tabIndex lets keyboard users focus and scroll a long conversation. */}
          <div className="tutor-log" role="log" aria-live="polite" aria-label="Conversation with Tuklas" tabIndex={0}>
            {messages.map((message) => (
              <div key={message.id} className={`tutor-message ${message.role}`}>
                <span className="tutor-who">
                  {message.role === 'user'
                    ? 'You'
                    : message.label ?? (message.source === 'AUTOMATIC' ? 'Automatic hint (not AI)' : 'Ask Tuklas (AI)')}
                </span>
                <p>{message.content}</p>
                {message.role === 'assistant' && message.practice && (
                  <button type="button" className="quiet-button" disabled={sending} onClick={() => startTargetedPractice(message.practice!)}>
                    Practise “{message.practice.skillName}”
                  </button>
                )}
                {message.role === 'assistant' && message.nextStep && (
                  <p className="tutor-next" style={{ fontWeight: 600, fontSize: '0.9rem', color: '#0e3b34' }}>
                    {message.nextStep}
                  </p>
                )}
                {message.role === 'assistant' && !message.id.startsWith('local-') && (
                  <ReportReply messageId={message.id} />
                )}
              </div>
            ))}
            <div ref={endRef} />
          </div>

          {error && <p role="alert">{error}</p>}

          <div className="action-row" style={{ marginTop: 8 }}>
            {QUICK_ACTIONS.map((action) => (
              <button key={action.label} type="button" className="quiet-button" disabled={sending || !ready} onClick={() => send(action.message)}>
                {action.label}
              </button>
            ))}
          </div>

          <VoiceControls
            onTranscript={(heard) => setText(heard)}
            latestReply={(() => {
              const last = [...messages].reverse().find((m) => m.role === 'assistant');
              return last ? { id: last.id, content: last.content } : null;
            })()}
            disabled={sending || !ready}
          />

          <form onSubmit={submit} className="inline-form" aria-label="Ask a question">
            <label htmlFor={`${panelId}-input`}>Your question</label>
            <input
              id={`${panelId}-input`}
              value={text}
              onChange={(event) => setText(event.target.value)}
              maxLength={1000}
              placeholder="Type a question, or what you think the answer is"
              autoComplete="off"
            />
            <button className="submit-button" type="submit" disabled={sending || !ready || text.trim().length === 0}>
              {sending ? 'Thinking...' : 'Send'}
            </button>
          </form>
        </div>
      )}
    </section>
  );
}
