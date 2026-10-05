'use client';

import { useEffect, useRef, useState } from 'react';
import {
  getRecognitionConstructor,
  speakableText,
  speechOutputAvailable,
  transcriptFrom,
  VOICE_LANGUAGES,
  voiceErrorMessage,
  type RecognitionLike,
} from '../lib/voice';

type Props = {
  /** Text the student said, placed in the question box so they can check it before sending. */
  onTranscript: (text: string) => void;
  /** The newest tutor reply (read aloud when "Read replies aloud" is on). */
  latestReply: { id: string; content: string } | null;
  disabled?: boolean;
};

/**
 * Voice for the tutor: speak a question, hear the reply. It feeds the SAME tutor as typing. Audio is never recorded or
 * stored by Tuklas. Everything here degrades to "type instead" when the browser or the microphone is unavailable.
 */
export function VoiceControls({ onTranscript, latestReply, disabled }: Props) {
  const [supported, setSupported] = useState<{ input: boolean; output: boolean } | null>(null);
  const [listening, setListening] = useState(false);
  const [language, setLanguage] = useState(VOICE_LANGUAGES[0].code);
  const [readAloud, setReadAloud] = useState(false);
  const [notice, setNotice] = useState('');
  const recognition = useRef<RecognitionLike | null>(null);
  const spokenId = useRef<string | null>(null);

  useEffect(() => {
    // Browser features are only known on the client, after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSupported({ input: Boolean(getRecognitionConstructor(window as never)), output: speechOutputAvailable(window as never) });
    return () => {
      recognition.current?.abort();
      window.speechSynthesis?.cancel();
    };
  }, []);

  // Read each NEW tutor reply once, only while the student has switched reading aloud on.
  useEffect(() => {
    if (!readAloud || !latestReply || spokenId.current === latestReply.id || !window.speechSynthesis) return;
    spokenId.current = latestReply.id;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(speakableText(latestReply.content));
    utterance.lang = language;
    window.speechSynthesis.speak(utterance);
  }, [latestReply, readAloud, language]);

  function toggleListening() {
    setNotice('');
    if (listening) {
      recognition.current?.stop();
      return;
    }
    const Ctor = getRecognitionConstructor(window as never);
    if (!Ctor) return;
    window.speechSynthesis?.cancel(); // do not listen to ourselves
    const instance = new Ctor();
    instance.lang = language;
    instance.interimResults = false;
    instance.continuous = false;
    instance.maxAlternatives = 1;
    instance.onresult = (event) => {
      const { text } = transcriptFrom(event);
      if (text) {
        onTranscript(text);
        setNotice('Check what I heard, then press Send.');
      }
    };
    instance.onerror = (event) => setNotice(voiceErrorMessage(event.error));
    instance.onend = () => setListening(false);
    recognition.current = instance;
    try {
      instance.start();
      setListening(true);
    } catch {
      setNotice(voiceErrorMessage('other'));
    }
  }

  if (supported === null) return null;

  if (!supported.input && !supported.output) {
    return <p className="tutor-voice-note">Voice is not available in this browser. You can type your question.</p>;
  }

  return (
    <div className="tutor-voice" role="group" aria-label="Voice">
      {supported.input ? (
        <>
          <button type="button" className="quiet-button" aria-pressed={listening} disabled={disabled} onClick={toggleListening}>
            {listening ? 'Stop listening' : 'Speak your question'}
          </button>
          <label htmlFor="voice-language" className="sr-only">
            Language for listening and reading aloud
          </label>
          <select id="voice-language" value={language} onChange={(event) => setLanguage(event.target.value)} disabled={listening}>
            {VOICE_LANGUAGES.map((option) => (
              <option key={option.code} value={option.code}>
                {option.label}
              </option>
            ))}
          </select>
        </>
      ) : (
        <p className="tutor-voice-note">Listening is not available in this browser, but you can still type.</p>
      )}
      {supported.output && (
        <label className="tutor-voice-toggle">
          <input
            type="checkbox"
            checked={readAloud}
            onChange={(event) => {
              // Switching it on reads FUTURE replies only, never the ones already on the screen.
              if (event.target.checked) spokenId.current = latestReply?.id ?? null;
              else window.speechSynthesis?.cancel();
              setReadAloud(event.target.checked);
            }}
          />{' '}
          Read replies aloud
        </label>
      )}
      <p aria-live="polite" className="tutor-voice-note">
        {listening ? 'Listening…' : notice}
      </p>
      {supported.input && (
        <p className="tutor-voice-note">
          Tuklas does not record or keep your voice, only the words. Your browser&apos;s speech service may process the audio.
        </p>
      )}
    </div>
  );
}
