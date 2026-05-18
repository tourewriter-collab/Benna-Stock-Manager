import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Package, Calculator, ChevronDown, Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const ModuleSwitcher: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const isAccounting = location.pathname.startsWith('/accounting');

  const currentModule = isAccounting ? {
    id: 'accounting',
    name: t('accounting_module', 'Accounting & Finance'),
    icon: <Calculator size={18} className="text-blue-400" />
  } : {
    id: 'stock',
    name: t('stock_module', 'Operations & Stock'),
    icon: <Package size={18} className="text-emerald-400" />
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const switchModule = (moduleId: 'stock' | 'accounting') => {
    setIsOpen(false);
    if (moduleId === 'stock' && isAccounting) {
      navigate('/dashboard');
    } else if (moduleId === 'accounting' && !isAccounting) {
      navigate('/accounting/dashboard');
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center space-x-2 px-3 py-1.5 rounded-md hover:bg-white/10 transition border border-white/20"
      >
        {currentModule.icon}
        <span className="text-sm font-semibold hidden sm:inline-block">{currentModule.name}</span>
        <ChevronDown size={14} className="text-gray-300 ml-1" />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-2 w-56 bg-white rounded-lg shadow-xl border border-gray-100 py-1 z-50">
          <div className="px-3 py-2 text-xs font-bold text-gray-400 uppercase tracking-wider">
            {t('switch_module', 'Switch Module')}
          </div>
          
          <button
            onClick={() => switchModule('stock')}
            className={`w-full text-left px-4 py-2.5 flex items-center space-x-3 hover:bg-gray-50 transition ${!isAccounting ? 'bg-blue-50/50' : ''}`}
          >
            <div className={`p-1.5 rounded-md ${!isAccounting ? 'bg-emerald-100 text-emerald-600' : 'bg-gray-100 text-gray-500'}`}>
              <Package size={16} />
            </div>
            <span className={`text-sm flex-1 ${!isAccounting ? 'font-semibold text-navy' : 'text-gray-700'}`}>
              {t('stock_module', 'Operations & Stock')}
            </span>
            {!isAccounting && <Check size={16} className="text-emerald-500" />}
          </button>
          
          <button
            onClick={() => switchModule('accounting')}
            className={`w-full text-left px-4 py-2.5 flex items-center space-x-3 hover:bg-gray-50 transition ${isAccounting ? 'bg-blue-50/50' : ''}`}
          >
            <div className={`p-1.5 rounded-md ${isAccounting ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-500'}`}>
              <Calculator size={16} />
            </div>
            <span className={`text-sm flex-1 ${isAccounting ? 'font-semibold text-navy' : 'text-gray-700'}`}>
              {t('accounting_module', 'Accounting & Finance')}
            </span>
            {isAccounting && <Check size={16} className="text-blue-500" />}
          </button>
        </div>
      )}
    </div>
  );
};

export default ModuleSwitcher;
