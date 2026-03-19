import { z } from 'zod';

export const JobLevelSchema = z.enum([
  'entry',
  'mid',
  'senior',
  'staff',
  'principal',
  'manager',
  'senior_manager',
  'director',
  'vp',
  'executive',
]);

export const SignalCategorySchema = z.enum([
  'technical_skills',
  'domain_knowledge',
  'leadership',
  'communication',
  'collaboration',
  'problem_solving',
  'culture_fit',
  'experience',
]);

export const AssessmentModalitySchema = z.enum([
  'pair_programming',
  'system_design',
  'code_review',
  'behavioral',
  'take_home',
  'technical_discussion',
  'presentation',
  'case_study',
]);

export const ExtractedSignalSchema = z.object({
  name: z.string().min(1).max(100),
  category: SignalCategorySchema,
  importance: z.enum(['critical', 'important', 'nice_to_have']),
  evidence: z.string().min(1).max(500),
});

export const JobDescriptionSchema = z.object({
  rawText: z.string().min(100).max(50000),
  role: z.string().min(1).max(200),
  level: JobLevelSchema,
  department: z.string().optional(),
  company: z.string().optional(),
  requirements: z.array(z.string()),
  responsibilities: z.array(z.string()),
  qualifications: z.object({
    required: z.array(z.string()),
    preferred: z.array(z.string()),
  }),
});

export const SignalSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  description: z.string().min(1).max(500),
  weight: z.number().min(1).max(10),
  criteria: z.object({
    exceeds: z.string().min(1).max(500),
    meets: z.string().min(1).max(500),
    below: z.string().min(1).max(500),
  }),
  suggestedModality: AssessmentModalitySchema,
  suggestedQuestions: z.array(z.string()).min(1).max(5),
});

export const RubricSchema = z.object({
  id: z.string().uuid(),
  role: z.string().min(1).max(200),
  level: JobLevelSchema,
  signals: z.array(SignalSchema).min(1).max(15),
  createdAt: z.string().datetime(),
  version: z.string(),
});

export const FileUploadSchema = z.object({
  filename: z.string().min(1),
  mimeType: z.enum([
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
  ]),
  size: z.number().max(5 * 1024 * 1024), // 5MB max
});

export const TextInputSchema = z.object({
  text: z.string().min(100, 'Job description must be at least 100 characters').max(50000),
});
