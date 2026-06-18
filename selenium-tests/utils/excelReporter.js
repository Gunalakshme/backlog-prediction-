import ExcelJS from 'exceljs';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const reportsDir = path.resolve(__dirname, '../reports');

export class ExcelReporter {
  constructor() {
    this.results = [];
  }

  addResult(result) {
    // result expects: { id, moduleName, description, expected, actual, status, duration, screenshot }
    this.results.push(result);
  }

  async generateReport() {
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('E2E Test Results');

    sheet.columns = [
      { header: 'Test Case ID', key: 'id', width: 15 },
      { header: 'Module Name', key: 'moduleName', width: 20 },
      { header: 'Test Case Name', key: 'description', width: 50 },
      { header: 'Expected Result', key: 'expected', width: 40 },
      { header: 'Actual Result', key: 'actual', width: 40 },
      { header: 'Status', key: 'status', width: 15 },
      { header: 'Execution Time (ms)', key: 'duration', width: 20 },
      { header: 'Screenshot Path', key: 'screenshot', width: 50 }
    ];

    this.results.forEach(r => sheet.addRow(r));

    // Styling
    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A5276' } };

    sheet.eachRow((row, rowNumber) => {
      row.eachCell(cell => {
        cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
        cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
      });
      if (rowNumber > 1) {
        const statusCell = row.getCell('status');
        if (statusCell.value === 'PASS') {
          statusCell.font = { color: { argb: 'FF2F7A4D' }, bold: true };
        } else if (statusCell.value === 'FAIL') {
          statusCell.font = { color: { argb: 'FFB23A2C' }, bold: true };
        }
      }
    });

    const reportPath = path.join(reportsDir, 'TestReport.xlsx');
    await workbook.xlsx.writeFile(reportPath);
    console.log(`\nExcel report generated at: ${reportPath}`);

    // Mirror to brain
    const brainPath = 'C:\\Users\\Guna\\.gemini\\antigravity-ide\\brain\\ffe932cb-926d-4dcb-9701-5b6e9404bfec\\TestReport.xlsx';
    try {
      await workbook.xlsx.writeFile(brainPath);
    } catch (e) {
      console.error(e.message);
    }
  }
}
