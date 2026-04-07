import React, { useEffect, useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import {
  Package,
  TriangleAlert as AlertTriangle,
  DollarSign,
  Circle as XCircle,
  CreditCard,
  ChevronDown,
  ChevronUp,
  Tag,
  Layers,
} from 'lucide-react';
import { fetchApi } from '../lib/api';
import { formatPrice, formatCurrency } from '../utils/currency';
import { useSync } from '../contexts/SyncContext';

// ─── Types ───────────────────────────────────────────────────────────────────

interface InventoryItem {
  id: string;
  name: string;
  category?: { id: string; name_en: string; name_fr: string };
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

interface CategoryStat {
  category_en: string;
  category_fr: string;
  item_count: number;
  total_units: number;
}

interface StockItem {
  id: string;
  name: string;
  category_en: string;
  category_fr: string;
  quantity: number;
  min_stock: number;
}

type ActivePanel = 'articles' | 'lowStock' | 'outOfStock' | null;

// ─── Component ────────────────────────────────────────────────────────────────

const Dashboard: React.FC = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { lastSyncedAt } = useSync();
  const panelRef = useRef<HTMLDivElement>(null);

  const [stats, setStats] = useState({
    totalItems: 0,
    lowStockCount: 0,
    outOfStockCount: 0,
    totalValue: 0,
  });
  const [outstandingPayments, setOutstandingPayments] = useState<{
    total: number;
    count: number;
    recentOrders: OutstandingOrder[];
  }>({ total: 0, count: 0, recentOrders: [] });
  const [recentItems, setRecentItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Drill-down panel state
  const [activePanel, setActivePanel] = useState<ActivePanel>(null);
  const [panelLoading, setPanelLoading] = useState(false);
  const [categoryStats, setCategoryStats] = useState<CategoryStat[]>([]);
  const [lowStockItems, setLowStockItems] = useState<StockItem[]>([]);
  const [outOfStockItems, setOutOfStockItems] = useState<StockItem[]>([]);

  const isFr = i18n.language.startsWith('fr');

  // ── Data fetching ─────────────────────────────────────────────────────────

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
          totalValue: data.totalValue || 0,
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
          recentOrders: data.recentHighBalance || [],
        });
      }
    } catch (error) {
      console.error('Error fetching outstanding payments:', error);
    }
  };

  // ── Panel toggling ────────────────────────────────────────────────────────

  const openPanel = async (panel: ActivePanel) => {
    if (activePanel === panel) {
      setActivePanel(null);
      return;
    }
    setActivePanel(panel);
    setPanelLoading(true);
    try {
      if (panel === 'articles') {
        const data = await fetchApi('/inventory/stats/by-category');
        setCategoryStats(data || []);
      } else if (panel === 'lowStock') {
        const data = await fetchApi('/inventory/stats/low-stock');
        setLowStockItems(data || []);
      } else if (panel === 'outOfStock') {
        const data = await fetchApi('/inventory/stats/out-of-stock');
        setOutOfStockItems(data || []);
      }
    } catch (error) {
      console.error('Panel fetch error:', error);
    } finally {
      setPanelLoading(false);
      setTimeout(() => panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 80);
    }
  };

  // ── Stat cards config ─────────────────────────────────────────────────────

  const statCards = [
    {
      id: 'articles',
      title: t('total_items'),
      value: stats.totalItems,
      icon: Package,
      color: 'bg-blue-500',
      ring: 'ring-blue-400',
      clickable: true,
      onClick: () => openPanel('articles'),
    },
    {
      id: 'lowStock',
      title: t('low_stock'),
      value: stats.lowStockCount,
      icon: AlertTriangle,
      color: 'bg-yellow-500',
      ring: 'ring-yellow-400',
      clickable: true,
      onClick: () => openPanel('lowStock'),
    },
    {
      id: 'outOfStock',
      title: t('out_of_stock'),
      value: stats.outOfStockCount,
      icon: XCircle,
      color: 'bg-red-500',
      ring: 'ring-red-400',
      clickable: true,
      onClick: () => openPanel('outOfStock'),
    },
    {
      id: 'totalValue',
      title: t('total_value'),
      value: formatPrice(stats.totalValue),
      icon: DollarSign,
      color: 'bg-green-500',
      ring: '',
      clickable: true,
      onClick: () => navigate('/inventory'),
    },
    {
      id: 'outstanding',
      title: t('outstanding_payments'),
      value: formatCurrency(outstandingPayments.total),
      icon: CreditCard,
      color: 'bg-orange-500',
      ring: '',
      clickable: true,
      onClick: () => navigate('/orders?unpaid=true'),
    },
  ];

  // ── Panel renderers ───────────────────────────────────────────────────────

  const renderPanelContent = () => {
    if (panelLoading) {
      return (
        <div className="flex items-center justify-center py-10 text-gray-400">
          <svg className="animate-spin w-6 h-6 mr-3" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
          </svg>
          {t('loading')}
        </div>
      );
    }

    if (activePanel === 'articles') {
      return (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <div className="bg-blue-100 p-2 rounded-lg">
              <Layers className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">{t('total_items')} — {t('breakdown_by_category')}</h3>
              <p className="text-xs text-gray-500">{categoryStats.length} {t('categories')}</p>
            </div>
          </div>
          {categoryStats.length === 0 ? (
            <p className="text-center text-gray-400 py-6">{t('no_data')}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 rounded-lg">
                    <th className="text-left py-2 px-4 font-semibold text-gray-600 rounded-l-lg">{t('category')}</th>
                    <th className="text-right py-2 px-4 font-semibold text-gray-600">{t('item_types')}</th>
                    <th className="text-right py-2 px-4 font-semibold text-gray-600 rounded-r-lg">{t('total_units')}</th>
                  </tr>
                </thead>
                <tbody>
                  {categoryStats.map((row, i) => (
                    <tr key={i} className="border-b border-gray-100 hover:bg-blue-50 transition-colors">
                      <td className="py-2.5 px-4 flex items-center gap-2">
                        <Tag className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                        <span className="text-gray-800">{isFr ? row.category_fr : row.category_en}</span>
                      </td>
                      <td className="py-2.5 px-4 text-right font-medium text-gray-900">{row.item_count}</td>
                      <td className="py-2.5 px-4 text-right font-bold text-blue-600">{row.total_units.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-blue-50 font-semibold">
                    <td className="py-2.5 px-4 text-gray-700 rounded-l-lg">{t('total')}</td>
                    <td className="py-2.5 px-4 text-right text-gray-900">{categoryStats.reduce((s, r) => s + r.item_count, 0)}</td>
                    <td className="py-2.5 px-4 text-right text-blue-700 rounded-r-lg">{categoryStats.reduce((s, r) => s + r.total_units, 0).toLocaleString()}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      );
    }

    if (activePanel === 'lowStock') {
      return (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <div className="bg-yellow-100 p-2 rounded-lg">
              <AlertTriangle className="w-5 h-5 text-yellow-600" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">{t('low_stock')} — {t('detail')}</h3>
              <p className="text-xs text-gray-500">{lowStockItems.length} {t('items')}</p>
            </div>
          </div>
          {lowStockItems.length === 0 ? (
            <p className="text-center text-gray-400 py-6">✅ {t('no_low_stock')}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="text-left py-2 px-4 font-semibold text-gray-600 rounded-l-lg">{t('name')}</th>
                    <th className="text-left py-2 px-4 font-semibold text-gray-600">{t('category')}</th>
                    <th className="text-right py-2 px-4 font-semibold text-gray-600">{t('quantity')}</th>
                    <th className="text-right py-2 px-4 font-semibold text-gray-600">{t('min_stock')}</th>
                    <th className="text-left py-2 px-4 font-semibold text-gray-600 rounded-r-lg">{t('level')}</th>
                  </tr>
                </thead>
                <tbody>
                  {lowStockItems.map((item) => {
                    const pct = item.min_stock > 0 ? Math.min((item.quantity / item.min_stock) * 100, 100) : 100;
                    const barColor = pct < 30 ? 'bg-red-500' : pct < 70 ? 'bg-yellow-400' : 'bg-green-400';
                    return (
                      <tr key={item.id} className="border-b border-gray-100 hover:bg-yellow-50 transition-colors">
                        <td className="py-2.5 px-4 font-medium text-gray-900">{item.name}</td>
                        <td className="py-2.5 px-4 text-gray-500">{isFr ? item.category_fr : item.category_en}</td>
                        <td className="py-2.5 px-4 text-right font-bold text-yellow-700">{item.quantity}</td>
                        <td className="py-2.5 px-4 text-right text-gray-500">{item.min_stock}</td>
                        <td className="py-2.5 px-4">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 bg-gray-200 rounded-full h-2">
                              <div className={`${barColor} h-2 rounded-full transition-all`} style={{ width: `${pct}%` }} />
                            </div>
                            <span className="text-xs text-gray-500 w-8 text-right">{Math.round(pct)}%</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      );
    }

    if (activePanel === 'outOfStock') {
      return (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <div className="bg-red-100 p-2 rounded-lg">
              <XCircle className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">{t('out_of_stock')} — {t('detail')}</h3>
              <p className="text-xs text-gray-500">{outOfStockItems.length} {t('items')}</p>
            </div>
          </div>
          {outOfStockItems.length === 0 ? (
            <p className="text-center text-gray-400 py-6">✅ {t('no_out_of_stock')}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="text-left py-2 px-4 font-semibold text-gray-600 rounded-l-lg">{t('name')}</th>
                    <th className="text-left py-2 px-4 font-semibold text-gray-600">{t('category')}</th>
                    <th className="text-right py-2 px-4 font-semibold text-gray-600 rounded-r-lg">{t('min_stock')}</th>
                  </tr>
                </thead>
                <tbody>
                  {outOfStockItems.map((item) => (
                    <tr key={item.id} className="border-b border-gray-100 hover:bg-red-50 transition-colors">
                      <td className="py-2.5 px-4 font-medium text-gray-900">{item.name}</td>
                      <td className="py-2.5 px-4 text-gray-500">{isFr ? item.category_fr : item.category_en}</td>
                      <td className="py-2.5 px-4 text-right">
                        <span className="inline-block bg-red-100 text-red-700 text-xs font-semibold px-2 py-0.5 rounded-full">
                          {t('out_of_stock')}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      );
    }

    return null;
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-900 mb-8">{t('dashboard')}</h1>

      {loading ? (
        <div className="text-center py-12">{t('loading')}</div>
      ) : (
        <>
          {/* ── Stat cards ── */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6 mb-4">
            {statCards.map((stat) => {
              const isActive = activePanel === stat.id;
              const isPanelCard = stat.id === 'articles' || stat.id === 'lowStock' || stat.id === 'outOfStock';
              return (
                <div
                  key={stat.id}
                  id={`dash-card-${stat.id}`}
                  className={[
                    'bg-white rounded-lg shadow-md p-6 border border-gray-200 select-none',
                    'cursor-pointer hover:shadow-lg transition-all duration-200',
                    isActive ? `ring-2 ${stat.ring} shadow-lg` : '',
                  ].join(' ')}
                  onClick={stat.onClick}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-600 mb-1">{stat.title}</p>
                      <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
                    </div>
                    <div className="flex flex-col items-center gap-1">
                      <div className={`${stat.color} p-3 rounded-full`}>
                        <stat.icon className="w-6 h-6 text-white" />
                      </div>
                      {isPanelCard && (
                        isActive
                          ? <ChevronUp className="w-4 h-4 text-gray-400" />
                          : <ChevronDown className="w-4 h-4 text-gray-300" />
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* ── Inline drill-down panel ── */}
          <div
            ref={panelRef}
            className={[
              'overflow-hidden transition-all duration-300 ease-in-out mb-6',
              activePanel ? 'max-h-[600px] opacity-100' : 'max-h-0 opacity-0',
            ].join(' ')}
            aria-live="polite"
          >
            <div className="bg-white rounded-lg shadow-md border border-gray-200 p-6">
              {renderPanelContent()}
            </div>
          </div>

          {/* ── Bottom panels (recent inventory + outstanding orders) ── */}
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
