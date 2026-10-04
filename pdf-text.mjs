import { createRequire, isBuiltin } from 'node:module';

// Node 22.2 predates process.getBuiltinModule. PDF.js uses this synchronous API
// to load its Node helpers; provide the same built-in-only lookup before import.
if (!process.getBuiltinModule) {
  const require = createRequire(import.meta.url);
  process.getBuiltinModule = id => isBuiltin(id) ? require(id) : undefined;
}

export async function extractPDFText(bytes) {
  const { PDFParse } = await import('pdf-parse');
  const parser = new PDFParse({ data: new Uint8Array(bytes) });
  try { return (await parser.getText()).text; }
  finally { await parser.destroy(); }
}
