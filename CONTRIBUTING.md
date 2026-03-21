# Contributing to Interview Rubric Creator

Thanks for your interest in making hiring better! This project is built in public, and contributions from the community are welcome.

## Ways to Contribute

### Share Feedback (No Code Required)
The most valuable contribution is your perspective. Whether you're a recruiter, hiring manager, candidate, or engineer — your experience matters.

**[Leave Feedback →](https://github.com/bakarih/interview-rubric-creator/issues/new?template=feedback.yml)**

### Report Bugs
Found something broken? Let us know.

**[Report a Bug →](https://github.com/bakarih/interview-rubric-creator/issues/new?template=bug_report.yml)**

### Suggest Features
Have an idea for how this could be better? We're all ears.

**[Suggest a Feature →](https://github.com/bakarih/interview-rubric-creator/issues/new?template=feature_request.yml)**

### Contribute Code
Want to get your hands dirty? Here's how:

1. Fork the repo
2. Create a feature branch (`git checkout -b feature/your-idea`)
3. Make your changes
4. Run tests and linting
5. Open a PR with a clear description

#### Tech Stack
- Next.js 16 (App Router)
- TypeScript
- Tailwind CSS 4
- Claude Sonnet 4 (Anthropic API)

#### Development Setup
```bash
git clone https://github.com/bakarih/interview-rubric-creator.git
cd interview-rubric-creator
npm install
cp .env.example .env.local
# Add your ANTHROPIC_API_KEY to .env.local
npm run dev
```

#### Running Tests
```bash
npm test              # Unit and integration tests
npm run test:coverage # With coverage (100% enforced)
npm run lint          # ESLint
```

#### PR Guidelines
- Keep PRs focused — one feature or fix per PR
- Include tests for new functionality
- Maintain 100% test coverage
- Run `npm run lint` and `npm test` before submitting
- Write a clear PR description explaining the "why"

## Code of Conduct

Be kind. Be constructive. We're all here to make hiring more fair and effective.

## Questions?

Open an issue or reach out to [@bakariholmes](https://linkedin.com/in/bakariholmes) on LinkedIn.
