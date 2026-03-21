#!/usr/bin/env node
/**
 * update-docs.mjs
 * Reads source files from src/, reads current docs from docs/,
 * calls Claude API to generate updated documentation, and writes back.
 */

import Anthropic from '@anthropic-ai/sdk';
import { readFile, writeFile, readdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Recursively collect files matching a glob-like pattern set.
 * We implement a simple recursive walker since we want to avoid adding
 * dependencies (glob package) and stay ESM-compatible.
 */
async function collectFiles(dir, patterns, results = []) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return results;
  }

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      // Skip node_modules and hidden directories
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      await collectFiles(fullPath, patterns, results);
    } else if (entry.isFile()) {
      // Skip test files
      if (
        entry.name.endsWith('.test.ts') ||
        entry.name.endsWith('.test.tsx') ||
        entry.name.endsWith('.spec.ts') ||
        entry.name.endsWith('.spec.tsx')
      ) {
        continue;
      }
      const relativePath = fullPath.slice(ROOT.length + 1); // relative to project root
      if (patterns.some((p) => matchPattern(relativePath, p))) {
        results.push(fullPath);
      }
    }
  }
  return results;
}

/**
 * Very simple glob-like pattern matching.
 * Supports ** (any path segments) and * (any chars in a single segment).
 */
function matchPattern(filePath, pattern) {
  // Normalise separators
  const fp = filePath.replace(/\\/g, '/');
  const pat = pattern.replace(/\\/g, '/');

  // Convert glob to regex by processing the pattern character by character
  let regexStr = '';
  let i = 0;
  while (i < pat.length) {
    if (pat[i] === '*' && pat[i + 1] === '*') {
      // ** matches any number of path segments
      if (pat[i + 2] === '/') {
        regexStr += '(?:.+/)?';
        i += 3;
      } else {
        regexStr += '.*';
        i += 2;
      }
    } else if (pat[i] === '*') {
      // * matches anything except /
      regexStr += '[^/]*';
      i++;
    } else if ('.+^${}()|[]\\'.includes(pat[i])) {
      // Escape regex special characters
      regexStr += '\\' + pat[i];
      i++;
    } else {
      regexStr += pat[i];
      i++;
    }
  }

  return new RegExp(`^${regexStr}$`).test(fp);
}

async function readSourceFiles() {
  const patterns = [
    'src/types/**/*.ts',
    'src/app/api/**/route.ts',
    'src/lib/**/*.ts',
    'src/components/**/*.tsx',
    'src/app/**/*.tsx',
  ];

  const files = await collectFiles(join(ROOT, 'src'), patterns);

  const parts = [];
  for (const filePath of files.sort()) {
    const relativePath = filePath.slice(ROOT.length + 1);
    try {
      const content = await readFile(filePath, 'utf8');
      parts.push(`// ===== ${relativePath} =====\n${content}`);
    } catch (err) {
      console.warn(`Warning: could not read ${relativePath}: ${err.message}`);
    }
  }

  console.log(`  Collected ${files.length} source files.`);
  return parts.join('\n\n');
}

async function readDoc(filename) {
  // Support both docs/ files and root-level files like README.md
  const filePath = filename.includes('/') || filename === 'README.md'
    ? join(ROOT, filename)
    : join(ROOT, 'docs', filename);
  if (!existsSync(filePath)) return '';
  return readFile(filePath, 'utf8');
}

async function writeDoc(filename, content) {
  const filePath = filename.includes('/') || filename === 'README.md'
    ? join(ROOT, filename)
    : join(ROOT, 'docs', filename);
  await writeFile(filePath, content, 'utf8');
}

function buildPrompt(filename, currentDoc, sourceCode) {
  return `You are a technical writer. Based on the following source code, update the ${filename} documentation.
Keep it concise and accurate. Output only the markdown content, no explanation.

Current documentation:
${currentDoc || '(none — create from scratch)'}

Source code:
${sourceCode}`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('Error: ANTHROPIC_API_KEY environment variable is not set.');
    process.exit(1);
  }

  const client = new Anthropic({ apiKey });

  console.log('Reading source files…');
  const sourceCode = await readSourceFiles();

  const docs = [
    {
      filename: 'README.md',
      description: 'main README (project overview, architecture diagram, getting started, tech stack, features, environment variables, deployment)',
    },
    {
      filename: 'ARCHITECTURE.md',
      description: 'architecture (module structure, data flow, design decisions, type system, deployment)',
    },
    {
      filename: 'API.md',
      description: 'API reference (endpoints, request/response shapes with examples, errors)',
    },
    {
      filename: 'CAPABILITIES.md',
      description: 'capabilities and limitations (what the app and AI model can/cannot do, v2 roadmap)',
    },
  ];

  for (const { filename, description } of docs) {
    console.log(`\nUpdating docs/${filename} (${description})…`);

    const currentDoc = await readDoc(filename);
    const prompt = buildPrompt(filename, currentDoc, sourceCode);

    let updatedContent = '';

    try {
      const stream = await client.messages.stream({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        messages: [{ role: 'user', content: prompt }],
      });

      // Stream progress indicator
      process.stdout.write('  Streaming response');
      stream.on('text', () => process.stdout.write('.'));

      const message = await stream.finalMessage();
      process.stdout.write('\n');

      updatedContent = message.content
        .filter((block) => block.type === 'text')
        .map((block) => block.text)
        .join('');

      if (!updatedContent.trim()) {
        throw new Error('Claude returned an empty response');
      }
    } catch (err) {
      console.error(`  Error updating ${filename}: ${err.message}`);
      process.exit(1);
    }

    await writeDoc(filename, updatedContent);
    console.log(`  Written docs/${filename} (${updatedContent.length} chars).`);
  }

  console.log('\nDone. All docs updated.');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
