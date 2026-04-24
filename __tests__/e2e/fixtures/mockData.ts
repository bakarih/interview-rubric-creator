import type { Rubric } from '../../../src/types';

// ─── Shared rubric ID used across all E2E tests ───────────────────────────────
export const MOCK_RUBRIC_ID = 'e2e-test-rubric-abc123';

// ─── Shared job ID used by async pipeline E2E tests ───────────────────────────
export const MOCK_JOB_ID = 'e2e-test-job-abc123';

// ─── Mock rubric returned by /api/generate ────────────────────────────────────
export const MOCK_RUBRIC: Rubric = {
  id: MOCK_RUBRIC_ID,
  role: 'Senior Software Engineer',
  level: 'senior',
  createdAt: '2025-01-01T00:00:00.000Z',
  version: '1.0.0',
  signals: [
    {
      id: 'sig-1',
      name: 'Technical Problem Solving',
      description: 'Ability to break down and solve complex technical problems efficiently.',
      weight: 9,
      criteria: {
        exceeds:
          'Independently decomposes novel problems with exceptional clarity and proposes multiple solutions with clear trade-offs.',
        meets:
          'Consistently solves complex problems with clear reasoning and a structured, methodical approach.',
        below:
          'Struggles with ambiguous or complex problems and requires significant guidance to make progress.',
      },
      suggestedModality: 'system_design',
      suggestedQuestions: [
        'Walk me through how you would design a distributed rate-limiting system.',
        'Describe the most complex technical problem you have solved recently and your approach.',
      ],
    },
    {
      id: 'sig-2',
      name: 'System Design',
      description: 'Experience designing scalable, maintainable, and reliable distributed systems.',
      weight: 8,
      criteria: {
        exceeds:
          'Proactively identifies edge cases and failure modes, designs for operational excellence, and clearly articulates trade-offs.',
        meets:
          'Produces solid, well-reasoned system designs with appropriate trade-off analysis and clear component boundaries.',
        below:
          'Designs lack depth, miss key scalability considerations, or show limited awareness of operational concerns.',
      },
      suggestedModality: 'system_design',
      suggestedQuestions: [
        'How would you design a distributed job queue capable of handling 100K events per second?',
        'What architectural considerations guide your technical decision-making?',
      ],
    },
  ],
};

// ─── Mock response returned by /api/extract ───────────────────────────────────
export const MOCK_EXTRACT_RESPONSE = {
  rawText: 'Job description text...',
  role: 'Senior Software Engineer',
  level: 'senior',
  department: 'Engineering',
  company: 'Acme Corp',
  requirements: ['5+ years of software engineering experience', 'Strong TypeScript skills'],
  responsibilities: ['Design and implement scalable backend systems', 'Mentor junior engineers'],
  qualifications: {
    required: ['BS/MS in Computer Science or equivalent'],
    preferred: ['Experience with distributed systems and microservices'],
  },
  signals: [
    {
      name: 'Technical Problem Solving',
      category: 'technical_skills',
      importance: 'critical',
      evidence: 'Requires strong problem-solving and analytical skills',
    },
    {
      name: 'System Design',
      category: 'technical_skills',
      importance: 'critical',
      evidence: 'Design and implement scalable backend systems',
    },
  ],
};

// ─── A realistic job description long enough to pass the 100-char minimum ─────
export const LONG_JD_TEXT = `
We are looking for a Senior Software Engineer to join our platform team at Acme Corp.
You will design and build scalable backend systems that power our core product.

Responsibilities:
- Design and implement distributed systems at scale
- Lead technical architecture discussions and decision-making
- Mentor and grow junior and mid-level engineers
- Collaborate with product managers to define technical requirements
- Conduct thorough code reviews and establish engineering best practices
- Drive reliability, performance, and observability improvements

Requirements:
- 5+ years of software engineering experience
- Strong proficiency in TypeScript, Node.js, or Python
- Experience designing distributed systems and microservices
- Deep understanding of database design (SQL and NoSQL)
- Excellent communication and collaboration skills
- BS/MS in Computer Science or equivalent experience

Nice to Have:
- Experience with Kubernetes and container orchestration
- Contributions to open-source projects
- Experience with event-driven architectures
`.trim();
