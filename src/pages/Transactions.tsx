import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Activity, Plus, ArrowUpRight, ArrowDownRight, Printer } from 'lucide-react';
import { fetchApi } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { formatPrice } from '../utils/currency';

interface Transaction {
  id: string;
  account_id: string;
  account_name: string;
  invoice_id: string | null;
  amount: number;
  type: 'credit' | 'debit';
  transaction_date: string;
  description: string;
  reference: string;
}

interface Account {
  id: string;
  name: string;
  type: string;
}

const Transactions: React.FC = () => {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const isFr = i18n.language.startsWith('fr');
  
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({
    account_id: '',
    amount: '0',
    type: 'debit' as Transaction['type'],
    transaction_date: new Date().toISOString().split('T')[0],
    description: '',
    reference: ''
  });

  const canEdit = user?.role === 'admin' || user?.role === 'audit_manager';

  const loadData = async (showLoad = true) => {
    if (showLoad) setLoading(true);
    try {
      const [txData, accData] = await Promise.all([
        fetchApi('/transactions'),
        fetchApi('/accounts')
      ]);
      setTransactions(txData || []);
      setAccounts(accData || []);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      if (showLoad) setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleOpenModal = () => {
    setFormData({
      account_id: accounts.length > 0 ? accounts[0].id : '',
      amount: '0',
      type: 'debit',
      transaction_date: new Date().toISOString().split('T')[0],
      description: '',
      reference: ''
    });
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.account_id) return;

    try {
      await fetchApi('/transactions', {
        method: 'POST',
        body: JSON.stringify({
          ...formData,
          amount: parseFloat(formData.amount) || 0
        })
      });

      setShowModal(false);
      await loadData(false);
    } catch (error) {
      console.error('Error recording transaction:', error);
      alert(t('error'));
    }
  };

  return (
    <div className="space-y-6">
      <style>{`
        @media print {
          aside, nav, header, button, .no-print {
            display: none !important;
          }
          body {
            background: white !important;
            color: black !important;
          }
          main {
            padding: 0 !important;
            margin: 0 !important;
            box-shadow: none !important;
            border: none !important;
            width: 100% !important;
          }
        }
      `}</style>
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="bg-navy bg-opacity-10 p-2.5 rounded-lg text-navy">
            <Activity className="w-8 h-8" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-navy">{t('general_ledger', 'General Ledger')}</h1>
            <p className="text-sm text-gray-500">{t('manage_transactions', 'Record and view all financial transactions')}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 bg-gray-100 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-200 transition-colors shadow-sm no-print"
          >
            <Printer className="w-5 h-5" />
            {t('print', 'Print')}
          </button>
          {canEdit && (
            <button
              onClick={handleOpenModal}
              className="flex items-center gap-2 bg-[#0a0c10] text-white px-4 py-2 rounded-lg hover:bg-[#1a1a1a] transition-colors shadow-sm no-print"
            >
              <Plus className="w-5 h-5" />
              {t('record_transaction', 'Record Transaction')}
            </button>
          )}
        </div>
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
                  <th className="py-3.5 px-4 text-xs font-bold uppercase text-gray-500">{t('account')}</th>
                  <th className="py-3.5 px-4 text-xs font-bold uppercase text-gray-500">{t('description')}</th>
                  <th className="py-3.5 px-4 text-xs font-bold uppercase text-gray-500">{t('reference')}</th>
                  <th className="py-3.5 px-4 text-xs font-bold uppercase text-gray-500 text-right">{t('amount')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {transactions.map((tx) => (
                  <tr key={tx.id} className="hover:bg-gray-50/50">
                    <td className="py-3 px-4 text-sm font-medium text-gray-800">
                      {new Date(tx.transaction_date).toLocaleDateString(isFr ? 'fr-FR' : 'en-US')}
                    </td>
                    <td className="py-3 px-4 text-sm font-semibold text-navy">{tx.account_name}</td>
                    <td className="py-3 px-4 text-sm text-gray-700">{tx.description}</td>
                    <td className="py-3 px-4 text-sm text-gray-500">{tx.reference}</td>
                    <td className="py-3 px-4 text-sm text-right">
                      <div className="flex items-center justify-end space-x-2">
                        {tx.type === 'credit' ? (
                          <ArrowUpRight size={16} className="text-emerald-500" />
                        ) : (
                          <ArrowDownRight size={16} className="text-red-500" />
                        )}
                        <span className={`font-bold ${tx.type === 'credit' ? 'text-emerald-600' : 'text-red-600'}`}>
                          {formatPrice(tx.amount)}
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
                {transactions.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-gray-500 font-semibold">
                      {t('no_transactions_found', 'No transactions found.')}
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
              {t('record_transaction', 'Record Transaction')}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('account')} *</label>
                <select
                  required
                  value={formData.account_id}
                  onChange={(e) => setFormData({ ...formData, account_id: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-navy focus:border-transparent outline-none"
                >
                  <option value="">{t('select_account', 'Select an account')}</option>
                  {accounts.map(acc => (
                    <option key={acc.id} value={acc.id}>{acc.name}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('amount')} *</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={formData.amount}
                    onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-navy focus:border-transparent outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('type')}</label>
                  <select
                    value={formData.type}
                    onChange={(e) => setFormData({ ...formData, type: e.target.value as Transaction['type'] })}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-navy focus:border-transparent outline-none"
                  >
                    <option value="debit">{t('debit', 'Debit')}</option>
                    <option value="credit">{t('credit', 'Credit')}</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('date')} *</label>
                <input
                  type="date"
                  required
                  value={formData.transaction_date}
                  onChange={(e) => setFormData({ ...formData, transaction_date: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-navy focus:border-transparent outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('description')}</label>
                <input
                  type="text"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-navy focus:border-transparent outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('reference')}</label>
                <input
                  type="text"
                  value={formData.reference}
                  onChange={(e) => setFormData({ ...formData, reference: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-navy focus:border-transparent outline-none"
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button type="submit" className="flex-1 bg-navy text-white py-2 rounded-lg hover:bg-opacity-95 font-bold shadow-sm">
                  {t('create')}
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

export default Transactions;
