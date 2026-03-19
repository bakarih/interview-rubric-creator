import { JobLevel } from './jd';

export interface Rubric {
  id: string;
  role: string;
  level: JobLevel;
  signals: Signal[];
  createdAt: string;
  version: string;
}

export interface Signal {
  id: string;
  name: string;
  description: string;
  weight: number; // 1-10
  criteria: {
    exceeds: string;
    meets: string;
    below: string;
  };
  suggestedModality: AssessmentModality;
  suggestedQuestions: string[];
}

export type AssessmentModality =
  | 'pair_programming'
  | 'system_design'
  | 'code_review'
  | 'behavioral'
  | 'take_home'
  | 'technical_discussion'
  | 'presentation'
  | 'case_study';

export interface ModalityGuidance {
  modality: AssessmentModality;
  description: string;
  bestFor: string[];
  duration: string;
  tips: string[];
}
