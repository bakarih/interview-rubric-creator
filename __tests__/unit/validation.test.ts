import {
  JobLevelSchema,
  SignalCategorySchema,
  AssessmentModalitySchema,
  ExtractedSignalSchema,
  FileUploadSchema,
  TextInputSchema,
  SignalSchema,
  RubricSchema,
  JobDescriptionSchema,
} from '@/lib/validation/schemas';

// ---------------------------------------------------------------------------
// JobLevelSchema
// ---------------------------------------------------------------------------

describe('JobLevelSchema', () => {
  const validValues = [
    'entry', 'mid', 'senior', 'staff', 'principal',
    'manager', 'senior_manager', 'director', 'vp', 'executive',
  ] as const;

  it.each(validValues)('accepts valid level "%s"', (level) => {
    expect(JobLevelSchema.safeParse(level).success).toBe(true);
  });

  it('rejects an invalid level', () => {
    expect(JobLevelSchema.safeParse('intern').success).toBe(false);
  });

  it('rejects an empty string', () => {
    expect(JobLevelSchema.safeParse('').success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// SignalCategorySchema
// ---------------------------------------------------------------------------

describe('SignalCategorySchema', () => {
  const validValues = [
    'technical_skills', 'domain_knowledge', 'leadership', 'communication',
    'collaboration', 'problem_solving', 'culture_fit', 'experience',
  ] as const;

  it.each(validValues)('accepts valid category "%s"', (category) => {
    expect(SignalCategorySchema.safeParse(category).success).toBe(true);
  });

  it('rejects an invalid category', () => {
    expect(SignalCategorySchema.safeParse('soft_skills').success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// AssessmentModalitySchema
// ---------------------------------------------------------------------------

describe('AssessmentModalitySchema', () => {
  const validValues = [
    'pair_programming', 'system_design', 'code_review', 'behavioral',
    'take_home', 'technical_discussion', 'presentation', 'case_study',
  ] as const;

  it.each(validValues)('accepts valid modality "%s"', (modality) => {
    expect(AssessmentModalitySchema.safeParse(modality).success).toBe(true);
  });

  it('rejects an invalid modality', () => {
    expect(AssessmentModalitySchema.safeParse('whiteboard').success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// ExtractedSignalSchema
// ---------------------------------------------------------------------------

describe('ExtractedSignalSchema', () => {
  const validSignal = {
    name: 'React proficiency',
    category: 'technical_skills',
    importance: 'critical',
    evidence: 'Requires 3+ years of React experience',
  };

  it('accepts a valid ExtractedSignal object', () => {
    expect(ExtractedSignalSchema.safeParse(validSignal).success).toBe(true);
  });

  it('rejects when name is missing', () => {
    const { name: _name, ...rest } = validSignal;
    expect(ExtractedSignalSchema.safeParse(rest).success).toBe(false);
  });

  it('rejects when category is missing', () => {
    const { category: _cat, ...rest } = validSignal;
    expect(ExtractedSignalSchema.safeParse(rest).success).toBe(false);
  });

  it('rejects when importance is missing', () => {
    const { importance: _imp, ...rest } = validSignal;
    expect(ExtractedSignalSchema.safeParse(rest).success).toBe(false);
  });

  it('rejects when evidence is missing', () => {
    const { evidence: _ev, ...rest } = validSignal;
    expect(ExtractedSignalSchema.safeParse(rest).success).toBe(false);
  });

  it('rejects name exceeding 100 characters', () => {
    const signal = { ...validSignal, name: 'a'.repeat(101) };
    expect(ExtractedSignalSchema.safeParse(signal).success).toBe(false);
  });

  it('rejects evidence exceeding 500 characters', () => {
    const signal = { ...validSignal, evidence: 'e'.repeat(501) };
    expect(ExtractedSignalSchema.safeParse(signal).success).toBe(false);
  });

  it('rejects an empty name', () => {
    const signal = { ...validSignal, name: '' };
    expect(ExtractedSignalSchema.safeParse(signal).success).toBe(false);
  });

  it('rejects an empty evidence', () => {
    const signal = { ...validSignal, evidence: '' };
    expect(ExtractedSignalSchema.safeParse(signal).success).toBe(false);
  });

  it('rejects invalid importance value', () => {
    const signal = { ...validSignal, importance: 'mandatory' };
    expect(ExtractedSignalSchema.safeParse(signal).success).toBe(false);
  });

  it('accepts importance "important"', () => {
    expect(ExtractedSignalSchema.safeParse({ ...validSignal, importance: 'important' }).success).toBe(true);
  });

  it('accepts importance "nice_to_have"', () => {
    expect(ExtractedSignalSchema.safeParse({ ...validSignal, importance: 'nice_to_have' }).success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// FileUploadSchema
// ---------------------------------------------------------------------------

describe('FileUploadSchema', () => {
  const validFile = {
    filename: 'resume.pdf',
    mimeType: 'application/pdf',
    size: 1024,
  };

  it('accepts a valid PDF upload', () => {
    expect(FileUploadSchema.safeParse(validFile).success).toBe(true);
  });

  it('accepts a valid DOCX upload', () => {
    const file = {
      ...validFile,
      filename: 'resume.docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    };
    expect(FileUploadSchema.safeParse(file).success).toBe(true);
  });

  it('accepts a valid TXT upload', () => {
    const file = { ...validFile, filename: 'jd.txt', mimeType: 'text/plain' };
    expect(FileUploadSchema.safeParse(file).success).toBe(true);
  });

  it('rejects a file that exceeds 5MB', () => {
    const file = { ...validFile, size: 5 * 1024 * 1024 + 1 };
    expect(FileUploadSchema.safeParse(file).success).toBe(false);
  });

  it('accepts a file exactly at 5MB', () => {
    const file = { ...validFile, size: 5 * 1024 * 1024 };
    expect(FileUploadSchema.safeParse(file).success).toBe(true);
  });

  it('rejects an unsupported mime type', () => {
    const file = { ...validFile, mimeType: 'image/png' };
    expect(FileUploadSchema.safeParse(file).success).toBe(false);
  });

  it('rejects an empty filename', () => {
    const file = { ...validFile, filename: '' };
    expect(FileUploadSchema.safeParse(file).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// TextInputSchema
// ---------------------------------------------------------------------------

describe('TextInputSchema', () => {
  it('accepts valid text of 100+ characters', () => {
    const result = TextInputSchema.safeParse({ text: 'a'.repeat(100) });
    expect(result.success).toBe(true);
  });

  it('accepts text at exactly 50000 characters', () => {
    const result = TextInputSchema.safeParse({ text: 'a'.repeat(50000) });
    expect(result.success).toBe(true);
  });

  it('rejects text shorter than 100 characters', () => {
    const result = TextInputSchema.safeParse({ text: 'a'.repeat(99) });
    expect(result.success).toBe(false);
  });

  it('rejects text longer than 50000 characters', () => {
    const result = TextInputSchema.safeParse({ text: 'a'.repeat(50001) });
    expect(result.success).toBe(false);
  });

  it('rejects missing text field', () => {
    const result = TextInputSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('includes the custom error message for text too short', () => {
    const result = TextInputSchema.safeParse({ text: 'short' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      expect(messages.some((m) => m.includes('at least 100 characters'))).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// SignalSchema
// ---------------------------------------------------------------------------

describe('SignalSchema', () => {
  const validSignal = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    name: 'System Design',
    description: 'Ability to design scalable systems',
    weight: 8,
    criteria: {
      exceeds: 'Designs highly scalable, elegant systems',
      meets: 'Designs functional systems with reasonable trade-offs',
      below: 'Struggles with system design fundamentals',
    },
    suggestedModality: 'system_design',
    suggestedQuestions: ['Describe a system you designed', 'How would you scale this?'],
  };

  it('accepts a valid Signal object', () => {
    expect(SignalSchema.safeParse(validSignal).success).toBe(true);
  });

  it('rejects weight of 0', () => {
    const signal = { ...validSignal, weight: 0 };
    expect(SignalSchema.safeParse(signal).success).toBe(false);
  });

  it('rejects weight of 11', () => {
    const signal = { ...validSignal, weight: 11 };
    expect(SignalSchema.safeParse(signal).success).toBe(false);
  });

  it('accepts weight of 1', () => {
    const signal = { ...validSignal, weight: 1 };
    expect(SignalSchema.safeParse(signal).success).toBe(true);
  });

  it('accepts weight of 10', () => {
    const signal = { ...validSignal, weight: 10 };
    expect(SignalSchema.safeParse(signal).success).toBe(true);
  });

  it('rejects more than 5 suggested questions', () => {
    const signal = {
      ...validSignal,
      suggestedQuestions: ['q1', 'q2', 'q3', 'q4', 'q5', 'q6'],
    };
    expect(SignalSchema.safeParse(signal).success).toBe(false);
  });

  it('accepts exactly 5 suggested questions', () => {
    const signal = {
      ...validSignal,
      suggestedQuestions: ['q1', 'q2', 'q3', 'q4', 'q5'],
    };
    expect(SignalSchema.safeParse(signal).success).toBe(true);
  });

  it('rejects an invalid UUID', () => {
    const signal = { ...validSignal, id: 'not-a-uuid' };
    expect(SignalSchema.safeParse(signal).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// RubricSchema
// ---------------------------------------------------------------------------

describe('RubricSchema', () => {
  const validSignal = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    name: 'Communication',
    description: 'Clear communication skills',
    weight: 5,
    criteria: {
      exceeds: 'Excellent communicator',
      meets: 'Communicates adequately',
      below: 'Struggles to communicate',
    },
    suggestedModality: 'behavioral',
    suggestedQuestions: ['Tell me about a time you communicated a complex idea'],
  };

  const validRubric = {
    id: '550e8400-e29b-41d4-a716-446655440001',
    role: 'Software Engineer',
    level: 'senior',
    signals: [validSignal],
    createdAt: '2024-01-15T10:00:00.000Z',
    version: '1.0.0',
  };

  it('accepts a valid Rubric object', () => {
    expect(RubricSchema.safeParse(validRubric).success).toBe(true);
  });

  it('rejects an invalid UUID for id', () => {
    const rubric = { ...validRubric, id: 'bad-id' };
    expect(RubricSchema.safeParse(rubric).success).toBe(false);
  });

  it('rejects wrong datetime format for createdAt', () => {
    const rubric = { ...validRubric, createdAt: '2024-01-15' };
    expect(RubricSchema.safeParse(rubric).success).toBe(false);
  });

  it('rejects when signals array is empty', () => {
    const rubric = { ...validRubric, signals: [] };
    expect(RubricSchema.safeParse(rubric).success).toBe(false);
  });

  it('rejects when role is missing', () => {
    const { role: _r, ...rest } = validRubric;
    expect(RubricSchema.safeParse(rest).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// JobDescriptionSchema
// ---------------------------------------------------------------------------

describe('JobDescriptionSchema', () => {
  const validJD = {
    rawText: 'a'.repeat(100),
    role: 'Frontend Engineer',
    level: 'senior',
    requirements: ['React', 'TypeScript'],
    responsibilities: ['Build features', 'Review PRs'],
    qualifications: {
      required: ['5 years experience'],
      preferred: ['Open source contributions'],
    },
  };

  it('accepts a valid JobDescription object', () => {
    expect(JobDescriptionSchema.safeParse(validJD).success).toBe(true);
  });

  it('accepts optional department and company fields', () => {
    const jd = { ...validJD, department: 'Platform', company: 'Acme Corp' };
    expect(JobDescriptionSchema.safeParse(jd).success).toBe(true);
  });

  it('rejects when rawText is shorter than 100 characters', () => {
    const jd = { ...validJD, rawText: 'too short' };
    expect(JobDescriptionSchema.safeParse(jd).success).toBe(false);
  });

  it('rejects when role is missing', () => {
    const { role: _r, ...rest } = validJD;
    expect(JobDescriptionSchema.safeParse(rest).success).toBe(false);
  });

  it('rejects when level is missing', () => {
    const { level: _l, ...rest } = validJD;
    expect(JobDescriptionSchema.safeParse(rest).success).toBe(false);
  });

  it('rejects when qualifications is missing', () => {
    const { qualifications: _q, ...rest } = validJD;
    expect(JobDescriptionSchema.safeParse(rest).success).toBe(false);
  });

  it('rejects when requirements is missing', () => {
    const { requirements: _req, ...rest } = validJD;
    expect(JobDescriptionSchema.safeParse(rest).success).toBe(false);
  });
});
