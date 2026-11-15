import pdf from 'pdf-parse';
import mammoth from 'mammoth';
import { createWorker } from 'tesseract.js';

export interface ExtractedSpan {
  text: string;
  startIndex: number;
  endIndex: number;
  paragraphIndex: number;
}

export interface PreprocessedContent {
  rawText: string;
  normalizedText: string;
  sentences: ExtractedSpan[];
  paragraphs: string[];
  wordCount: number;
}

// Magic bytes validation for uploaded file security
export function validateFileSignature(buffer: Buffer, mimeType: string): boolean {
  if (buffer.length < 4) return false;

  if (mimeType === 'application/pdf') {
    // PDF starts with %PDF (0x25 0x50 0x44 0x46)
    return buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46;
  }

  if (
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    mimeType === 'application/msword'
  ) {
    // DOCX is a zip archive starting with PK\x03\x04
    return (
      (buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04) ||
      (buffer[0] === 0xd0 && buffer[1] === 0xcf && buffer[2] === 0x11 && buffer[3] === 0xe0) // legacy doc
    );
  }

  if (mimeType === 'image/png') {
    return buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47;
  }

  if (mimeType === 'image/jpeg') {
    return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }

  if (mimeType === 'image/webp') {
    return buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP';
  }

  // Text/Markdown files must not contain binary null bytes
  if (mimeType === 'text/plain' || mimeType === 'text/markdown') {
    for (let i = 0; i < Math.min(buffer.length, 1024); i++) {
      if (buffer[i] === 0) return false;
    }
    return true;
  }

  return true;
}

// OCR execution with a safe 15s timeout
export async function extractTextWithOcr(buffer: Buffer): Promise<string> {
  const ocrPromise = (async () => {
    const worker = await createWorker('eng');
    const ret = await worker.recognize(buffer);
    await worker.terminate();
    return ret.data.text || '';
  })();

  const timeoutPromise = new Promise<string>((_, reject) =>
    setTimeout(() => reject(new Error('OCR extraction timed out after 15s')), 15000)
  );

  return Promise.race([ocrPromise, timeoutPromise]);
}

export async function extractTextFromFile(buffer: Buffer, mimeType: string): Promise<string> {
  if (mimeType === 'application/pdf') {
    const data = await pdf(buffer);
    const parsedText = data.text ? data.text.trim() : '';

    // If PDF text is substantial, return it directly
    if (parsedText.length >= 25) {
      return parsedText;
    }

    // Scanned PDF fallback via OCR
    try {
      const ocrText = await extractTextWithOcr(buffer);
      if (ocrText.trim().length > 0) {
        return ocrText.trim();
      }
    } catch (ocrErr) {
      console.warn('Scanned PDF OCR fallback skipped or timed out:', ocrErr);
    }
    return parsedText;
  }

  if (
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    mimeType === 'application/msword'
  ) {
    const result = await mammoth.extractRawText({ buffer });
    return result.value || '';
  }

  if (mimeType.startsWith('image/')) {
    try {
      return await extractTextWithOcr(buffer);
    } catch (e: any) {
      console.warn('Image OCR extraction skipped or timed out:', e);
      return '';
    }
  }

  // Plain text or markdown
  return buffer.toString('utf-8');
}

export function preprocessContent(text: string): PreprocessedContent {
  const normalizedText = text.replace(/\r\n/g, '\n');
  const paragraphs = normalizedText.split(/\n\s*\n/).filter(p => p.trim().length > 0);

  // Split into sentences preserving character offsets
  const sentences: ExtractedSpan[] = [];
  const sentenceRegex = /[^.!?\n]+[.!?]+(?:\s+|$)|[^.!?\n]+$/g;
  let match: RegExpExecArray | null;

  while ((match = sentenceRegex.exec(normalizedText)) !== null) {
    const rawSpan = match[0];
    const trimmed = rawSpan.trim();
    if (trimmed.length > 0) {
      const offsetInSpan = rawSpan.indexOf(trimmed);
      const startIndex = match.index + offsetInSpan;
      const endIndex = startIndex + trimmed.length;

      // Determine paragraph index
      const textBefore = normalizedText.substring(0, startIndex);
      const paragraphIndex = (textBefore.match(/\n\s*\n/g) || []).length;

      sentences.push({
        text: trimmed,
        startIndex,
        endIndex,
        paragraphIndex
      });
    }
  }

  const words = normalizedText.trim().split(/\s+/).filter(w => w.length > 0);

  return {
    rawText: text,
    normalizedText,
    sentences,
    paragraphs,
    wordCount: words.length
  };
}

