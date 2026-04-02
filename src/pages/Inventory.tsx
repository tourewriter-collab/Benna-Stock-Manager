import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { Plus, CreditCard as Edit, Trash2, History, CircleAlert as AlertCircle, MinusCircle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useSync } from '../contexts/SyncContext';
import { fetchApi } from '../lib/api';
import { formatPrice } from '../utils/currency';

interface Category {
  id: string;
  name_en: string;
  name_fr: string;
}

interface InventoryItem {
  id: string;
  name: string;
  category_id: string | null;
  category?: Category;
  quantity: number;
  price: number;
  supplier: string | null;
  location: string;
  min_stock: number;
  max_stock: number;
  last_updated: string;
  supplier_name?: string | null;
}

const Inventory: React.FC = () => {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const { refreshStatus, triggerSync, isOnline } = useSync();
  const [searchParams, setSearchParams] = useSearchParams();
  const categoryFilter = searchParams.get('category_id') || '';
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [historyItemId, setHistoryItemId] = useState<string | null>(null);
  const [usageItem, setUsageItem] = useState<InventoryItem | null>(null);
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const pageSize = 50;

  const currentDay = new Date().getDate();
  const frozen = user?.role === 'user' && currentDay > 15;

  useEffect(() => {
    fetchCategories();
    fetchSuppliers();
  }, []);

  // Debounce search term
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setCurrentPage(1); // Reset to first page on search
    }, 500);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => {
    fetchItems();
  }, [debouncedSearch, categoryFilter, currentPage]);

  const fetchSuppliers = async () => {
    try {
      const data = await fetchApi('/api/suppliers');
      setSuppliers(data || []);
    } catch (error) {
      console.error('Error fetching suppliers:', error);
    }
  };

  const fetchCategories = async () => {
    try {
      const data = await fetchApi('/categories');
      setCategories(data || []);
    } catch (error) {
      console.error('Error fetching categories:', error);
    }
  };

  const fetchItems = async () => {
    setLoading(true);
    try {
      const offset = (currentPage - 1) * pageSize;
      const params = new URLSearchParams();
      params.append('limit', pageSize.toString());
      params.append('offset', offset.toString());
      if (debouncedSearch) params.append('search', debouncedSearch);
      if (categoryFilter) params.append('category_id', categoryFilter);

      const data = await fetchApi(`/inventory?${params.toString()}`);
      if (data && data.items) {
        setItems(data.items);
        setTotalCount(data.totalCount || 0);
      } else {
        setItems([]);
        setTotalCount(0);
      }
    } catch (error) {
      console.error('Error fetching inventory:', error);
    }
    setLoading(false);
  };

  const getCategoryName = (category: Category | undefined) => {
    if (!category) return t('uncategorized');
    return i18n.language === 'fr' ? category.name_fr : category.name_en;
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t('confirm_delete'))) return;
    try {
      await fetchApi(`/inventory/${id}`, { method: 'DELETE' });
      fetchItems();
      await refreshStatus();
      if (isOnline) triggerSync();
    } catch (error) {
      console.error('Error deleting item:', error);
    }
  };

  const handleSave = async (formData: any) => {
    try {
      // Find the category name to provide as a fallback for the backend's NOT NULL column
      const selectedCategory = categories.find(c => c.id === formData.category_id);
      const payload = {
        ...formData,
        category: selectedCategory ? (i18n.language === 'fr' ? selectedCategory.name_fr : selectedCategory.name_en) : 'Uncategorized'
      };

      if (editingItem) {
        await fetchApi(`/inventory/${editingItem.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload)
        });
      } else {
        await fetchApi('/inventory', {
          method: 'POST',
          body: JSON.stringify(payload)
        });
      }

      setIsModalOpen(false);
      setEditingItem(null);
      fetchItems();
      await refreshStatus();
      if (isOnline) triggerSync();
    } catch (error) {
      console.error('Error saving item:', error);
    }
  };

  const handleRecordUsage = async (item: InventoryItem, usageAmount: number) => {
    try {
      if (usageAmount <= 0) return;
      
      const payload = {
        name: item.name,
        category_id: item.category_id,
        category: getCategoryName(item.category),
        quantity: Math.max(0, item.quantity - usageAmount), // Prevent negative stock
        price: item.price,
        supplier: typeof item.supplier === 'object' && item.supplier !== null ? (item.supplier as any).id : (item.supplier || ''),
        location: item.location,
        min_stock: item.min_stock,
        max_stock: item.max_stock
      };

      await fetchApi(`/inventory/${item.id}`, {
        method: 'PUT',
        body: JSON.stringify(payload)
      });

      setUsageItem(null);
      fetchItems();
      await refreshStatus();
      if (isOnline) triggerSync();
    } catch (error) {
      console.error('Error recording usage:', error);
    }
  };

  const totalPages = Math.ceil(totalCount / pageSize);

  const getStatus = (item: InventoryItem) => {
    if (item.quantity === 0) return 'outOfStock';
    if (item.quantity <= item.min_stock) return 'lowStock';
    return 'inStock';
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold text-gray-900">{t('inventory')}</h1>
        <button
          onClick={() => {
            setEditingItem(null);
            setIsModalOpen(true);
          }}
          className="bg-navy text-white px-4 py-2 rounded-md hover:bg-opacity-90 transition flex items-center"
        >
          <Plus className="w-4 h-4 mr-2" />
          {t('add_item')}
        </button>
      </div>

      {frozen && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6 flex items-center">
          <AlertCircle className="w-5 h-5 text-yellow-600 mr-3" />
          <p className="text-yellow-800">{t('freeze_warning')}</p>
        </div>
      )}

      <div className="bg-white rounded-lg shadow-md mb-6 p-4 flex flex-col md:flex-row space-y-4 md:space-y-0 md:space-x-4">
        <div className="flex-1">
          <input
            type="text"
            placeholder={t('search_inventory')}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-navy"
          />
        </div>
        <div className="w-full md:w-64">
          <select
            value={categoryFilter}
            onChange={(e) => {
              const val = e.target.value;
              if (val) {
                searchParams.set('category_id', val);
              } else {
                searchParams.delete('category_id');
              }
              setSearchParams(searchParams);
              setCurrentPage(1);
            }}
            className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-navy"
          >
            <option value="">{t('all_categories')}</option>
            {categories.map(cat => (
              <option key={cat.id} value={cat.id}>
                {i18n.language === 'fr' ? cat.name_fr : cat.name_en}
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12">{t('loading')}</div>
      ) : (
        <div className="bg-white rounded-lg shadow-md overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700">{t('name')}</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700">{t('category')}</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700">{t('supplier')}</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700">{t('quantity')}</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700">{t('price')}</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700">{t('location')}</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700">{t('status')}</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700">{t('actions')}</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-gray-500">
                      {t('no_data')}
                    </td>
                  </tr>
                ) : (
                  items.map((item: InventoryItem) => {
                    const status = getStatus(item);
                    return (
                      <tr key={item.id} className="border-t hover:bg-gray-50">
                        <td className="py-3 px-4">{item.name}</td>
                        <td className="py-3 px-4">{getCategoryName(item.category)}</td>
                        <td className="py-3 px-4">
                          {typeof item.supplier_name === 'object' && item.supplier_name !== null 
                            ? (item.supplier_name as any).name || 'N/A'
                            : (item.supplier_name || 'N/A')}
                        </td>
                        <td className="py-3 px-4 text-center">{item.quantity}</td>
                        <td className="py-3 px-4">{formatPrice(item.price)}</td>
                        <td className="py-3 px-4">{item.location}</td>
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
                        <td className="py-3 px-4">
                          <div className="flex space-x-2">
                            <button
                              onClick={() => setHistoryItemId(item.id)}
                              className="text-blue-600 hover:text-blue-800"
                              title={t('view_history')}
                            >
                              <History className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => setUsageItem(item)}
                              disabled={frozen || item.quantity <= 0}
                              className="text-indigo-600 hover:text-indigo-800 disabled:opacity-50"
                              title={t('record_usage') || 'Record Usage'}
                            >
                              <MinusCircle className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => {
                                setEditingItem(item);
                                setIsModalOpen(true);
                              }}
                              disabled={frozen}
                              className="text-yellow-600 hover:text-yellow-800 disabled:opacity-50"
                              title={t('edit')}
                            >
                              <Edit className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDelete(item.id)}
                              disabled={frozen}
                              className="text-red-600 hover:text-red-800 disabled:opacity-50"
                              title={t('delete')}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="px-4 py-3 border-t bg-gray-50 flex items-center justify-between">
              <div className="text-sm text-gray-700">
                {t('showing')} <span className="font-medium">{(currentPage - 1) * pageSize + 1}</span> to{' '}
                <span className="font-medium">{Math.min(currentPage * pageSize, totalCount)}</span> of{' '}
                <span className="font-medium">{totalCount}</span> {t('results')}
              </div>
              <div className="flex space-x-2">
                <button
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                  className="px-3 py-1 border rounded bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                >
                  {t('previous')}
                </button>
                <div className="flex items-center px-4 text-sm text-gray-700">
                  {t('page')} {currentPage} / {totalPages}
                </div>
                <button
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  disabled={currentPage === totalPages}
                  className="px-3 py-1 border rounded bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                >
                  {t('next')}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {isModalOpen && (
        <InventoryFormModal
          item={editingItem}
          categories={categories}
          suppliers={suppliers}
          onClose={() => {
            setIsModalOpen(false);
            setEditingItem(null);
          }}
          onSave={handleSave}
        />
      )}

      {historyItemId && (
        <HistoryModal itemId={historyItemId} onClose={() => setHistoryItemId(null)} />
      )}

      {usageItem && (
        <UsageRecordModal
          item={usageItem}
          onClose={() => setUsageItem(null)}
          onSave={handleRecordUsage}
        />
      )}
    </div>
  );
};

const InventoryFormModal: React.FC<{
  item: InventoryItem | null;
  categories: Category[];
  suppliers: any[];
  onClose: () => void;
  onSave: (data: any) => void;
}> = ({ item, categories, suppliers, onClose, onSave }) => {
  const { t, i18n } = useTranslation();
  const [formData, setFormData] = useState({
    name: item?.name || '',
    category_id: item?.category_id || '',
    quantity: item?.quantity || 0,
    price: item?.price || 0,
    supplier: typeof item?.supplier === 'object' && item?.supplier !== null 
      ? (item.supplier as any).id 
      : (item?.supplier || ''),
    location: item?.location || '',
    min_stock: item?.min_stock || 10,
    max_stock: item?.max_stock || 100,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b flex justify-between items-center">
          <h2 className="text-2xl font-bold">{item ? t('edit_item') : t('add_item')}</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            ×
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
                {t('name')}
              </label>
              <input
                id="name"
                type="text"
                placeholder="Enter product name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-navy"
                required
              />
            </div>
            <div>
              <label htmlFor="category" className="block text-sm font-medium text-gray-700 mb-1">
                {t('category')}
              </label>
              <select
                id="category"
                value={formData.category_id || ''}
                onChange={(e) => setFormData({ ...formData, category_id: e.target.value })}
                className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-navy"
                required
              >
                <option value="">Select a category</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {i18n.language === 'fr' ? category.name_fr : category.name_en}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="quantity" className="block text-sm font-medium text-gray-700 mb-1">
                {t('quantity')}
              </label>
              <input
                id="quantity"
                type="number"
                placeholder="Enter quantity (units)"
                value={formData.quantity}
                onChange={(e) => setFormData({ ...formData, quantity: Number(e.target.value) })}
                className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-navy"
                required
              />
            </div>
            <div>
              <label htmlFor="price" className="block text-sm font-medium text-gray-700 mb-1">
                {t('price')}
              </label>
              <div className="relative">
                <input
                  id="price"
                  type="text"
                  inputMode="numeric"
                  placeholder="0"
                  value={formData.price}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (value === '' || /^\d*\.?\d*$/.test(value)) {
                      setFormData({ ...formData, price: value === '' ? 0 : Number(value) });
                    }
                  }}
                  className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-navy pr-12"
                  required
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">
                  GNF
                </span>
              </div>
            </div>
            <div>
              <label htmlFor="supplier" className="block text-sm font-medium text-gray-700 mb-1">
                {t('supplier')}
              </label>
              <select
                id="supplier"
                value={typeof formData.supplier === 'object' && formData.supplier !== null 
                  ? (formData.supplier as any).id 
                  : (formData.supplier || '')}
                onChange={(e) => setFormData({ ...formData, supplier: e.target.value })}
                className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-navy"
              >
                <option value="">Select a supplier</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="location" className="block text-sm font-medium text-gray-700 mb-1">
                {t('location')}
              </label>
              <input
                id="location"
                type="text"
                placeholder="Enter location"
                value={formData.location}
                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-navy"
                required
              />
            </div>
            <div>
              <label htmlFor="min_stock" className="block text-sm font-medium text-gray-700 mb-1">
                {t('min_stock')}
              </label>
              <input
                id="min_stock"
                type="number"
                placeholder="Minimum stock level"
                value={formData.min_stock}
                onChange={(e) => setFormData({ ...formData, min_stock: Number(e.target.value) })}
                className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-navy"
                required
              />
            </div>
            <div>
              <label htmlFor="max_stock" className="block text-sm font-medium text-gray-700 mb-1">
                {t('max_stock')}
              </label>
              <input
                id="max_stock"
                type="number"
                placeholder="Maximum stock level"
                value={formData.max_stock}
                onChange={(e) => setFormData({ ...formData, max_stock: Number(e.target.value) })}
                className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-navy"
                required
              />
            </div>
          </div>
          <div className="flex justify-end space-x-3 mt-6">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border rounded-md hover:bg-gray-50"
            >
              {t('cancel')}
            </button>
            <button type="submit" className="px-4 py-2 bg-navy text-white rounded-md hover:bg-opacity-90">
              {t('save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const HistoryModal: React.FC<{ itemId: string; onClose: () => void }> = ({ itemId, onClose }) => {
  const { t } = useTranslation();
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const data = await fetchApi(`/inventory/${itemId}/history`);
        setLogs(data || []);
      } catch (error) {
        console.error('Error fetching history:', error);
      }
      setLoading(false);
    };
    fetchHistory();
  }, [itemId]);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b flex justify-between items-center">
          <h2 className="text-2xl font-bold">{t('change_history')}</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            ×
          </button>
        </div>
        <div className="p-6">
          {loading ? (
            <div className="text-center py-8">{t('loading')}</div>
          ) : logs.length === 0 ? (
            <div className="text-center py-8 text-gray-500">{t('no_history')}</div>
          ) : (
            <div className="space-y-4">
              {logs.map((log: any) => (
                <div key={log.id} className="border rounded-lg p-4">
                  <div className="flex justify-between mb-2">
                    <span className="font-medium">{log.user?.name || log.user?.email || 'Unknown'}</span>
                    <span className="text-sm text-gray-500">{new Date(log.timestamp).toLocaleString()}</span>
                  </div>
                  <span
                    className={`inline-block px-2 py-1 rounded text-xs ${
                      log.action === 'created'
                        ? 'bg-green-100 text-green-800'
                        : log.action === 'updated'
                        ? 'bg-blue-100 text-blue-800'
                        : 'bg-red-100 text-red-800'
                    }`}
                  >
                    {log.action}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const UsageRecordModal: React.FC<{
  item: InventoryItem;
  onClose: () => void;
  onSave: (item: InventoryItem, usageAmount: number) => Promise<void>;
}> = ({ item, onClose, onSave }) => {
  const { t } = useTranslation();
  const [usageAmount, setUsageAmount] = useState(1);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    await onSave(item, usageAmount);
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-md w-full p-6">
        <h2 className="text-2xl font-bold mb-4">{t('record_usage') || 'Record Usage'}</h2>
        
        <div className="bg-gray-50 border rounded-lg p-4 mb-6">
          <p className="font-semibold text-gray-800">{item.name}</p>
          <p className="text-sm text-gray-600">{t('current_stock')}: <span className="font-bold text-navy">{item.quantity}</span> Units</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Quantity Used / Deducted
            </label>
            <input
              type="number"
              min="1"
              max={item.quantity}
              value={usageAmount}
              onChange={(e) => setUsageAmount(Number(e.target.value))}
              className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-navy"
              required
            />
            {usageAmount > item.quantity && (
              <p className="text-sm text-red-600 mt-1">Cannot deduct more than current stock.</p>
            )}
          </div>

          <div className="flex justify-end space-x-3 mt-6">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 border rounded-md hover:bg-gray-50 disabled:opacity-50"
            >
              {t('cancel')}
            </button>
            <button
              type="submit"
              disabled={loading || usageAmount > item.quantity || usageAmount <= 0}
              className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50"
            >
              Confirm Usage
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Inventory;
