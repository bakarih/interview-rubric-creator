import { NextRequest, NextResponse } from 'next/server';
import {
  Document as DocxDocument,
  Packer,
  Paragraph,
  Table,
  TableRow,
  TableCell,
  TextRun,
  HeadingLevel,
  WidthType,
  BorderStyle,
} from 'docx';
import { renderToBuffer } from '@react-pdf/renderer';
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import React from 'react';
import { Rubric, Signal } from '@/types';

function toTitleCase(value: string): string {
  return value
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

// ─── PDF ─────────────────────────────────────────────────────────────────────

const pdfStyles = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 10,
    padding: 40,
    color: '#1f2937',
  },
  title: {
    fontSize: 20,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 11,
    color: '#6b7280',
    marginBottom: 20,
  },
  signalHeading: {
    fontSize: 13,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 4,
    marginTop: 16,
  },
  metaRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 6,
  },
  badge: {
    fontSize: 9,
    color: '#374151',
    backgroundColor: '#f3f4f6',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  description: {
    color: '#374151',
    marginBottom: 8,
  },
  criteriaRow: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 4,
    marginBottom: 8,
    overflow: 'hidden',
  },
  criteriaCell: {
    flex: 1,
    padding: 6,
  },
  criteriaLabel: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 2,
  },
  criteriaValue: {
    fontSize: 9,
    color: '#374151',
  },
  divider: {
    borderLeftWidth: 1,
    borderLeftColor: '#e5e7eb',
  },
  questionsLabel: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    color: '#6b7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  question: {
    fontSize: 9,
    color: '#374151',
    marginBottom: 2,
  },
  separator: {
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    marginVertical: 12,
  },
});

function buildPdfDocument(rubric: Rubric) {
  const sorted = [...rubric.signals].sort((a, b) => b.weight - a.weight);
  const createdDate = new Date(rubric.createdAt).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return React.createElement(
    Document,
    null,
    React.createElement(
      Page,
      { size: 'A4', style: pdfStyles.page },
      React.createElement(Text, { style: pdfStyles.title }, rubric.role),
      React.createElement(
        Text,
        { style: pdfStyles.subtitle },
        `${toTitleCase(rubric.level)} · ${rubric.signals.length} signals · Created ${createdDate}`
      ),
      ...sorted.flatMap((signal: Signal, index: number) => [
        React.createElement(View, { key: `sep-${signal.id}`, style: index > 0 ? pdfStyles.separator : {} }),
        React.createElement(
          Text,
          { key: `heading-${signal.id}`, style: pdfStyles.signalHeading },
          `${index + 1}. ${signal.name}`
        ),
        React.createElement(
          View,
          { key: `meta-${signal.id}`, style: pdfStyles.metaRow },
          React.createElement(Text, { style: pdfStyles.badge }, `Weight: ${signal.weight}/10`),
          React.createElement(Text, { style: pdfStyles.badge }, toTitleCase(signal.suggestedModality))
        ),
        React.createElement(
          Text,
          { key: `desc-${signal.id}`, style: pdfStyles.description },
          signal.description
        ),
        React.createElement(
          View,
          { key: `criteria-${signal.id}`, style: pdfStyles.criteriaRow },
          React.createElement(
            View,
            { style: pdfStyles.criteriaCell },
            React.createElement(Text, { style: { ...pdfStyles.criteriaLabel, color: '#15803d' } }, 'EXCEEDS'),
            React.createElement(Text, { style: pdfStyles.criteriaValue }, signal.criteria.exceeds)
          ),
          React.createElement(
            View,
            { style: { ...pdfStyles.criteriaCell, ...pdfStyles.divider } },
            React.createElement(Text, { style: { ...pdfStyles.criteriaLabel, color: '#1d4ed8' } }, 'MEETS'),
            React.createElement(Text, { style: pdfStyles.criteriaValue }, signal.criteria.meets)
          ),
          React.createElement(
            View,
            { style: { ...pdfStyles.criteriaCell, ...pdfStyles.divider } },
            React.createElement(Text, { style: { ...pdfStyles.criteriaLabel, color: '#c2410c' } }, 'BELOW'),
            React.createElement(Text, { style: pdfStyles.criteriaValue }, signal.criteria.below)
          )
        ),
        React.createElement(
          View,
          { key: `questions-${signal.id}` },
          React.createElement(Text, { style: pdfStyles.questionsLabel }, 'Suggested Questions'),
          ...signal.suggestedQuestions.map((q, qi) =>
            React.createElement(
              Text,
              { key: qi, style: pdfStyles.question },
              `${qi + 1}. ${q}`
            )
          )
        ),
      ])
    )
  );
}

