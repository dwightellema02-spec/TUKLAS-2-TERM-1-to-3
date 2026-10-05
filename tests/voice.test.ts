import { describe, expect, it } from 'vitest';
import { getRecognitionConstructor, speakableText, speechOutputAvailable, transcriptFrom, VOICE_LANGUAGES, voiceErrorMessage } from '../src/lib/voice';

describe('voice helpers', () => {
  it('finds the speech recogniser under either browser name, and reports none honestly', () => {
    class Fake {}
    expect(getRecognitionConstructor({ SpeechRecognition: Fake as never })).toBe(Fake);
    expect(getRecognitionConstructor({ webkitSpeechRecognition: Fake as never })).toBe(Fake);
    expect(getRecognitionConstructor({})).toBeNull();
    expect(getRecognitionConstructor(undefined)).toBeNull();
    expect(speechOutputAvailable({ speechSynthesis: {} })).toBe(true);
    expect(speechOutputAvailable({})).toBe(false);
  });

  it('offers English, Filipino and a US English option', () => {
    expect(VOICE_LANGUAGES.map((l) => l.code)).toEqual(['en-PH', 'fil-PH', 'en-US']);
  });

  it('joins what was heard into one tidy line and says whether it is final', () => {
    const result = (text: string, isFinal: boolean) => Object.assign([{ transcript: text }], { isFinal });
    expect(transcriptFrom({ results: [result('  what is   a negative ', true), result('number', true)] })).toEqual({ text: 'what is a negative number', final: true });
    expect(transcriptFrom({ results: [result('what is', false)] }).final).toBe(false);
    expect(transcriptFrom({ results: [] })).toEqual({ text: '', final: true });
  });

  it.each([
    ['not-allowed', /permission/i],
    ['service-not-allowed', /permission/i],
    ['no-speech', /did not hear/i],
    ['audio-capture', /no microphone/i],
    ['network', /internet/i],
    ['language-not-supported', /language/i],
    ['something-new', /did not work/i],
  ])('error %s gives a kind, plain message that points back to typing', (code, expected) => {
    const message = voiceErrorMessage(code);
    expect(message).toMatch(expected);
    expect(message).not.toMatch(/Error|undefined|stack/);
  });

  it('a deliberate stop is silent', () => {
    expect(voiceErrorMessage('aborted')).toBe('');
  });

  it('makes maths readable aloud and drops decoration', () => {
    expect(speakableText('Try (−3) + 7 = 4 with **care** 😀')).toBe('Try (minus 3) plus 7 equals 4 with care');
    expect(speakableText('5 × 6 ÷ 2 and -4')).toBe('5 times 6 divided by 2 and minus 4');
    expect(speakableText('  plain   words  ')).toBe('plain words');
  });
});
