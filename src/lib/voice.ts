/**
 * Tuklas 2.0 — Voice helpers (owner phase I). Voice is only an INPUT and OUTPUT layer on the same tutor:
 * speech becomes text that is sent through exactly the same path as typing, and the tutor's text reply is read aloud.
 * There is no second "voice brain". Tuklas never records or stores audio; it receives text only.
 *
 * The browser's own speech services do the recognising and the speaking (Web Speech API). On some browsers the
 * recognition is done by the browser vendor's cloud service; the interface says so.
 */

export type VoiceLanguage = { code: string; label: string };

export const VOICE_LANGUAGES: VoiceLanguage[] = [
  { code: 'en-PH', label: 'English (Philippines)' },
  { code: 'fil-PH', label: 'Filipino' },
  { code: 'en-US', label: 'English (US)' },
];

/** The slice of the Web Speech API that Tuklas uses. */
export type RecognitionResultEvent = { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> };
export type RecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  onresult: ((event: RecognitionResultEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
};
export type RecognitionConstructor = new () => RecognitionLike;

type SpeechWindow = {
  SpeechRecognition?: RecognitionConstructor;
  webkitSpeechRecognition?: RecognitionConstructor;
  speechSynthesis?: unknown;
};

export function getRecognitionConstructor(scope: SpeechWindow | undefined): RecognitionConstructor | null {
  if (!scope) return null;
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition ?? null;
}

export const speechOutputAvailable = (scope: SpeechWindow | undefined) => Boolean(scope?.speechSynthesis);

/** Plain, kind messages for the errors the browser reports. Never exposes internals. */
export function voiceErrorMessage(code: string): string {
  switch (code) {
    case 'not-allowed':
    case 'service-not-allowed':
      return 'Tuklas does not have permission to use the microphone. Allow it in your browser, or type your question instead.';
    case 'no-speech':
      return 'I did not hear anything. Tap the microphone and try again.';
    case 'audio-capture':
      return 'No microphone was found. You can type your question instead.';
    case 'network':
      return 'Voice needs an internet connection right now. You can type your question instead.';
    case 'language-not-supported':
      return 'This browser cannot listen in that language. Try another language or type your question.';
    case 'aborted':
      return '';
    default:
      return 'Voice did not work this time. You can type your question instead.';
  }
}

/** Joins what the recogniser heard into one line of text for the student to check before sending. */
export function transcriptFrom(event: RecognitionResultEvent): { text: string; final: boolean } {
  const parts: string[] = [];
  let final = true;
  for (let i = 0; i < event.results.length; i += 1) {
    const result = event.results[i];
    const heard = result[0]?.transcript?.trim();
    if (heard) parts.push(heard);
    if (!result.isFinal) final = false;
  }
  return { text: parts.join(' ').replace(/\s+/g, ' ').trim(), final };
}

/**
 * Text that is good to speak: the tutor writes plain text, but maths symbols read badly, so spell the common ones.
 * Emoji and markdown marks are removed. Pure and deterministic.
 */
export function speakableText(text: string): string {
  return text
    .replace(/[*_`#>]+/g, '')
    .replace(/−/g, ' minus ')
    .replace(/\s-(?=\d)/g, ' minus ')
    .replace(/×/g, ' times ')
    .replace(/÷/g, ' divided by ')
    .replace(/\+/g, ' plus ')
    .replace(/=/g, ' equals ')
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '')
    .replace(/\(\s+/g, '(')
    .replace(/\s+/g, ' ')
    .trim();
}
