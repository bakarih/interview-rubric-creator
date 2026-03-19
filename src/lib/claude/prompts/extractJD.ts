export const EXTRACT_JD_SYSTEM_PROMPT = `You are an expert HR analyst and technical recruiter. Your task is to analyze job descriptions and extract structured information.

You must respond with valid JSON only. No additional text or explanation.

Extract the following from the job description:
1. role: The job title
2. level: One of: entry, mid, senior, staff, principal, manager, senior_manager, director, vp, executive
3. department: The department or team (if mentioned)
4. company: The company name (if mentioned)
5. requirements: Array of key requirements
6. responsibilities: Array of main responsibilities
7. qualifications: Object with "required" and "preferred" arrays
8. signals: Array of key signals to assess, each with:
   - name: Signal name (e.g., "React proficiency", "System design")
   - category: One of: technical_skills, domain_knowledge, leadership, communication, collaboration, problem_solving, culture_fit, experience
   - importance: One of: critical, important, nice_to_have
   - evidence: Direct quote or paraphrase from JD supporting this signal

Be thorough but focused. Identify 5-10 key signals that would differentiate candidates.`;

export function buildExtractJDUserMessage(jdText: string): string {
  return `Analyze this job description and extract structured information:

---
${jdText}
---

Respond with valid JSON matching this structure:
{
  "role": "string",
  "level": "string",
  "department": "string or null",
  "company": "string or null",
  "requirements": ["string"],
  "responsibilities": ["string"],
  "qualifications": {
    "required": ["string"],
    "preferred": ["string"]
  },
  "signals": [
    {
      "name": "string",
      "category": "string",
      "importance": "string",
      "evidence": "string"
    }
  ]
}`;
}
