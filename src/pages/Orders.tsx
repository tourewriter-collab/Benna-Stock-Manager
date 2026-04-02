import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, Eye, ListFilter as Filter, AlertTriangle } from 'lucide-react';
import { fetchApi } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { formatCurrency } from '../utils/currency';

interface Order {
  id: string;
  supplier: {
    id: string;
    name: string;
  };
  order_date: string;
  expected_date: string | null;
  total_amount: number;
  paid_amount: number;
  balance: number;
  status: 'pending' | 'partial' | 'paid' | 'cancelled';
  notes: string | null;
}

export default function Orders() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [orders, setOrders] = useState<Order[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    supplier_id: searchParams.get('supplier_id') || '',
    status: searchParams.get('status') || '',
    start_date: '',
    end_date: '',
    unpaid: searchParams.get('unpaid') === 'true'
  });
  const [threshold, setThreshold] = useState(100000);

  const canEdit = user?.role === 'admin' || user?.role === 'audit_manager';

  useEffect(() => {
    fetchSuppliers();
    fetchOrders();
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const data = await fetchApi('/settings');
      if (data && data.high_balance_threshold) {
        setThreshold(parseFloat(data.high_balance_threshold));
      }
    } catch (error) {
      console.error('Error fetching settings:', error);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, [filters]);

  const fetchSuppliers = async () => {
    try {
      const data = await fetchApi('/api/suppliers');
      setSuppliers(data || []);
    } catch (error) {
      console.error('Error fetching suppliers:', error);
    }
  };

  const fetchOrders = async () => {
    try {
      const queryParams = new URLSearchParams();
      if (filters.supplier_id) queryParams.append('supplier_id', filters.supplier_id);
      if (filters.status) queryParams.append('status', filters.status);
      if (filters.start_date) queryParams.append('start_date', filters.start_date);
      if (filters.end_date) queryParams.append('end_date', filters.end_date);
      if (filters.unpaid) queryParams.append('unpaid', 'true');

      const data = await fetchApi(`/api/orders?${queryParams.toString()}`);
      setOrders(data || []);
    } catch (error) {
      console.error('Error fetching orders:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'paid':
        return 'bg-green-100 text-green-800';
      case 'partial':
        return 'bg-yellow-100 text-yellow-800';
      case 'pending':
        return 'bg-blue-100 text-blue-800';
      case 'cancelled':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const handleCreateOrder = () => {
    navigate('/orders/new');
  };

  const handleViewOrder = (id: string) => {
    navigate(`/orders/${id}`);
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
        <h1 className="text-3xl font-bold text-[#001f3f]">{t('orders')}</h1>
        {canEdit && (
          <button
            onClick={handleCreateOrder}
            className="flex items-center gap-2 bg-[#001f3f] text-white px-4 py-2 rounded-lg hover:bg-[#003366] transition-colors"
          >
            <Plus className="w-5 h-5" />
            {t('create_order')}
          </button>
        )}
      </div>

      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="flex items-center gap-2 mb-4">
          <Filter className="w-5 h-5 text-gray-600" />
          <h2 className="text-lg font-semibold text-gray-800">{t('filters')}</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('supplier')}
            </label>
            <select
              value={filters.supplier_id}
              onChange={(e) => setFilters({ ...filters, supplier_id: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#001f3f] focus:border-transparent"
            >
              <option value="">{t('all_suppliers')}</option>
              {suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('status')}
            </label>
            <select
              value={filters.status}
              onChange={(e) => setFilters({ ...filters, status: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#001f3f] focus:border-transparent"
            >
              <option value="">{t('all_statuses')}</option>
              <option value="pending">{t('pending')}</option>
              <option value="partial">{t('partial')}</option>
              <option value="paid">{t('paid')}</option>
              <option value="cancelled">{t('cancelled')}</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('start_date')}
            </label>
            <input
              type="date"
              value={filters.start_date}
              onChange={(e) => setFilters({ ...filters, start_date: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#001f3f] focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('end_date')}
            </label>
            <input
              type="date"
              value={filters.end_date}
              onChange={(e) => setFilters({ ...filters, end_date: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#001f3f] focus:border-transparent"
            />
          </div>

          <div className="flex items-end">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={filters.unpaid}
                onChange={(e) => setFilters({ ...filters, unpaid: e.target.checked })}
                className="w-4 h-4 text-[#001f3f] rounded focus:ring-[#001f3f]"
              />
              <span className="text-sm font-medium text-gray-700">{t('unpaid_only')}</span>
            </label>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-md overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                {t('order_date')}
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                {t('supplier')}
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                {t('total_amount')}
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                {t('paid_amount')}
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                {t('balance')}
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                {t('status')}
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                {t('actions')}
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {orders.map((order) => (
              <tr 
                key={order.id} 
                className={`hover:bg-gray-50 transition-colors ${order.balance > threshold ? 'bg-red-50' : ''}`}
              >
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {new Date(order.order_date).toLocaleDateString()}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {order.supplier.name}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {formatCurrency(order.total_amount)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {formatCurrency(order.paid_amount)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">
                  <div className="flex items-center gap-2">
                    {formatCurrency(order.balance)}
                    {order.balance > threshold && (
                      <AlertTriangle className="w-4 h-4 text-red-500" />
                    )}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(order.status)}`}>
                    {t(order.status)}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm">
                  <button
                    onClick={() => handleViewOrder(order.id)}
                    className="text-[#001f3f] hover:text-[#003366] flex items-center gap-1"
                  >
                    <Eye className="w-4 h-4" />
                    {t('view')}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {orders.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            {t('no_orders_found')}
          </div>
        )}
      </div>
    </div>
  );
}
