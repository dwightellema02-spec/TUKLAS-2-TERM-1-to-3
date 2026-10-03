'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';

type Message = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  source?: 'AI' | 'AUTOMATIC' | null;
  rung?: number | null;
  label?: string | null;
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
              </div>
            ))}
            <div ref={endRef} />
          </div>

          {error && <p role="alert">{error}</p>}

          <div className="action-row" style={{ marginTop: 8 }}>
            {QUICK_ACTIONS.map((action) => (
              <button key={action.label} type="button" className="quiet-button" disabled={sending} onClick={() => send(action.message)}>
                {action.label}
              </button>
            ))}
          </div>

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
            <button className="submit-button" type="submit" disabled={sending || text.trim().length === 0}>
              {sending ? 'Thinking...' : 'Send'}
            </button>
          </form>
        </div>
      )}
    </section>
  );
}
