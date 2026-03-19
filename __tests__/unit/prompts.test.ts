import {
  EXTRACT_JD_SYSTEM_PROMPT,
  buildExtractJDUserMessage,
  GENERATE_RUBRIC_SYSTEM_PROMPT,
  buildGenerateRubricUserMessage,
} from '@/lib/claude/prompts';
import { ExtractedSignal } from '@/types';

// ---------------------------------------------------------------------------
// EXTRACT_JD_SYSTEM_PROMPT
// ---------------------------------------------------------------------------

describe('EXTRACT_JD_SYSTEM_PROMPT', () => {
  it('is a non-empty string', () => {
    expect(typeof EXTRACT_JD_SYSTEM_PROMPT).toBe('string');
    expect(EXTRACT_JD_SYSTEM_PROMPT.length).toBeGreaterThan(0);
  });

  it('contains the word "JSON"', () => {
    expect(EXTRACT_JD_SYSTEM_PROMPT).toContain('JSON');
  });
});

// ---------------------------------------------------------------------------
// buildExtractJDUserMessage
// ---------------------------------------------------------------------------

describe('buildExtractJDUserMessage', () => {
  const jdText = 'We are looking for a skilled Software Engineer with 5 years of experience.';

  it('includes the job description text in the message', () => {
    const message = buildExtractJDUserMessage(jdText);
    expect(message).toContain(jdText);
  });

  it('includes a JSON structure hint', () => {
    const message = buildExtractJDUserMessage(jdText);
    expect(message).toContain('JSON');
  });

  it('includes expected JSON structure keys', () => {
    const message = buildExtractJDUserMessage(jdText);
    expect(message).toContain('"role"');
    expect(message).toContain('"level"');
    expect(message).toContain('"signals"');
  });

  it('wraps the JD text with delimiters', () => {
    const message = buildExtractJDUserMessage(jdText);
    expect(message).toContain('---');
  });

  it('works with a different JD text', () => {
    const differentJD = 'Join our team as a Senior Product Manager leading growth initiatives.';
    const message = buildExtractJDUserMessage(differentJD);
    expect(message).toContain(differentJD);
  });
});

// ---------------------------------------------------------------------------
// GENERATE_RUBRIC_SYSTEM_PROMPT
// ---------------------------------------------------------------------------

describe('GENERATE_RUBRIC_SYSTEM_PROMPT', () => {
  it('is a non-empty string', () => {
    expect(typeof GENERATE_RUBRIC_SYSTEM_PROMPT).toBe('string');
    expect(GENERATE_RUBRIC_SYSTEM_PROMPT.length).toBeGreaterThan(0);
  });

  it('contains the word "JSON"', () => {
    expect(GENERATE_RUBRIC_SYSTEM_PROMPT).toContain('JSON');
  });
});

// ---------------------------------------------------------------------------
// buildGenerateRubricUserMessage
// ---------------------------------------------------------------------------

describe('buildGenerateRubricUserMessage', () => {
  const role = 'Senior Software Engineer';
  const level = 'senior' as const;
  const signals: ExtractedSignal[] = [
    {
      name: 'React proficiency',
      category: 'technical_skills',
      importance: 'critical',
      evidence: 'Requires 3+ years of React',
    },
    {
      name: 'Leadership',
      category: 'leadership',
      importance: 'important',
      evidence: 'Lead small teams',
    },
  ];

  it('includes the role in the message', () => {
    const message = buildGenerateRubricUserMessage(role, level, signals);
    expect(message).toContain(role);
  });

  it('includes the level in the message', () => {
    const message = buildGenerateRubricUserMessage(role, level, signals);
    expect(message).toContain(level);
  });

  it('includes all signal names', () => {
    const message = buildGenerateRubricUserMessage(role, level, signals);
    for (const signal of signals) {
      expect(message).toContain(signal.name);
    }
  });

  it('includes a JSON hint', () => {
    const message = buildGenerateRubricUserMessage(role, level, signals);
    expect(message).toContain('JSON');
  });

  it('includes signal categories in the message', () => {
    const message = buildGenerateRubricUserMessage(role, level, signals);
    expect(message).toContain('technical_skills');
    expect(message).toContain('leadership');
  });

  it('includes signal importance values', () => {
    const message = buildGenerateRubricUserMessage(role, level, signals);
    expect(message).toContain('critical');
    expect(message).toContain('important');
  });

  it('includes signal evidence in the message', () => {
    const message = buildGenerateRubricUserMessage(role, level, signals);
    for (const signal of signals) {
      expect(message).toContain(signal.evidence);
    }
  });

  it('numbers signals sequentially', () => {
    const message = buildGenerateRubricUserMessage(role, level, signals);
    expect(message).toContain('1.');
    expect(message).toContain('2.');
  });
});
