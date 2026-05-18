import React from 'react';
import { useTranslation } from 'react-i18next';
import { Calculator } from 'lucide-react';

const AccountingDashboard: React.FC = () => {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col h-full space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center">
          <Calculator className="mr-2 text-blue-500" />
          {t('accounting_dashboard', 'Accounting Dashboard')}
        </h1>
      </div>
      
      <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-100 flex flex-col items-center justify-center min-h-[400px]">
        <div className="w-16 h-16 bg-blue-50 text-blue-500 rounded-full flex items-center justify-center mb-4">
          <Calculator size={32} />
        </div>
        <h2 className="text-xl font-bold text-gray-800 mb-2">{t('accounting_module_coming_soon', 'Accounting Module Coming Soon')}</h2>
        <p className="text-gray-500 text-center max-w-md">
          {t('accounting_module_desc', 'This section will contain your financial KPIs, revenue tracking, and cash flow analysis connected to your stock operations.')}
        </p>
      </div>
    </div>
  );
};

export default AccountingDashboard;
