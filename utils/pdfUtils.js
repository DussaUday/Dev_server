import fs from 'fs';
import PDFParser from 'pdf2json';

export const loadPdfAndChunk = async (pdfPath) => {
  if (!fs.existsSync(pdfPath)) {
    throw new Error(`PDF file not found at: ${pdfPath}`);
  }

  const pdfParser = new PDFParser();
  const chunks = [];

  return new Promise((resolve, reject) => {
    pdfParser.on('pdfParser_dataReady', (pdfData) => {
      const text = pdfData.Pages.map(page =>
        page.Texts.map(t => decodeURIComponent(t.R[0].T)).join(' ')
      ).join(' ');

      const chunkSize = 1000;
      for (let i = 0; i < text.length; i += chunkSize) {
        chunks.push(text.slice(i, i + chunkSize));
      }

      resolve(chunks);
    });

    pdfParser.on('pdfParser_dataError', (err) => reject(err));
    pdfParser.loadPDF(pdfPath);
  });
};
