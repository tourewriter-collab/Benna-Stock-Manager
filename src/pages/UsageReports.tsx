import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { TrendingDown, Calendar, ListFilter as Filter, Download, FileText, Info } from 'lucide-react';
import { fetchApi } from '../lib/api';
import { exportToExcel, exportToPdf, ExportColumn } from '../utils/export';

interface UsageEvent {
  id: number;
  item_name: string;
  quantity_changed: number;
  previous_quantity: number;
  new_quantity: number;
  user_name: string;
  user_email: string;
  transaction_type: 'IN' | 'OUT';
  authorized_by_name?: string;
  authorized_by_title?: string;
  truck_id?: string;
  timestamp: string;
}

export default function UsageReports() {
  const { t, i18n } = useTranslation();
  const [usageEvents, setUsageEvents] = useState<UsageEvent[]>([]);
  const [usageSummary, setUsageSummary] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [logo, setLogo] = useState<string>('');
  const [preset, setPreset] = useState<'30' | '90' | '365' | 'custom'>('30');
  
  const [filters, setFilters] = useState({
    start_date: new Date(new Date().setDate(new Date().getDate() - 30)).toISOString().split('T')[0],
    end_date: new Date().toISOString().split('T')[0],
    category_id: ''
  });

  useEffect(() => {
    fetchCategories();
    fetchUsageEvents();
    fetchApi('/api/settings').then(s => setLogo(s?.company_logo || '')).catch(() => {});
  }, []);

  useEffect(() => {
    fetchUsageEvents();
    fetchUsageSummary();
  }, [filters]);

  const fetchCategories = async () => {
    try {
      const data = await fetchApi('/api/categories');
      setCategories(data || []);
    } catch (error) {
      console.error('Error fetching categories:', error);
    }
  };

  const fetchUsageSummary = async () => {
    setSummaryLoading(true);
    try {
      const queryParams = new URLSearchParams();
      if (filters.start_date) queryParams.append('start_date', filters.start_date);
      if (filters.end_date) queryParams.append('end_date', filters.end_date);
      if (filters.category_id) queryParams.append('category_id', filters.category_id);
      
      const data = await fetchApi(`/api/reports/usage?${queryParams.toString()}`);
      setUsageSummary(data || []);
    } catch (error) {
      console.error('Error fetching usage summary:', error);
    } finally {
      setSummaryLoading(false);
    }
  };

  const fetchUsageEvents = async () => {
    setLoading(true);
    try {
      const queryParams = new URLSearchParams();
      if (filters.start_date) queryParams.append('start_date', filters.start_date);
      if (filters.end_date) queryParams.append('end_date', filters.end_date);
      if (filters.category_id) queryParams.append('category_id', filters.category_id);
      
      const data = await fetchApi(`/api/reports/usage-events?${queryParams.toString()}`);
      setUsageEvents(data || []);
    } catch (error) {
      console.error('Error fetching usage events:', error);
    } finally {
      setLoading(false);
    }
  };

  const handlePresetSelect = (days: '30' | '90' | '365') => {
    setPreset(days);
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - parseInt(days));
    setFilters(prev => ({ 
      ...prev, 
      start_date: start.toISOString().split('T')[0], 
      end_date: end.toISOString().split('T')[0] 
    }));
  };

  const handleExportExcel = () => {
    const columns: ExportColumn[] = [
      { header: t('item_name') || 'Item Name', key: 'item_name', width: 30 },
      { header: t('previous_stock') || 'Initial Stock', key: 'previous_quantity', width: 15 },
      { header: t('quantity_changed') || 'Quantity Used', key: 'quantity_changed', width: 15 },
      { header: t('new_stock') || 'Remaining Stock', key: 'new_quantity', width: 15 },
      { header: t('type') || 'Type', key: 'transaction_type', width: 15 },
      { header: t('authorized_by') || 'Authorized By', key: 'authorized_by', width: 25 },
      { header: 'Truck', key: 'truck_id', width: 15 },
      { header: t('timestamp') || 'Timestamp', key: 'timestamp', width: 25 },
    ];

    const data = usageEvents.map((evt) => ({
      ...evt,
      transaction_type: evt.transaction_type === 'IN' ? (t('inflow') || 'IN') : (t('usage') || 'OUT'),
      authorized_by: evt.authorized_by_name ? `${evt.authorized_by_name} (${evt.authorized_by_title})` : 'N/A',
      truck_id: evt.truck_id || 'None',
      timestamp: new Date(evt.timestamp).toLocaleString(),
    }));

    exportToExcel(columns, data, `usage_reports_${filters.start_date}_to_${filters.end_date}.xlsx`, 'Usage Reports');
  };

  const handleExportPdf = () => {
    const columns: ExportColumn[] = [
      { header: t('item_name') || 'Item Name', key: 'item_name' },
      { header: t('previous_stock') || 'Initial Stock', key: 'previous_quantity' },
      { header: t('quantity_changed') || 'Quantity Used', key: 'quantity_changed' },
      { header: t('new_stock') || 'Remaining Stock', key: 'new_quantity' },
      { header: t('type') || 'Type', key: 'transaction_type' },
      { header: t('authorized_by') || 'Authorized By', key: 'authorized_by' },
      { header: 'Truck', key: 'truck_id' },
      { header: t('timestamp') || 'Timestamp', key: 'timestamp' },
    ];

    const data = usageEvents.map((evt) => ({
      ...evt,
      transaction_type: evt.transaction_type === 'IN' ? (t('inflow') || 'IN') : (t('usage') || 'OUT'),
      authorized_by: evt.authorized_by_name || 'N/A',
      truck_id: evt.truck_id || 'None',
      timestamp: new Date(evt.timestamp).toLocaleString(),
    }));

    const today = new Date().toLocaleDateString(i18n.language === 'fr' ? 'fr-FR' : 'en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    exportToPdf(columns, data, `usage_reports_${filters.start_date}_to_${filters.end_date}.pdf`, `${t('usage_reports')} - ${today}`, logo);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-gray-600">{t('loading')}</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-[#001f3f]">{t('usage_reports')}</h1>
          <p className="text-gray-600 mt-1">{t('track_part_usage_over_time')}</p>
        </div>
        <TrendingDown className="w-12 h-12 text-[#001f3f]" />
      </div>

      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Filter className="w-5 h-5 text-gray-600" />
            <h2 className="text-lg font-semibold text-gray-800">{t('filters')}</h2>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleExportPdf}
              className="px-3 py-1.5 flex items-center gap-1 bg-red-50 text-red-700 hover:bg-red-100 rounded-md text-sm font-medium"
            >
              <FileText className="w-4 h-4" />
              PDF
            </button>
            <button
              onClick={handleExportExcel}
              className="px-3 py-1.5 flex items-center gap-1 bg-green-50 text-green-700 hover:bg-green-100 rounded-md text-sm font-medium"
            >
              <Download className="w-4 h-4" />
              Excel
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mb-6">
          <button 
            onClick={() => handlePresetSelect('30')} 
            className={`px-4 py-2 rounded-md text-sm font-medium transition ${preset === '30' ? 'bg-navy text-white shadow' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
          >
            30 Days
          </button>
          <button 
            onClick={() => handlePresetSelect('90')} 
            className={`px-4 py-2 rounded-md text-sm font-medium transition ${preset === '90' ? 'bg-navy text-white shadow' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
          >
            90 Days
          </button>
          <button 
            onClick={() => handlePresetSelect('365')} 
            className={`px-4 py-2 rounded-md text-sm font-medium transition ${preset === '365' ? 'bg-navy text-white shadow' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
          >
            1 Year
          </button>
          <button 
            onClick={() => setPreset('custom')} 
            className={`px-4 py-2 rounded-md text-sm font-medium transition ${preset === 'custom' ? 'bg-navy text-white shadow' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
          >
            Custom Range
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              <Calendar className="w-4 h-4 inline mr-1" />
              {t('start_date')}
            </label>
            <input
              type="date"
              value={filters.start_date}
              onChange={(e) => { 
                setPreset('custom'); 
                setFilters({ ...filters, start_date: e.target.value }); 
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#001f3f] focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              <Calendar className="w-4 h-4 inline mr-1" />
              {t('end_date')}
            </label>
            <input
              type="date"
              value={filters.end_date}
              onChange={(e) => { 
                setPreset('custom'); 
                setFilters({ ...filters, end_date: e.target.value }); 
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#001f3f] focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('category')}
            </label>
            <select
              value={filters.category_id}
              onChange={(e) => setFilters({ ...filters, category_id: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#001f3f] focus:border-transparent"
            >
              <option value="">{t('all_categories')}</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {i18n.language === 'fr' ? category.name_fr : category.name_en}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>



      {/* Recent Usage History Section */}
      {/* Usage Summary Section */}
      <div className="bg-white rounded-lg shadow-md overflow-hidden">
        <div className="px-6 py-4 border-b bg-gray-50 flex items-center justify-between">
          <h2 className="text-xl font-bold text-[#001f3f]">{t('usage_summary')}</h2>
          <span className="text-xs text-gray-500">{filters.start_date} {t('to')} {filters.end_date}</span>
        </div>
        
        {summaryLoading ? (
          <div className="text-center py-8 text-gray-500">{t('loading')}</div>
        ) : usageSummary.length === 0 ? (
          <div className="text-center py-8 text-gray-500">{t('no_usage_data_found')}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-white">
                <tr className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  <th className="px-6 py-4">{t('item_name')}</th>
                  <th className="px-6 py-4 flex items-center gap-1">
                    {t('previous_stock')}
                    <div className="group relative">
                      <Info className="w-3.5 h-3.5 text-gray-400 cursor-help" />
                      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block w-48 p-2 bg-gray-900 text-white text-[10px] rounded shadow-xl z-50 normal-case font-normal">
                        {t('initial_stock_tooltip')}
                      </div>
                    </div>
                  </th>
                  <th className="px-6 py-4 text-green-600">{t('stock_received') || 'Received (+)'}</th>
                  <th className="px-6 py-4 text-red-600">{t('quantity_changed') || 'Used (-)'}</th>
                  <th className="px-6 py-4 font-bold text-blue-900">{t('current_stock') || 'Current Live Stock'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {usageSummary.map((item) => {
                  // Calculate what the stock was before this period started
                  // If end_date is today, initial = current + used - received
                  const initialStock = item.current_stock + item.usage - item.received;
                  
                  return (
                    <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="font-semibold text-gray-900">{item.name}</div>
                        <div className="text-xs text-gray-500">{i18n.language === 'fr' ? item.category?.name_fr : item.category?.name_en}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-600 text-center bg-gray-50/50">
                        {initialStock}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-green-600 text-center bg-green-50/20">+{item.received}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-red-600 text-center bg-red-50/20">-{item.usage}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        <span className={`px-3 py-1 rounded-full text-sm font-bold shadow-sm ${item.current_stock > 0 ? 'bg-blue-100 text-blue-800' : 'bg-red-100 text-red-800'}`}>
                          {item.current_stock}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="mt-8">
        <h2 className="text-2xl font-bold text-gray-800 mb-4">
          {preset === '30' ? t('period_30') : 
           preset === '90' ? t('period_90') : 
           preset === '365' ? t('period_365') : 
           t('period_custom')} {t('usage_history_label') || 'Usage History'}
        </h2>
        <div className="bg-white rounded-lg shadow-md overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('item_name')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('previous_stock') || 'Opening Balance'}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-green-600 uppercase tracking-wider">
                  {t('stock_received') || 'Received (+)'}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-red-600 uppercase tracking-wider">
                  {t('quantity_changed') || 'Used (-)'}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-900 uppercase tracking-wider font-bold">
                  {t('new_stock') || 'New Balance'}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('authorized_by') || 'Authorized By'}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Truck
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('timestamp')}
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {usageEvents.map((event) => (
                <tr key={event.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {event.item_name}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                    {event.previous_quantity}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-green-600 bg-green-50/20">
                    {event.transaction_type === 'IN' ? `+${event.quantity_changed}` : '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-red-600 bg-red-50/20">
                    {event.transaction_type === 'OUT' ? `-${event.quantity_changed}` : '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900">
                    {event.new_quantity}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                    {event.authorized_by_name ? (
                      <div>
                        <div className="font-medium text-gray-900">{event.authorized_by_name}</div>
                        <div className="text-xs text-gray-500">{event.authorized_by_title}</div>
                      </div>
                    ) : (
                      <span className="text-gray-400 italic">N/A</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-navy font-medium">
                    {event.truck_id || <span className="text-gray-400 italic">None</span>}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(event.timestamp).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {usageEvents.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              {t('no_usage_events_found') || 'No recent usage events found.'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
