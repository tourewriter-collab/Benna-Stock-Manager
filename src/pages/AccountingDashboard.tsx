import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { 
  Calculator, 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  CreditCard,
  Activity,
  ArrowUpRight,
  ArrowDownRight,
  FileText
} from 'lucide-react';
import { fetchApi } from '../lib/api';
import { formatPrice } from '../utils/currency';

interface AccountingStats {
  totalRevenue: number;
  totalExpenses: number;
  netProfit: number;
  totalAssets: number;
  pendingInvoicesAmount: number;
  recentTransactions: Array<{
    id: string;
    account_name: string;
    amount: number;
    type: 'credit' | 'debit';
    transaction_date: string;
    description: string;
  }>;
}

const AccountingDashboard: React.FC = () => {
  const { t, i18n } = useTranslation();
  const [stats, setStats] = useState<AccountingStats | null>(null);
  const [loading, setLoading] = useState(true);
  const isFr = i18n.language.startsWith('fr');

  useEffect(() => {
    const loadStats = async () => {
      try {
        const data = await fetchApi('/accounting/dashboard');
        setStats(data);
      } catch (error) {
        console.error('Error fetching accounting stats:', error);
      } finally {
        setLoading(false);
      }
    };
    loadStats();
  }, []);

  if (loading) {
    return <div className="text-center py-12 text-gray-500 font-semibold">{t('loading')}</div>;
  }

  const profitMargin = stats?.totalRevenue ? ((stats.netProfit / stats.totalRevenue) * 100).toFixed(1) : 0;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-navy flex items-center">
          <Calculator className="mr-3 text-gold-500 w-8 h-8" />
          {t('financial_overview', 'Financial Overview')}
        </h1>
      </div>
      
      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 hover:shadow-md transition-shadow relative overflow-hidden group">
          <div className="absolute top-0 right-0 -mr-4 -mt-4 w-24 h-24 bg-emerald-50 rounded-full group-hover:scale-110 transition-transform duration-500 ease-in-out"></div>
          <div className="relative">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">{t('total_revenue', 'Total Revenue')}</p>
                <h3 className="text-2xl font-black text-emerald-600 mt-1">{formatPrice(stats?.totalRevenue || 0)}</h3>
              </div>
              <div className="p-3 bg-emerald-100 rounded-xl text-emerald-600">
                <TrendingUp size={20} />
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 hover:shadow-md transition-shadow relative overflow-hidden group">
          <div className="absolute top-0 right-0 -mr-4 -mt-4 w-24 h-24 bg-red-50 rounded-full group-hover:scale-110 transition-transform duration-500 ease-in-out"></div>
          <div className="relative">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">{t('total_expenses', 'Total Expenses')}</p>
                <h3 className="text-2xl font-black text-red-600 mt-1">{formatPrice(stats?.totalExpenses || 0)}</h3>
              </div>
              <div className="p-3 bg-red-100 rounded-xl text-red-600">
                <TrendingDown size={20} />
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 hover:shadow-md transition-shadow relative overflow-hidden group">
          <div className="absolute top-0 right-0 -mr-4 -mt-4 w-24 h-24 bg-gold-50 rounded-full group-hover:scale-110 transition-transform duration-500 ease-in-out"></div>
          <div className="relative">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">{t('net_profit', 'Net Profit')}</p>
                <h3 className="text-2xl font-black text-gold-600 mt-1">{formatPrice(stats?.netProfit || 0)}</h3>
                <p className="text-xs font-medium text-gold-500 mt-1">{profitMargin}% margin</p>
              </div>
              <div className="p-3 bg-gold-100 rounded-xl text-gold-600">
                <DollarSign size={20} />
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 hover:shadow-md transition-shadow relative overflow-hidden group">
          <div className="absolute top-0 right-0 -mr-4 -mt-4 w-24 h-24 bg-neutral-50 rounded-full group-hover:scale-110 transition-transform duration-500 ease-in-out"></div>
          <div className="relative">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">{t('pending_receivables', 'Pending Receivables')}</p>
                <h3 className="text-2xl font-black text-neutral-600 mt-1">{formatPrice(stats?.pendingInvoicesAmount || 0)}</h3>
              </div>
              <div className="p-3 bg-neutral-100 rounded-xl text-neutral-600">
                <FileText size={20} />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Transactions */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 lg:col-span-2 overflow-hidden">
          <div className="px-6 py-5 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
            <h2 className="text-lg font-bold text-navy flex items-center">
              <Activity className="mr-2 text-gray-400 w-5 h-5" />
              {t('recent_transactions', 'Recent Transactions')}
            </h2>
          </div>
          <div className="divide-y divide-gray-100">
            {stats?.recentTransactions && stats.recentTransactions.length > 0 ? (
              stats.recentTransactions.map((tx) => (
                <div key={tx.id} className="p-6 flex items-center justify-between hover:bg-gray-50 transition-colors">
                  <div className="flex items-center space-x-4">
                    <div className={`p-3 rounded-full ${tx.type === 'credit' ? 'bg-emerald-100 text-emerald-600' : 'bg-red-100 text-red-600'}`}>
                      {tx.type === 'credit' ? <ArrowUpRight size={20} /> : <ArrowDownRight size={20} />}
                    </div>
                    <div>
                      <p className="text-sm font-bold text-gray-900">{tx.account_name}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{tx.description || t('no_description', 'No description')}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`text-base font-black ${tx.type === 'credit' ? 'text-emerald-600' : 'text-red-600'}`}>
                      {tx.type === 'credit' ? '+' : '-'}{formatPrice(tx.amount)}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {new Date(tx.transaction_date).toLocaleDateString(isFr ? 'fr-FR' : 'en-US')}
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <div className="p-8 text-center text-gray-500 font-medium">
                {t('no_recent_transactions', 'No recent transactions found.')}
              </div>
            )}
          </div>
        </div>

        {/* Assets Summary */}
        <div className="bg-gradient-to-br from-navy to-[#1a1a1a] rounded-2xl shadow-lg p-6 text-white relative overflow-hidden flex flex-col justify-between">
          <div className="absolute -right-10 -top-10 w-48 h-48 bg-white opacity-5 rounded-full blur-2xl"></div>
          <div className="absolute -left-10 -bottom-10 w-48 h-48 bg-gold-400 opacity-10 rounded-full blur-2xl"></div>
          
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-lg font-bold text-gold-100">{t('total_assets', 'Total Assets')}</h2>
              <CreditCard className="text-gold-300 w-6 h-6" />
            </div>
            
            <div>
              <p className="text-4xl font-black tracking-tight">{formatPrice(stats?.totalAssets || 0)}</p>
              <p className="text-sm text-gold-200 mt-2">{t('total_assets_desc', 'Combined value of all asset accounts')}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AccountingDashboard;
