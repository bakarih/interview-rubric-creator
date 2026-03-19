export interface JobDescription {
  rawText: string;
  role: string;
  level: JobLevel;
  department?: string;
  company?: string;
  requirements: string[];
  responsibilities: string[];
  qualifications: {
    required: string[];
    preferred: string[];
  };
}

export type JobLevel =
  | 'entry'
  | 'mid'
  | 'senior'
  | 'staff'
  | 'principal'
  | 'manager'
  | 'senior_manager'
  | 'director'
  | 'vp'
  | 'executive';

export interface ParsedFile {
  text: string;
  filename: string;
  mimeType: string;
}
