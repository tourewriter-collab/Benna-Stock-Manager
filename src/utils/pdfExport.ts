import jsPDF from 'jspdf';
import i18n from '../i18n';
import autoTable from 'jspdf-autotable';
import { formatCurrency } from './currency';
import { numberToWords } from './numberToWords';

interface OrderItem {
  description: string;
  quantity: number;
  unit_price: number;
  total: number;
  delivered_quantity?: number;
  category?: string;
}

interface OrderData {
  id: string;
  order_date: string;
  expected_date?: string | null;
  delivery_status?: string;
  notes?: string | null;
  supplier: {
    name: string;
    address?: string;
    phone?: string;
    email?: string;
  } | null;
  items: OrderItem[];
  total_amount: number;
  paid_amount: number;
  balance: number;
}

interface Settings {
  company_logo?: string;
  print_language?: string;
}

const LEFT_MARGIN = 20;

/**
 * Returns a document label based on the print_language setting.
 * - 'en' → English only
 * - 'fr' → French only
 * - 'both' → "English / French"
 */
const getLabel = (key: string, printLang: string): string => {
  const en = i18n.t(key, { lng: 'en' });
  const fr = i18n.t(key, { lng: 'fr' });

  if (printLang === 'en') return en;
  if (printLang === 'fr') return fr;
  // 'both' — only show slash if they actually differ
  if (en.toLowerCase() === fr.toLowerCase()) return en;
  return `${en} / ${fr}`;
};

