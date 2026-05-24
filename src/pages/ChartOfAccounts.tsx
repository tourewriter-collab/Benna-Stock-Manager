import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Layers, Plus, Edit, Trash2 } from 'lucide-react';
import { fetchApi } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { formatPrice } from '../utils/currency';

interface Account {
  id: string;
  name: string;
  type: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';
  balance: number;
  currency: string;
}

const ChartOfAccounts: React.FC = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [showModal, setShowModal] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    type: 'asset' as Account['type'],
    balance: '0'
  });

  const canEdit = user?.role === 'admin' || user?.role === 'audit_manager';

  const loadAccounts = async (showLoad = true) => {
    if (showLoad) setLoading(true);
    try {
      const data = await fetchApi('/accounts');
      setAccounts(data || []);
    } catch (error) {
      console.error('Error fetching accounts:', error);
    } finally {
      if (showLoad) setLoading(false);
    }
  };

  useEffect(() => {
    loadAccounts();
  }, []);

  const handleOpenModal = (account: Account | null = null) => {
    if (account) {
      setEditingAccount(account);
      setFormData({
        name: account.name,
        type: account.type,
        balance: String(account.balance)
      });
    } else {
      setEditingAccount(null);
      setFormData({
        name: '',
        type: 'asset',
        balance: '0'
      });
    }
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) return;

    try {
      const payload = {
        name: formData.name,
        type: formData.type,
        balance: parseFloat(formData.balance) || 0
      };

      if (editingAccount) {
        await fetchApi(`/accounts/${editingAccount.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload)
        });
      } else {
        await fetchApi('/accounts', {
          method: 'POST',
          body: JSON.stringify(payload)
        });
      }

      setShowModal(false);
      await loadAccounts(false);
    } catch (error) {
      console.error('Error saving account:', error);
      alert(t('error'));
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t('confirm_archive_account', 'Are you sure you want to archive this account?'))) return;
    try {
      await fetchApi(`/accounts/${id}`, { method: 'DELETE' });
      await loadAccounts(false);
    } catch (error) {
      console.error('Error archiving account:', error);
    }
  };

  const groupedAccounts = accounts.reduce((acc, account) => {
    if (!acc[account.type]) acc[account.type] = [];
    acc[account.type].push(account);
    return acc;
  }, {} as Record<string, Account[]>);

  const accountTypes = ['asset', 'liability', 'equity', 'revenue', 'expense'];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="bg-navy bg-opacity-10 p-2.5 rounded-lg text-navy">
            <Layers className="w-8 h-8" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-navy">{t('chart_of_accounts', 'Chart of Accounts')}</h1>
            <p className="text-sm text-gray-500">{t('manage_financial_accounts', 'Manage your financial accounts and balances')}</p>
          </div>
        </div>
        {canEdit && (
          <button
            onClick={() => handleOpenModal()}
            className="flex items-center gap-2 bg-[#001f3f] text-white px-4 py-2 rounded-lg hover:bg-[#003366] transition-colors shadow-sm"
          >
            <Plus className="w-5 h-5" />
            {t('add_account', 'Add Account')}
          </button>
        )}
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-500 font-semibold">{t('loading')}</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {accountTypes.map(type => {
            const typeAccounts = groupedAccounts[type] || [];
            if (typeAccounts.length === 0) return null;
            
            const total = typeAccounts.reduce((sum, a) => sum + a.balance, 0);

            return (
              <div key={type} className="bg-white border rounded-xl shadow-sm overflow-hidden">
                <div className="px-6 py-4 bg-gray-50 border-b flex justify-between items-center">
                  <h2 className="text-lg font-bold text-gray-800 capitalize">{t(`account_type_${type}`, type)}</h2>
                  <span className="font-black text-navy">{formatPrice(total)}</span>
                </div>
                <div className="divide-y divide-gray-100">
                  {typeAccounts.map(account => (
                    <div key={account.id} className="p-4 flex items-center justify-between hover:bg-gray-50">
                      <div>
                        <p className="font-semibold text-gray-900">{account.name}</p>
                      </div>
                      <div className="flex items-center space-x-4">
                        <span className="font-bold text-gray-700">{formatPrice(account.balance)}</span>
                        {canEdit && (
                          <div className="flex space-x-2">
                            <button onClick={() => handleOpenModal(account)} className="text-blue-500 hover:text-blue-700 p-1">
                              <Edit size={16} />
                            </button>
                            <button onClick={() => handleDelete(account.id)} className="text-red-500 hover:text-red-700 p-1">
                              <Trash2 size={16} />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
          {accounts.length === 0 && (
             <div className="col-span-full text-center py-12 text-gray-500 bg-white border rounded-xl shadow-sm">
               {t('no_accounts_found', 'No accounts found. Create one to get started.')}
             </div>
          )}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-2xl">
            <h2 className="text-2xl font-bold text-navy mb-4">
              {editingAccount ? t('edit_account', 'Edit Account') : t('add_account', 'Add Account')}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('name')} *</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-navy focus:border-transparent outline-none"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('type')} *</label>
                <select
                  required
                  value={formData.type}
                  onChange={(e) => setFormData({ ...formData, type: e.target.value as Account['type'] })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-navy focus:border-transparent outline-none"
                >
                  <option value="asset">{t('account_type_asset', 'Asset')}</option>
                  <option value="liability">{t('account_type_liability', 'Liability')}</option>
                  <option value="equity">{t('account_type_equity', 'Equity')}</option>
                  <option value="revenue">{t('account_type_revenue', 'Revenue')}</option>
                  <option value="expense">{t('account_type_expense', 'Expense')}</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('opening_balance', 'Opening Balance')}</label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.balance}
                  onChange={(e) => setFormData({ ...formData, balance: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-navy focus:border-transparent outline-none"
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button type="submit" className="flex-1 bg-navy text-white py-2 rounded-lg hover:bg-opacity-95 font-bold shadow-sm">
                  {editingAccount ? t('update') : t('create')}
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

export default ChartOfAccounts;
