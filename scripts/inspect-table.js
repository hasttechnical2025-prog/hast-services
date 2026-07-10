const fs = require('fs');
const PizZip = require('pizzip');

function inspect() {
  const file = 'src/lib/report/bao-cao-ktv-template.docx';
  if (!fs.existsSync(file)) {
    console.log('File not found:', file);
    return;
  }
  const zip = new PizZip(fs.readFileSync(file));
  const docXml = zip.files['word/document.xml'].asText();

  // In ra cấu trúc bảng
  const tableMatch = docXml.match(/<w:tbl[\s>][^]*?<\/w:tbl>/);
  if (tableMatch) {
    console.log('Table found!');
    // Lấy phần w:tblPr và w:tblGrid
    const tblPr = tableMatch[0].match(/<w:tblPr[\s>][^]*?<\/w:tblPr>/);
    const tblGrid = tableMatch[0].match(/<w:tblGrid[\s>][^]*?<\/w:tblGrid>/);
    if (tblPr) console.log('tblPr:', tblPr[0]);
    if (tblGrid) console.log('tblGrid:', tblGrid[0]);

    // Đọc các dòng (w:tr)
    const rows = tableMatch[0].match(/<w:tr[\s>][^]*?<\/w:tr>/g) || [];
    console.log('Number of rows in template table:', rows.length);
    rows.forEach((r, i) => {
      console.log(`--- Row ${i + 1} ---`);
      const cells = r.match(/<w:tc[\s>][^]*?<\/w:tc>/g) || [];
      cells.forEach((c, ci) => {
        const tcW = c.match(/<w:tcW[\s>][^]*?\/>/);
        const text = (c.match(/<w:t[\s>][^]*?<\/w:t>/g) || []).map(t => t.match(/>(.*?)<\/w:t>/)[1]).join('');
        console.log(`  Cell ${ci + 1}: width=${tcW ? tcW[0] : 'none'}, text="${text}"`);
      });
    });
  } else {
    console.log('No table found in document.xml');
  }
}

inspect();