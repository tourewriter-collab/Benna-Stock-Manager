import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { FileText, Plus, Edit, Trash2, Printer } from 'lucide-react';
import { fetchApi } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { formatPrice } from '../utils/currency';

interface Invoice {
  id: string;
  client_id: string;
  order_id: string | null;
  invoice_date: string;
  due_date: string | null;
  total_amount: number;
  paid_amount: number;
  status: 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled';
  notes: string;
}

const Invoices: React.FC = () => {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const isFr = i18n.language.startsWith('fr');
  
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [showModal, setShowModal] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);
  const [formData, setFormData] = useState({
    client_id: '',
    due_date: '',
    total_amount: '0',
    paid_amount: '0',
    status: 'draft' as Invoice['status'],
    notes: ''
  });

  const canEdit = user?.role === 'admin' || user?.role === 'audit_manager';

  const loadInvoices = async (showLoad = true) => {
    if (showLoad) setLoading(true);
    try {
      const data = await fetchApi('/invoices');
      setInvoices(data || []);
    } catch (error) {
      console.error('Error fetching invoices:', error);
    } finally {
      if (showLoad) setLoading(false);
    }
  };

  useEffect(() => {
    loadInvoices();
  }, []);

  const handleOpenModal = (invoice: Invoice | null = null) => {
    if (invoice) {
      setEditingInvoice(invoice);
      setFormData({
        client_id: invoice.client_id,
        due_date: invoice.due_date ? new Date(invoice.due_date).toISOString().split('T')[0] : '',
        total_amount: String(invoice.total_amount),
        paid_amount: String(invoice.paid_amount),
        status: invoice.status,
        notes: invoice.notes || ''
      });
    } else {
      setEditingInvoice(null);
      setFormData({
        client_id: '',
        due_date: '',
        total_amount: '0',
        paid_amount: '0',
        status: 'draft',
        notes: ''
      });
    }
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.client_id.trim()) return;

    try {
      const payload = {
        ...formData,
        due_date: formData.due_date || null
      };

      if (editingInvoice) {
        await fetchApi(`/invoices/${editingInvoice.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload)
        });
      } else {
        await fetchApi('/invoices', {
          method: 'POST',
          body: JSON.stringify(payload)
        });
      }

      setShowModal(false);
      await loadInvoices(false);
    } catch (error) {
      console.error('Error saving invoice:', error);
      alert(t('error'));
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t('confirm_archive_invoice', 'Are you sure you want to archive this invoice?'))) return;
    try {
      await fetchApi(`/invoices/${id}`, { method: 'DELETE' });
      await loadInvoices(false);
    } catch (error) {
      console.error('Error archiving invoice:', error);
    }
  };

  const printInvoice = async (invoice: Invoice) => {
    // Fetch print language preference from settings
    let pl = 'both';
    try {
      const settings = await fetchApi('/settings');
      pl = settings?.print_language || 'both';
    } catch { /* default to both */ }

    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const chosenLang = pl === 'both' ? (isFr ? 'fr' : 'en') : pl;

    const labels: Record<string, Record<string, string>> = {
      invoice_title: { en: 'INVOICE', fr: 'FACTURE' },
      invoice_id: { en: 'Invoice ID', fr: 'ID Facture' },
      date: { en: 'Date', fr: 'Date' },
      due_date: { en: 'Due Date', fr: 'Date d\'Échéance' },
      client: { en: 'Client', fr: 'Client' },
      status: { en: 'Status', fr: 'Statut' },
      total_amount: { en: 'Total Amount', fr: 'Montant Total' },
      paid_amount: { en: 'Paid Amount', fr: 'Montant Payé' },
      balance_due: { en: 'Balance Due', fr: 'Reste à Payer' },
      notes: { en: 'Notes', fr: 'Notes' },
      sig_authorized: { en: 'Authorized Signature', fr: 'Signature Autorisée' },
      sig_client: { en: 'Client Signature', fr: 'Signature Client' },
    };
    const L = (key: string) => labels[key]?.[chosenLang] || labels[key]?.[isFr ? 'fr' : 'en'] || key;

    const balance = invoice.total_amount - invoice.paid_amount;

    printWindow.document.write(`
      <html>
        <head>
          <title>${L('invoice_title')} - ${invoice.id}</title>
          <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 40px; color: #333; max-width: 800px; margin: 0 auto; line-height: 1.5; }
            .header-container { display: flex; justify-content: space-between; border-bottom: 2px solid #0a0c10; padding-bottom: 20px; margin-bottom: 30px; }
            .company-details h1 { color: #0a0c10; margin: 0; font-size: 28px; font-weight: 800; }
            .company-details p { margin: 5px 0 0 0; color: #666; font-size: 14px; }
            .invoice-title-box { text-align: right; }
            .invoice-title-box h2 { color: #0a0c10; margin: 0; font-size: 24px; font-weight: 700; letter-spacing: 1px; }
            .invoice-title-box p { margin: 5px 0 0 0; font-weight: 600; color: #555; }
            .details-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 30px; }
            .details-box { background: #f8f9fa; border: 1px solid #e9ecef; padding: 15px; border-radius: 8px; }
            .details-box h3 { margin: 0 0 10px 0; font-size: 14px; color: #0a0c10; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid #dee2e6; padding-bottom: 5px; }
            .details-row { display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 14px; }
            .details-row span { color: #666; }
            .details-row strong { color: #212529; }
            .financial-table { width: 100%; border-collapse: collapse; margin-top: 20px; margin-bottom: 30px; }
            .financial-table th, .financial-table td { padding: 12px 15px; text-align: left; border-bottom: 1px solid #dee2e6; }
            .financial-table th { background-color: #f1f3f5; color: #0a0c10; font-weight: 700; }
            .financial-table td { font-size: 15px; }
            .financial-table .text-right { text-align: right; }
            .summary-box { float: right; width: 300px; margin-bottom: 40px; }
            .summary-row { display: flex; justify-content: space-between; padding: 8px 0; font-size: 14px; }
            .summary-row.total { border-top: 1px solid #dee2e6; border-bottom: 2px double #0a0c10; font-size: 16px; font-weight: 700; color: #0a0c10; padding: 10px 0; }
            .clear { clear: both; }
            .notes-box { background-color: #fff8e1; border-left: 4px solid #ffb300; padding: 15px; border-radius: 4px; margin-bottom: 40px; font-size: 13px; }
            .notes-box h4 { margin: 0 0 5px 0; color: #b78103; }
            .notes-box p { margin: 0; color: #5f4b1d; }
            .footer-sig { display: flex; justify-content: space-between; margin-top: 60px; }
            .signature { border-top: 1px solid #aaa; width: 220px; text-align: center; padding-top: 8px; font-size: 13px; color: #666; }
          </style>
        </head>
        <body>
          <div class="header-container">
            <div class="company-details">
              <h1>IKIKÉ BUSINESS MANAGER</h1>
              <p>Conakry, Guinée</p>
            </div>
            <div class="invoice-title-box">
              <h2>${L('invoice_title')}</h2>
              <p># ${invoice.id.substring(0, 8).toUpperCase()}</p>
            </div>
          </div>

          <div class="details-grid">
            <div class="details-box">
              <h3>${L('client')}</h3>
              <div class="details-row"><span>${L('client')}:</span> <strong>${invoice.client_id}</strong></div>
            </div>
            <div class="details-box">
              <h3>${L('invoice_id')}</h3>
              <div class="details-row"><span>${L('date')}:</span> <strong>${new Date(invoice.invoice_date).toLocaleDateString(chosenLang === 'fr' ? 'fr-FR' : 'en-US')}</strong></div>
              <div class="details-row"><span>${L('due_date')}:</span> <strong>${invoice.due_date ? new Date(invoice.due_date).toLocaleDateString(chosenLang === 'fr' ? 'fr-FR' : 'en-US') : 'N/A'}</strong></div>
              <div class="details-row"><span>${L('status')}:</span> <strong style="text-transform: uppercase;">${t(`invoice_status_${invoice.status}`, invoice.status)}</strong></div>
            </div>
          </div>

          <table class="financial-table">
            <thead>
              <tr>
                <th>Description</th>
                <th class="text-right">Amount / Montant</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>General Delivery/Services Rendered</td>
                <td class="text-right">${formatPrice(invoice.total_amount)}</td>
              </tr>
            </tbody>
          </table>

          <div class="summary-box">
            <div class="summary-row">
              <span>Subtotal:</span>
              <span>${formatPrice(invoice.total_amount)}</span>
            </div>
            <div class="summary-row">
              <span>${L('paid_amount')}:</span>
              <span style="color: #2e7d32;">${formatPrice(invoice.paid_amount)}</span>
            </div>
            <div class="summary-row total">
              <span>${L('balance_due')}:</span>
              <span>${formatPrice(balance)}</span>
            </div>
          </div>
          <div class="clear"></div>

          ${invoice.notes ? `
          <div class="notes-box">
            <h4>${L('notes')}</h4>
            <p>${invoice.notes}</p>
          </div>
          ` : ''}

          <div class="footer-sig">
            <div class="signature">${L('sig_authorized')}</div>
            <div class="signature">${L('sig_client')}</div>
          </div>

          <script>
            window.onload = function() { window.print(); window.close(); }
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const statusColors = {
    draft: 'bg-gray-100 text-gray-800 border-gray-200',
    sent: 'bg-gold-100 text-gold-800 border-gold-200',
    paid: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    overdue: 'bg-red-100 text-red-800 border-red-200',
    cancelled: 'bg-yellow-100 text-yellow-800 border-yellow-200'
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="bg-navy bg-opacity-10 p-2.5 rounded-lg text-navy">
            <FileText className="w-8 h-8" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-navy">{t('invoices', 'Invoices')}</h1>
            <p className="text-sm text-gray-500">{t('manage_invoices', 'Manage and track client invoices')}</p>
          </div>
        </div>
        {canEdit && (
          <button
            onClick={() => handleOpenModal()}
            className="flex items-center gap-2 bg-[#0a0c10] text-white px-4 py-2 rounded-lg hover:bg-[#1a1a1a] transition-colors shadow-sm"
          >
            <Plus className="w-5 h-5" />
            {t('create_invoice', 'Create Invoice')}
          </button>
        )}
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-500 font-semibold">{t('loading')}</div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr className="border-b text-left">
                  <th className="py-3.5 px-4 text-xs font-bold uppercase text-gray-500">{t('date')}</th>
                  <th className="py-3.5 px-4 text-xs font-bold uppercase text-gray-500">{t('client')}</th>
                  <th className="py-3.5 px-4 text-xs font-bold uppercase text-gray-500 text-right">{t('total_amount', 'Total Amount')}</th>
                  <th className="py-3.5 px-4 text-xs font-bold uppercase text-gray-500 text-right">{t('paid_amount', 'Paid Amount')}</th>
                  <th className="py-3.5 px-4 text-xs font-bold uppercase text-gray-500">{t('status')}</th>
                  <th className="py-3.5 px-4 text-xs font-bold uppercase text-gray-500 text-right">{t('actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {invoices.map((invoice) => (
                  <tr key={invoice.id} className="hover:bg-gray-50/50">
                    <td className="py-3 px-4 text-sm font-medium text-gray-800">
                      {new Date(invoice.invoice_date).toLocaleDateString(isFr ? 'fr-FR' : 'en-US')}
                    </td>
                    <td className="py-3 px-4 text-sm font-semibold text-navy">{invoice.client_id}</td>
                    <td className="py-3 px-4 text-sm text-right font-semibold text-gray-900">{formatPrice(invoice.total_amount)}</td>
                    <td className="py-3 px-4 text-sm text-right font-medium text-emerald-600">{formatPrice(invoice.paid_amount)}</td>
                    <td className="py-3 px-4 text-sm">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${statusColors[invoice.status]}`}>
                        {t(`invoice_status_${invoice.status}`, invoice.status)}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-sm text-right">
                      <div className="flex justify-end space-x-3">
                        <button onClick={() => printInvoice(invoice)} className="text-gray-600 hover:text-gray-800" title={t('print', 'Print')}>
                          <Printer className="w-4.5 h-4.5" />
                        </button>
                        {canEdit && (
                          <>
                            <button onClick={() => handleOpenModal(invoice)} className="text-gold-600 hover:text-gold-800">
                              <Edit className="w-4.5 h-4.5" />
                            </button>
                            <button onClick={() => handleDelete(invoice.id)} className="text-red-600 hover:text-red-800">
                              <Trash2 className="w-4.5 h-4.5" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {invoices.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-gray-500 font-semibold">
                      {t('no_invoices_found', 'No invoices found.')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-2xl">
            <h2 className="text-2xl font-bold text-navy mb-4">
              {editingInvoice ? t('edit_invoice', 'Edit Invoice') : t('create_invoice', 'Create Invoice')}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('client')} *</label>
                <input
                  type="text"
                  required
                  value={formData.client_id}
                  onChange={(e) => setFormData({ ...formData, client_id: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-navy focus:border-transparent outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('total_amount')} *</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={formData.total_amount}
                    onChange={(e) => setFormData({ ...formData, total_amount: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-navy focus:border-transparent outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('paid_amount')}</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.paid_amount}
                    onChange={(e) => setFormData({ ...formData, paid_amount: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-navy focus:border-transparent outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('due_date', 'Due Date')}</label>
                  <input
                    type="date"
                    value={formData.due_date}
                    onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-navy focus:border-transparent outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('status')}</label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value as Invoice['status'] })}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-navy focus:border-transparent outline-none"
                  >
                    <option value="draft">{t('invoice_status_draft', 'Draft')}</option>
                    <option value="sent">{t('invoice_status_sent', 'Sent')}</option>
                    <option value="paid">{t('invoice_status_paid', 'Paid')}</option>
                    <option value="overdue">{t('invoice_status_overdue', 'Overdue')}</option>
                    <option value="cancelled">{t('invoice_status_cancelled', 'Cancelled')}</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('notes')}</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-navy focus:border-transparent outline-none"
                  rows={2}
                />
              </div>

              <div className="flex gap-3 pt-4">
                {editingInvoice && (
                  <button
                    type="button"
                    onClick={() => printInvoice(editingInvoice)}
                    className="flex-1 bg-gray-600 hover:bg-gray-700 text-white py-2 rounded-lg font-bold shadow-sm flex items-center justify-center gap-1.5"
                  >
                    <Printer className="w-4 h-4" />
                    {t('print', 'Print')}
                  </button>
                )}
                <button type="submit" className="flex-grow bg-navy text-white py-2 rounded-lg hover:bg-opacity-95 font-bold shadow-sm">
                  {editingInvoice ? t('update') : t('create')}
                </button>
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 bg-gray-100 text-gray-700 py-2 rounded-lg hover:bg-gray-200 font-bold border">
                  {t('cancel')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Invoices;
