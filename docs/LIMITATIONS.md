# Limitations (v1.0.0)

## Current Constraints

### File Processing
- Maximum file size: 5MB
- Supported formats: .txt, .pdf, .docx only
- PDF parsing may miss complex layouts or images

### AI Extraction
- Accuracy depends on JD quality and structure
- May misclassify level for ambiguous titles
- Non-English JDs not fully supported

### Rubric Generation
- Maximum 15 signals per rubric
- Modality suggestions are guidelines, not prescriptive
- Weights are AI-suggested and should be reviewed

### Export
- Google Doc export via .docx download (no direct integration)
- Shareable links use localStorage (cleared on browser data wipe)

### Security
- No authentication (anonymous use)
- Rate limited by IP address (not yet implemented)
- No server-side data persistence

## Planned for v2
- User authentication and saved rubrics
- Team collaboration features
- Direct Google Docs integration
- Custom modality definitions
- Rubric templates
