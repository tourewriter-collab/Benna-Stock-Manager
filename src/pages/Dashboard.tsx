import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Package, TriangleAlert as AlertTriangle, DollarSign, Circle as XCircle, CreditCard } from 'lucide-react';
import { fetchApi } from '../lib/api';
import { formatPrice, formatCurrency } from '../utils/currency';
import { useSync } from '../contexts/SyncContext';

interface InventoryItem {
  id: string;
  name: string;
  category?: {
    id: string;
    name_en: string;
    name_fr: string;
  };
  quantity: number;
  price: number;
  min_stock: number;
}

interface OutstandingOrder {
  id: string;
  supplier: any;
  total_amount: number;
  paid_amount: number;
  balance: number;
  order_date: string;
}

const Dashboard: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { lastSyncedAt } = useSync();
  const [outstandingPayments, setOutstandingPayments] = useState<{
    total: number;
    count: number;
    recentOrders: OutstandingOrder[];
  }>({ total: 0, count: 0, recentOrders: [] });
  const [stats, setStats] = useState({
    totalItems: 0,
    lowStockCount: 0,
    outOfStockCount: 0,
    totalValue: 0
  });
  const [recentItems, setRecentItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    refreshData();
  }, [lastSyncedAt]);

  const refreshData = () => {
    setLoading(true);
    Promise.all([fetchStats(), fetchRecentItems(), fetchOutstandingPayments()]).finally(() => {
      setLoading(false);
    });
  };

  const fetchStats = async () => {
    try {
      const data = await fetchApi('/inventory/stats/summary');
      if (data) {
        setStats({
          totalItems: data.totalItems || 0,
          lowStockCount: data.lowStockItems || 0,
          outOfStockCount: data.outOfStockItems || 0,
          totalValue: data.totalValue || 0
        });
      }
    } catch (error) {
      console.error('Error fetching dashboard stats:', error);
    }
  };

  const fetchRecentItems = async () => {
    try {
      const data = await fetchApi('/inventory?limit=5');
      setRecentItems(data.items || []);
    } catch (error) {
      console.error('Error fetching recent inventory:', error);
    }
  };

  const fetchOutstandingPayments = async () => {
    try {
      const data = await fetchApi('/orders/summary/outstanding');
      if (data) {
        setOutstandingPayments({
          total: data.totalOutstanding || 0,
          count: data.count || 0,
          recentOrders: data.recentHighBalance || []
        });
      }
    } catch (error) {
      console.error('Error fetching outstanding payments:', error);
    }
  };

  const statCards = [
    { title: t('total_items'), value: stats.totalItems, icon: Package, color: 'bg-blue-500' },
    { title: t('low_stock'), value: stats.lowStockCount, icon: AlertTriangle, color: 'bg-yellow-500' },
    { title: t('out_of_stock'), value: stats.outOfStockCount, icon: XCircle, color: 'bg-red-500' },
    {
      title: t('total_value'),
      value: formatPrice(stats.totalValue),
      icon: DollarSign,
      color: 'bg-green-500',
    },
    {
      title: t('outstanding_payments'),
      value: formatCurrency(outstandingPayments.total),
      icon: CreditCard,
      color: 'bg-orange-500',
      clickable: true,
      onClick: () => navigate('/orders?unpaid=true')
    },
  ];

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-900 mb-8">{t('dashboard')}</h1>

      {loading ? (
        <div className="text-center py-12">{t('loading')}</div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6 mb-8">
            {statCards.map((stat) => (
              <div
                key={stat.title}
                className={`bg-white rounded-lg shadow-md p-6 border border-gray-200 ${stat.clickable ? 'cursor-pointer hover:shadow-lg transition-shadow' : ''
                  }`}
                onClick={stat.onClick}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600 mb-1">{stat.title}</p>
                    <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
                  </div>
                  <div className={`${stat.color} p-3 rounded-full`}>
                    <stat.icon className="w-6 h-6 text-white" />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">{t('recent_inventory')}</h2>
              {recentItems.length === 0 ? (
                <p className="text-gray-500 text-center py-8">{t('no_data')}</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-3 px-4 font-semibold text-gray-700">{t('name')}</th>
                        <th className="text-left py-3 px-4 font-semibold text-gray-700">{t('category')}</th>
                        <th className="text-left py-3 px-4 font-semibold text-gray-700">{t('quantity')}</th>
                        <th className="text-left py-3 px-4 font-semibold text-gray-700">{t('status')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentItems.map((item) => {
                        const status =
                          item.quantity === 0
                            ? 'outOfStock'
                            : item.quantity <= item.min_stock
                            ? 'lowStock'
                            : 'inStock';
                        return (
                          <tr key={item.id} className="border-b hover:bg-gray-50">
                            <td className="py-3 px-4">{item.name}</td>
                            <td className="py-3 px-4">{item.category?.name_en || t('uncategorized')}</td>
                            <td className="py-3 px-4">{item.quantity}</td>
                            <td className="py-3 px-4">
                              <span
                                className={`px-2 py-1 rounded-full text-xs font-medium ${
                                  status === 'inStock'
                                    ? 'bg-green-100 text-green-800'
                                    : status === 'lowStock'
                                    ? 'bg-yellow-100 text-yellow-800'
                                    : 'bg-red-100 text-red-800'
                                }`}
                              >
                                {t(status)}
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

            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">{t('orders_with_high_balance')}</h2>
              {outstandingPayments.recentOrders.length === 0 ? (
                <p className="text-gray-500 text-center py-8">{t('no_outstanding_orders')}</p>
              ) : (
                <div className="space-y-3">
                  {outstandingPayments.recentOrders.map((order) => (
                    <div
                      key={order.id}
                      className="border-l-4 border-orange-500 bg-orange-50 p-4 rounded cursor-pointer hover:bg-orange-100 transition-colors"
                      onClick={() => navigate(`/orders/${order.id}`)}
                    >
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <h3 className="font-semibold text-gray-900">{order.supplier?.name}</h3>
                          <p className="text-xs text-gray-600">
                            {new Date(order.order_date).toLocaleDateString()}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-orange-600">{formatCurrency(order.balance)}</p>
                          <p className="text-xs text-gray-600">{t('balance')}</p>
                        </div>
                      </div>
                      <div className="flex justify-between text-xs text-gray-600">
                        <span>{t('total')}: {formatCurrency(order.total_amount)}</span>
                        <span>{t('paid')}: {formatCurrency(order.paid_amount)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default Dashboard;