// ─── DOCX ─────────────────────────────────────────────────────────────────────

function buildDocx(rubric: Rubric): DocxDocument {
  const sorted = [...rubric.signals].sort((a, b) => b.weight - a.weight);
  const createdDate = new Date(rubric.createdAt).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const noBorder = {
    top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
    bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
    left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
    right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  };

  const children = [
    new Paragraph({
      text: rubric.role,
      heading: HeadingLevel.HEADING_1,
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: `${toTitleCase(rubric.level)} · ${rubric.signals.length} signals · Created ${createdDate}`,
          color: '6b7280',
          size: 22,
        }),
      ],
      spacing: { after: 300 },
    }),
    ...sorted.flatMap((signal: Signal, index: number): (Paragraph | Table)[] => [
      new Paragraph({
        text: `${index + 1}. ${signal.name}`,
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 300 },
      }),
      new Paragraph({
        children: [
          new TextRun({ text: `Weight: ${signal.weight}/10`, bold: true }),
          new TextRun({ text: '   ' }),
          new TextRun({ text: `Modality: ${toTitleCase(signal.suggestedModality)}`, italics: true }),
        ],
        spacing: { after: 100 },
      }),
      new Paragraph({
        text: signal.description,
        spacing: { after: 200 },
      }),
      // Criteria table
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({
            tableHeader: true,
            children: [
              new TableCell({
                borders: noBorder,
                shading: { fill: 'dcfce7' },
                children: [new Paragraph({ children: [new TextRun({ text: 'Exceeds', bold: true, color: '15803d' })] })],
              }),
              new TableCell({
                borders: noBorder,
                shading: { fill: 'dbeafe' },
                children: [new Paragraph({ children: [new TextRun({ text: 'Meets', bold: true, color: '1d4ed8' })] })],
              }),
              new TableCell({
                borders: noBorder,
                shading: { fill: 'ffedd5' },
                children: [new Paragraph({ children: [new TextRun({ text: 'Below', bold: true, color: 'c2410c' })] })],
              }),
            ],
          }),
          new TableRow({
            children: [
              new TableCell({
                borders: noBorder,
                children: [new Paragraph({ text: signal.criteria.exceeds })],
              }),
              new TableCell({
                borders: noBorder,
                children: [new Paragraph({ text: signal.criteria.meets })],
              }),
              new TableCell({
                borders: noBorder,
                children: [new Paragraph({ text: signal.criteria.below })],
              }),
            ],
          }),
        ],
      }),
      // Questions
      new Paragraph({
        children: [new TextRun({ text: 'Suggested Questions', bold: true })],
        spacing: { before: 200, after: 80 },
      }),
      ...signal.suggestedQuestions.map(
        (q, qi) =>
          new Paragraph({
            text: `${qi + 1}. ${q}`,
            spacing: { after: 60 },
          })
      ),
    ]),
  ];

  return new DocxDocument({ sections: [{ children }] });
}

// ─── Route ────────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { rubric?: unknown; format?: unknown };
    const { rubric, format } = body;

    if (!rubric || !format) {
      return NextResponse.json(
        { error: 'Missing required fields: rubric, format' },
        { status: 400 }
      );
    }

    if (format !== 'pdf' && format !== 'docx') {
      return NextResponse.json(
        { error: 'Invalid format. Must be "pdf" or "docx"' },
        { status: 400 }
      );
    }

    const rubricData = rubric as Rubric;

    if (format === 'docx') {
      const doc = buildDocx(rubricData);
      const nodeBuffer = await Packer.toBuffer(doc);
      const buffer = new Uint8Array(nodeBuffer);

      return new NextResponse(buffer, {
        status: 200,
        headers: {
          'Content-Type':
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'Content-Disposition': 'attachment; filename="rubric.docx"',
        },
      });
    }

    // PDF
    const nodeBuffer = await renderToBuffer(buildPdfDocument(rubricData));
    const pdfBuffer = new Uint8Array(nodeBuffer);

    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="rubric.pdf"',
      },
    });
  } catch (error) {
    console.error('Export error:', error);
    return NextResponse.json({ error: 'Failed to export rubric' }, { status: 500 });
  }
}