export const generateOrderPDF = (order: OrderData, settings: Settings, _t: (key: string) => string) => {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.width;
  const pageHeight = doc.internal.pageSize.height;
  const pl = settings.print_language || 'both';

  // Add Logo
  if (settings.company_logo) {
    try {
      // Handle full data URL (e.g. "data:image/png;base64,...")
      let imgData = settings.company_logo;
      let format: string = 'PNG';

      if (imgData.startsWith('data:')) {
        // Extract MIME type: data:image/jpeg;base64,... → 'jpeg'
        const mimeMatch = imgData.match(/data:image\/(\w+);base64,/);
        if (mimeMatch) {
          const mimeType = mimeMatch[1].toLowerCase();
          format = (mimeType === 'jpg' || mimeType === 'jpeg') ? 'JPEG' : 'PNG';
          // Strip the prefix to get raw base64
          imgData = imgData.split(',')[1];
        }
      }

      doc.addImage(imgData, format, LEFT_MARGIN, 10, 35, 35);
    } catch (e) {
      console.error('Error adding logo to PDF:', e);
    }
  }

  // Header title (right side)
  doc.setFontSize(20);
  doc.setTextColor(0, 31, 63); // Navy Blue (#001f3f)
  doc.text(getLabel('purchase_order', pl), pageWidth - 15, 22, { align: 'right' });

  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text(`${getLabel('order_number', pl)}: ${order.id.substring(0, 8).toUpperCase()}`, pageWidth - 15, 30, { align: 'right' });
  doc.text(`${getLabel('order_date', pl)}: ${new Date(order.order_date).toLocaleDateString()}`, pageWidth - 15, 36, { align: 'right' });
  if (order.expected_date) {
    doc.text(`${getLabel('expected_date', pl)}: ${new Date(order.expected_date).toLocaleDateString()}`, pageWidth - 15, 42, { align: 'right' });
  }
  if (order.delivery_status) {
    doc.text(`${getLabel('delivery_status', pl)}: ${getLabel('delivery_' + order.delivery_status, pl)}`, pageWidth - 15, 48, { align: 'right' });
  }

  // Horizontal rule under header
  doc.setDrawColor(0, 31, 63);
  doc.line(LEFT_MARGIN, 52, pageWidth - 15, 52);

  // Supplier Info
  doc.setFontSize(11);
  doc.setTextColor(0, 31, 63);
  doc.setFont('helvetica', 'bold');
  doc.text(getLabel('supplier', pl) + ':', LEFT_MARGIN, 60);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(0);
  doc.text(order.supplier?.name || 'N/A', LEFT_MARGIN, 67);
  if (order.supplier?.address) doc.text(order.supplier.address, LEFT_MARGIN, 73);
  if (order.supplier?.phone) doc.text(order.supplier.phone, LEFT_MARGIN, 79);

  // Items Table
  const rawItems = order.items || [];
  const tableData = rawItems.map(item => {
    const description = item.description || 'N/A';
    const category = item.category ? `[${item.category}]` : '';
    const displayDesc = category ? `${description}\n${category}` : description;
    const qty = Number(item.quantity || 0);
    const price = Number(item.unit_price || 0);
    const total = Number(item.total || (qty * price));
    
    return [
      String(displayDesc),
      String(qty),
      formatCurrency(price),
      formatCurrency(total)
    ];
  });

  const tableBody = tableData.length > 0 ? tableData : [[getLabel('no_items', pl) || 'No items', '—', '—', '—']];

  autoTable(doc, {
    startY: 88,
    margin: { left: LEFT_MARGIN, right: 15 },
    head: [[
      getLabel('description', pl), 
      getLabel('quantity', pl), 
      getLabel('unit_price', pl), 
      getLabel('total', pl)
    ]],
    body: tableBody,
    headStyles: { fillColor: [0, 31, 63], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [245, 247, 250] },
    columnStyles: {
      0: { cellWidth: 'auto' },
      1: { halign: 'center', cellWidth: 25 },
      2: { halign: 'right', cellWidth: 40 },
      3: { halign: 'right', cellWidth: 40 }
    },
    styles: { cellPadding: 4, fontSize: 10, overflow: 'linebreak' }
  });

  const finalY = (doc as any).lastAutoTable.finalY + 10;

  // Totals block — right-aligned, consistent with table
  doc.setFontSize(10);
  doc.setTextColor(0);
  const totalsLabelX = pageWidth - 55;
  const totalsValueX = pageWidth - 14;

  doc.text(`${getLabel('total_amount', pl)}:`, totalsLabelX, finalY, { align: 'right' });
  doc.text(formatCurrency(order.total_amount), totalsValueX, finalY, { align: 'right' });

  doc.text(`${getLabel('paid_amount', pl)}:`, totalsLabelX, finalY + 8, { align: 'right' });
  doc.text(formatCurrency(order.paid_amount), totalsValueX, finalY + 8, { align: 'right' });

  doc.setFont('helvetica', 'bold');
  doc.setDrawColor(0, 31, 63);
  doc.line(totalsLabelX - 30, finalY + 11, totalsValueX, finalY + 11); // separator line
  doc.text(`${getLabel('balance', pl)}:`, totalsLabelX, finalY + 17, { align: 'right' });
  doc.text(formatCurrency(order.balance), totalsValueX, finalY + 17, { align: 'right' });

  // Notes
  if (order.notes) {
    const notesY = finalY + 30;
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(9);
    doc.setTextColor(80);
    const noteLines = doc.splitTextToSize(`${getLabel('notes', pl)}: ${order.notes}`, pageWidth - LEFT_MARGIN - 15);
    doc.text(noteLines, LEFT_MARGIN, notesY);
  }

  // Amount in words
  const wordsY = finalY + (order.notes ? 45 : 30);
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(9);
  doc.setTextColor(0);

  const roundedAmount = Math.round(order.total_amount);

  if (pl === 'fr') {
    const amountFr = numberToWords(roundedAmount, 'fr');
    const fullText = `Arrêtée la présente commande à la somme de : ${amountFr}`;
    const splitLines = doc.splitTextToSize(fullText, pageWidth - LEFT_MARGIN - 15);
    doc.text(splitLines, LEFT_MARGIN, wordsY);
  } else if (pl === 'en') {
    const amountEn = numberToWords(roundedAmount, 'en');
    const fullText = `The total amount of this order is set at: ${amountEn}`;
    const splitLines = doc.splitTextToSize(fullText, pageWidth - LEFT_MARGIN - 15);
    doc.text(splitLines, LEFT_MARGIN, wordsY);
  } else {
    // 'both' — render two lines
    const amountEn = numberToWords(roundedAmount, 'en');
    const amountFr = numberToWords(roundedAmount, 'fr');
    const lineEn = `The total amount of this order is set at: ${amountEn}`;
    const lineFr = `Arrêtée la présente commande à la somme de : ${amountFr}`;
    const splitEn = doc.splitTextToSize(lineEn, pageWidth - LEFT_MARGIN - 15);
    doc.text(splitEn, LEFT_MARGIN, wordsY);
    const splitFr = doc.splitTextToSize(lineFr, pageWidth - LEFT_MARGIN - 15);
    doc.text(splitFr, LEFT_MARGIN, wordsY + (splitEn.length * 4) + 4);
  }

  // Signature section — always anchored near the bottom of the page
  const sigY = Math.max(wordsY + 40, pageHeight - 45);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(0);
  doc.setDrawColor(0);
  doc.line(LEFT_MARGIN, sigY, LEFT_MARGIN + 65, sigY);
  doc.text(getLabel('approved_by', pl), LEFT_MARGIN, sigY + 5);

  doc.line(pageWidth - 80, sigY, pageWidth - 15, sigY);
  doc.text(getLabel('received_by', pl), pageWidth - 80, sigY + 5);

  // Footer
  doc.setFontSize(8);
  doc.setTextColor(150);
  doc.text('Generated by Benna Business Manager', pageWidth / 2, doc.internal.pageSize.height - 10, { align: 'center' });

  doc.save(`PO_${order.id.substring(0, 8)}.pdf`);
};
