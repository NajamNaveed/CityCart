const { z } = require('zod');

const {
  AiGuardError,
  sanitizeUserText,
  parseModelJson,
  MAX_MODEL_OUTPUT_CHARS,
} = require('../../src/services/ai/guard');

describe('sanitizeUserText', () => {
  it('removes tags and NUL bytes so pasted markup cannot leak into a prompt', () => {
    expect(sanitizeUserText('<b>Rice</b>\u0000 5kg')).toBe('Rice 5kg');
  });

  it('collapses runs of spaces and tabs and trims the ends', () => {
    expect(sanitizeUserText('  a\t\t b   c  ')).toBe('a b c');
  });

  it('caps the length and falls back to the default for a bad limit', () => {
    expect(sanitizeUserText('abcdef', 3)).toBe('abc');
    expect(sanitizeUserText('abcdef', 0)).toBe('abcdef');
  });

  it('answers an empty string for non-string input', () => {
    expect(sanitizeUserText(null)).toBe('');
    expect(sanitizeUserText(42)).toBe('');
  });
});

describe('parseModelJson', () => {
  const schema = z.object({ title: z.string(), category: z.string() });

  it('parses a plain JSON object and drops unknown fields', () => {
    const parsed = parseModelJson('{"title":"Sugar","category":"Pantry","admin":true}', schema);
    expect(parsed).toEqual({ title: 'Sugar', category: 'Pantry' });
  });

  it('accepts a ```json fenced block', () => {
    expect(parseModelJson('```json\n{"title":"A","category":"B"}\n```', schema)).toEqual({
      title: 'A',
      category: 'B',
    });
  });

  it('takes the object out of surrounding prose', () => {
    expect(parseModelJson('Here you go: {"title":"A","category":"B"} — enjoy', schema)).toEqual({
      title: 'A',
      category: 'B',
    });
  });

  it('rejects empty output, missing objects and invalid JSON', () => {
    expect(() => parseModelJson('   ', schema)).toThrow(AiGuardError);
    expect(() => parseModelJson('no object here', schema)).toThrow(AiGuardError);
    expect(() => parseModelJson('{"title":', schema)).toThrow(AiGuardError);
  });

  it('rejects output longer than the hard cap', () => {
    const huge = `{"title":"${'a'.repeat(MAX_MODEL_OUTPUT_CHARS)}","category":"B"}`;
    expect(() => parseModelJson(huge, schema)).toThrow(AiGuardError);
  });

  it('rejects an object that does not match the schema', () => {
    expect(() => parseModelJson('{"title":42}', schema)).toThrow(AiGuardError);
  });

  it('tags its errors as AI_BAD_OUTPUT', () => {
    try {
      parseModelJson('nope', schema);
      throw new Error('should have thrown');
    } catch (err) {
      expect(err.code).toBe('AI_BAD_OUTPUT');
    }
  });
});
