import fs from 'fs';
import PDFParser from 'pdf2json';

export const loadPdfAndChunk = async (pdfPath) => {
  if (!fs.existsSync(pdfPath)) {
    throw new Error(`PDF file not found at: ${pdfPath}`);
  }

  return new Promise((resolve, reject) => {
    const pdfParser = new PDFParser();
    const chunks = [];

    pdfParser.on('pdfParser_dataReady', (pdfData) => {
      try {
        let fullText = pdfData.Pages
          .map(page => 
            page.Texts.map(text => 
              decodeURIComponent(text.R.map(run => run.T).join(''))
            ).join(' ')
          ).join('\n');

        // Better chunking (split by sentences/paragraphs)
        const sentences = fullText.split(/(?<=[.!?])\s+/);
        let currentChunk = '';
        
        for (const sentence of sentences) {
          if ((currentChunk + sentence).length > 500) {
            chunks.push(currentChunk.trim());
            currentChunk = sentence;
          } else {
            currentChunk += ' ' + sentence;
          }
        }
        
        if (currentChunk.trim()) chunks.push(currentChunk.trim());
        resolve(chunks);
      } catch (err) {
        reject(err);
      }
    });

    pdfParser.on('pdfParser_dataError', (err) => reject(err));
    pdfParser.loadPDF(pdfPath);
  });
};