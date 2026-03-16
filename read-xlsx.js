const XLSX = require('xlsx');
const workbook = XLSX.readFile('/Users/hufford/Downloads/Super super fan.xlsx');

for (const sheetName of workbook.SheetNames) {
  console.log(`\n=== SHEET: ${sheetName} ===`);
  const sheet = workbook.Sheets[sheetName];

  // Show raw cell values and formulas for first few rows
  const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1');
  const maxRow = Math.min(range.e.r, 5); // first 6 rows (header + 5 data)

  for (let r = 0; r <= maxRow; r++) {
    const rowData = [];
    for (let c = range.s.c; c <= range.e.c; c++) {
      const addr = XLSX.utils.encode_cell({ r, c });
      const cell = sheet[addr];
      if (cell) {
        let info = `${addr}=`;
        if (cell.f) info += `FORMULA[${cell.f}] → ${cell.v}`;
        else info += cell.v;
        rowData.push(info);
      }
    }
    console.log(`Row ${r}: ${rowData.join(' | ')}`);
  }

  // Specifically look for the score column formula
  console.log('\n--- Score column formulas ---');
  for (let r = 1; r <= Math.min(range.e.r, 25); r++) {
    for (let c = range.s.c; c <= range.e.c; c++) {
      const addr = XLSX.utils.encode_cell({ r, c });
      const cell = sheet[addr];
      if (cell && cell.f && (cell.f.includes('IF(') || cell.f.includes('IFERROR'))) {
        const nameCell = sheet[XLSX.utils.encode_cell({ r, c: 0 })];
        console.log(`${nameCell ? nameCell.v : 'unknown'} [${addr}]: ${cell.f} → ${cell.v}`);
      }
    }
  }
}
