import ExcelJS from 'exceljs';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export interface ExportColumn {
  header: string;
  key: string;
  width?: number; // Approximate width for Excel
}

export const exportToExcel = async (
  columns: ExportColumn[],
  data: any[],
  filename: string,
  sheetName: string = 'Sheet 1'
) => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(sheetName);

  worksheet.columns = columns.map((col) => ({
    header: col.header,
    key: col.key,
    width: col.width || 15,
  }));

  data.forEach((row) => {
    worksheet.addRow(row);
  });

  // Make header bold
  const headerRow = worksheet.getRow(1);
  headerRow.font = { bold: true };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE0E0E0' },
  };

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  window.URL.revokeObjectURL(url);
};

export const exportToPdf = (
  columns: ExportColumn[],
  data: any[],
  filename: string,
  title: string,
  logoData?: string
) => {
  const doc = new jsPDF();

  let startY = 30;

  if (logoData) {
    try {
      // Assuming logo is rectangular/square. Adjust dimensions as needed.
      doc.addImage(logoData, 'PNG', 14, 10, 25, 25);
      doc.setFontSize(18);
      doc.text(title, 45, 25);
      startY = 40;
    } catch (e) {
      doc.setFontSize(18);
      doc.text(title, 14, 22);
    }
  } else {
    doc.setFontSize(18);
    doc.text(title, 14, 22);
  }

  const tableData = data.map((row) =>
    columns.map((col) => {
      const val = row[col.key];
      return val === null || val === undefined ? '' : String(val);
    })
  );

  autoTable(doc, {
    startY: startY,
    head: [columns.map((col) => col.header)],
    body: tableData,
    theme: 'striped',
    headStyles: { fillColor: [0, 31, 63] }, // Navy color to match app theme
  });

  doc.save(filename);
};
