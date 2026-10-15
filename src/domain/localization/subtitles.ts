import {
  uid,
  type LocaleVariant,
  type SubtitleCue,
  type ValidationIssue,
} from '../../shared/model';
export const LOCALES = [
  'zh-Hans',
  'zh-Hant',
  'en',
  'fr',
  'es',
  'de',
  'ru',
  'ja',
  'ko',
  'ar',
  'tr',
  'id',
  'ms',
  'th',
  'vi',
  'fil',
];
export function createLocaleVariant(source: LocaleVariant, targetTag: string): LocaleVariant {
  const [tag] = Intl.getCanonicalLocales(targetTag);
  return { ...structuredClone(source), id: uid(), tag, sourceId: source.id };
}
export function validateSubtitles(
  cues: SubtitleCue[],
  options: { maxCharsPerSecond: number; maxLines: number },
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const add = (s: string) => issues.push({ code: 'SUBTITLE', message: s });
  for (const [i, c] of cues.entries()) {
    if (
      !Number.isInteger(c.startMs) ||
      !Number.isInteger(c.endMs) ||
      c.startMs < 0 ||
      c.endMs <= c.startMs
    )
      add(`字幕${i + 1}時碼不合法`);
    const chars = [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(c.text)]
      .length;
    if (chars / ((c.endMs - c.startMs) / 1000) > options.maxCharsPerSecond)
      add(`字幕${i + 1}閱讀速度過快`);
    if (c.text.split('\n').length > options.maxLines) add(`字幕${i + 1}超過行數`);
    if (i && c.startMs < cues[i - 1].endMs) add(`字幕${i + 1}與前一段重疊`);
  }
  return issues;
}
export function serializeSubtitles(cues: SubtitleCue[], format: 'srt' | 'vtt' | 'json'): string {
  if (
    cues.some(
      (c) =>
        !Number.isInteger(c.startMs) ||
        !Number.isInteger(c.endMs) ||
        c.startMs < 0 ||
        c.endMs <= c.startMs,
    )
  )
    throw Error('請修正不合法字幕時碼');
  if (format === 'json') return JSON.stringify(cues, null, 2);
  const time = (ms: number) =>
    `${String(Math.floor(ms / 3600000)).padStart(2, '0')}:${String(Math.floor(ms / 60000) % 60).padStart(2, '0')}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}${format === 'srt' ? ',' : '.'}${String(ms % 1000).padStart(3, '0')}`;
  return (
    (format === 'vtt' ? 'WEBVTT\n\n' : '') +
    cues.map((c, i) => `${i + 1}\n${time(c.startMs)} --> ${time(c.endMs)}\n${c.text}\n`).join('\n')
  );
}
