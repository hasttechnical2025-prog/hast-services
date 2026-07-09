const fs = require('fs');
const PizZip = require('pizzip');

function readDocxText(filePath) {
  const content = fs.readFileSync(filePath);
  const zip = new PizZip(content);
  const docXml = zip.files['word/document.xml'].asText();

  // Regex đơn giản để bóc tách toàn bộ text từ thẻ <w:t> trong XML của Word
  const matches = docXml.match(/<w:t[\s>][^]*?<\/w:t>/g) || [];
  const textList = matches.map(m => {
    // Lấy nội dung bên trong <w:t>...</w:t>
    const contentMatch = m.match(/>([^]*?)<\/w:t>/);
    return contentMatch ? contentMatch[1] : '';
  });

  console.log('--- NỘI DUNG FILE WORD ---');
  console.log(textList.join(''));
}

readDocxText('bao_cao_ktv.docx');