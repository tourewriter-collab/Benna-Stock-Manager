import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import { fetchApi } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { useSync } from '../contexts/SyncContext';
import { formatCurrency } from '../utils/currency';

interface OrderItem {
  description: string;
  quantity: number;
  unit_price: number;
}

export default function CreateOrder() {
  const { t } = useTranslation();
  useAuth();
  const { refreshStatus, triggerSync, isOnline } = useSync();
  const navigate = useNavigate();
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [formData, setFormData] = useState({
    supplier_id: '',
    expected_date: '',
    notes: ''
  });
  const [items, setItems] = useState<OrderItem[]>([{
    description: '',
    quantity: 1,
    unit_price: 0
  }]);

  useEffect(() => {
    fetchSuppliers();
  }, []);

  const fetchSuppliers = async () => {
    try {
      const data = await fetchApi('/api/suppliers');
      setSuppliers(data || []);
    } catch (error) {
      console.error('Error fetching suppliers:', error);
    }
  };

  const handleAddItem = () => {
    setItems([...items, { description: '', quantity: 1, unit_price: 0 }]);
  };

  const handleRemoveItem = (index: number) => {
    if (items.length === 1) return;
    const newItems = items.filter((_, i) => i !== index);
    setItems(newItems);
  };

  const handleItemChange = (index: number, field: keyof OrderItem, value: any) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], [field]: value };
    setItems(newItems);
  };

  const calculateTotal = () => {
    return items.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.supplier_id) {
      alert(t('please_select_supplier'));
      return;
    }

    if (items.length === 0 || items.some(item => !item.description)) {
      alert(t('please_add_items'));
      return;
    }

    try {
      const order = await fetchApi('/api/orders', {
        method: 'POST',
        body: JSON.stringify({
          ...formData,
          items
        })
      });

      await refreshStatus();
      if (isOnline) triggerSync();

      navigate(`/orders/${order.id}`);
    } catch (error) {
      console.error('Error creating order:', error);
      alert(t('error_creating_order'));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate('/orders')}
          className="text-[#001f3f] hover:text-[#003366]"
        >
          <ArrowLeft className="w-6 h-6" />
        </button>
        <h1 className="text-3xl font-bold text-[#001f3f]">{t('create_order')}</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-semibold text-[#001f3f] mb-4">{t('order_information')}</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('supplier')} *
              </label>
              <select
                required
                value={formData.supplier_id}
                onChange={(e) => setFormData({ ...formData, supplier_id: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#001f3f] focus:border-transparent"
              >
                <option value="">{t('select_supplier')}</option>
                {suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('expected_date')}
              </label>
              <input
                type="date"
                value={formData.expected_date}
                onChange={(e) => setFormData({ ...formData, expected_date: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#001f3f] focus:border-transparent"
              />
            </div>
          </div>

          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('notes')}
            </label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#001f3f] focus:border-transparent"
            />
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-[#001f3f]">{t('order_items')}</h2>
            <button
              type="button"
              onClick={handleAddItem}
              className="flex items-center gap-2 bg-[#001f3f] text-white px-3 py-1.5 rounded-lg hover:bg-[#003366] text-sm"
            >
              <Plus className="w-4 h-4" />
              {t('add_item')}
            </button>
          </div>

          <div className="space-y-4">
            {items.map((item, index) => (
              <div key={index} className="flex gap-4 items-start">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {t('description')} *
                  </label>
                  <input
                    type="text"
                    required
                    value={item.description}
                    onChange={(e) => handleItemChange(index, 'description', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#001f3f] focus:border-transparent"
                  />
                </div>

                <div className="w-24">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {t('quantity')} *
                  </label>
                  <input
                    type="number"
                    required
                    min="1"
                    value={item.quantity}
                    onChange={(e) => handleItemChange(index, 'quantity', parseInt(e.target.value))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#001f3f] focus:border-transparent"
                  />
                </div>

                <div className="w-32">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {t('unit_price')} *
                  </label>
                  <input
                    type="number"
                    required
                    min="0"
                    step="0.01"
                    value={item.unit_price}
                    onChange={(e) => handleItemChange(index, 'unit_price', parseFloat(e.target.value))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#001f3f] focus:border-transparent"
                  />
                </div>

                <div className="w-32">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {t('total')}
                  </label>
                  <div className="px-3 py-2 bg-gray-50 rounded-lg text-gray-900 font-semibold">
                    {formatCurrency(item.quantity * item.unit_price)}
                  </div>
                </div>

                <div className="pt-7">
                  <button
                    type="button"
                    onClick={() => handleRemoveItem(index)}
                    disabled={items.length === 1}
                    className="text-red-600 hover:text-red-800 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 pt-4 border-t">
            <div className="flex justify-between items-center text-lg">
              <span className="font-semibold text-gray-700">{t('total_amount')}:</span>
              <span className="font-bold text-[#001f3f]">{formatCurrency(calculateTotal())}</span>
            </div>
          </div>
        </div>

        <div className="flex gap-4">
          <button
            type="submit"
            className="flex-1 bg-[#001f3f] text-white py-3 rounded-lg hover:bg-[#003366] transition-colors font-semibold"
          >
            {t('create_order')}
          </button>
          <button
            type="button"
            onClick={() => navigate('/orders')}
            className="flex-1 bg-gray-200 text-gray-700 py-3 rounded-lg hover:bg-gray-300 transition-colors font-semibold"
          >
            {t('cancel')}
          </button>
        </div>
      </form>
    </div>
  );
}
