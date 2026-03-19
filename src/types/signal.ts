export interface ExtractedSignal {
  name: string;
  category: SignalCategory;
  importance: 'critical' | 'important' | 'nice_to_have';
  evidence: string; // Quote from JD that indicates this signal
}

export type SignalCategory =
  | 'technical_skills'
  | 'domain_knowledge'
  | 'leadership'
  | 'communication'
  | 'collaboration'
  | 'problem_solving'
  | 'culture_fit'
  | 'experience';
