import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, CreditCard as Edit2, Trash2, DollarSign, Printer, CheckCircle } from 'lucide-react';
import { fetchApi } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { formatCurrency } from '../utils/currency';
import { generateOrderPDF } from '../utils/pdfExport';

interface OrderItem {
  id: string;
  description: string;
  quantity: number;
  unit_price: number;
  total: number;
  inventory_item_id: string | null;
  delivered_quantity: number;
}

interface Payment {
  id: string;
  amount: number;
  payment_date: string;
  method: string;
  reference: string | null;
  notes: string | null;
}

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
  status: string;
  delivery_status?: string;
  notes: string | null;
  balance: number;
  items: OrderItem[];
  payments: Payment[];
}

export default function OrderDetail() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [showItemModal, setShowItemModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [editingItem, setEditingItem] = useState<OrderItem | null>(null);
  const [itemForm, setItemForm] = useState({
    description: '',
    quantity: 1,
    unit_price: 0
  });
  const [paymentForm, setPaymentForm] = useState({
    amount: 0,
    payment_date: new Date().toISOString().split('T')[0],
    method: 'cash',
    reference: '',
    notes: ''
  });

  const canEdit = user?.role === 'admin' || user?.role === 'audit_manager';
  const balance = order ? order.total_amount - order.paid_amount : 0;

  useEffect(() => {
    if (id) {
      fetchOrder();
    }
  }, [id]);

  const fetchOrder = async () => {
    try {
      const data = await fetchApi(`/api/orders/${id}`);
      setOrder(data);
    } catch (error) {
      console.error('Error fetching order:', error);
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = async () => {
    if (!order) return;
    try {
      const settings = await fetchApi('/settings');
      generateOrderPDF(order, settings || {}, t);
    } catch (error) {
      console.error('Error printing PDF:', error);
    }
  };

  const handleUpdateDelivery = async (itemId: string, current: number, max: number) => {
    const newVal = prompt(`${t('delivered_quantity')} (Max: ${max})`, current.toString());
    if (newVal === null) return;
    
    const quantity = parseInt(newVal);
    if (isNaN(quantity) || quantity < 0 || quantity > max) {
      alert(t('error'));
      return;
    }

    try {
      await fetchApi(`/api/orders/${id}/items/${itemId}/delivery`, {
        method: 'PUT',
        body: JSON.stringify({ delivered_quantity: quantity })
      });
      fetchOrder();
    } catch (error) {
      console.error('Error updating delivery:', error);
    }
  };

  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      if (editingItem) {
        await fetchApi(`/api/orders/${id}/items/${editingItem.id}`, {
          method: 'PUT',
          body: JSON.stringify(itemForm)
        });
      } else {
        await fetchApi(`/api/orders/${id}/items`, {
          method: 'POST',
          body: JSON.stringify(itemForm)
        });
      }

      setShowItemModal(false);
      setEditingItem(null);
      resetItemForm();
      fetchOrder();
    } catch (error) {
      console.error('Error saving item:', error);
      alert(t('error_saving_item'));
    }
  };

  const handleDeleteItem = async (itemId: string) => {
    if (!confirm(t('confirm_delete_item'))) return;

    try {
      await fetchApi(`/api/orders/${id}/items/${itemId}`, {
        method: 'DELETE'
      });
      fetchOrder();
    } catch (error) {
      console.error('Error deleting item:', error);
      alert(t('error_deleting_item'));
    }
  };

  const handleAddPayment = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      if (!order) return;

      const amountToPay = parseFloat(paymentForm.amount.toString());
      if (order.paid_amount + amountToPay > order.total_amount) {
        alert(t('payment_exceeds_balance'));
        return;
      }

      await fetchApi('/api/payments', {
        method: 'POST',
        body: JSON.stringify({
          order_id: id,
          ...paymentForm
        })
      });

      setShowPaymentModal(false);
      resetPaymentForm();
      fetchOrder();
    } catch (error) {
      console.error('Error adding payment:', error);
      alert(t('error_adding_payment'));
    }
  };

  const handleDeletePayment = async (paymentId: string) => {
    if (!confirm(t('confirm_delete_payment'))) return;

    try {
      await fetchApi(`/api/payments/${paymentId}`, {
        method: 'DELETE'
      });
      fetchOrder();
    } catch (error) {
      console.error('Error deleting payment:', error);
      alert(t('error_deleting_payment'));
    }
  };

  const handleDeleteOrder = async () => {
    if (!confirm(t('confirm_delete_order'))) return;

    try {
      await fetchApi(`/api/orders/${id}`, {
        method: 'DELETE'
      });
      navigate('/orders');
    } catch (error) {
      console.error('Error deleting order:', error);
      alert(t('error_deleting_order'));
    }
  };

  const resetItemForm = () => {
    setItemForm({
      description: '',
      quantity: 1,
      unit_price: 0
    });
  };

  const resetPaymentForm = () => {
    setPaymentForm({
      amount: 0,
      payment_date: new Date().toISOString().split('T')[0],
      method: 'cash',
      reference: '',
      notes: ''
    });
  };

  const handleEditItem = (item: OrderItem) => {
    setEditingItem(item);
    setItemForm({
      description: item.description,
      quantity: item.quantity,
      unit_price: item.unit_price
    });
    setShowItemModal(true);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-gray-600">{t('loading')}</div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">{t('order_not_found')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate('/orders')}
          className="text-[#001f3f] hover:text-[#003366]"
        >
          <ArrowLeft className="w-6 h-6" />
        </button>
        <h1 className="text-3xl font-bold text-[#001f3f]">{t('order_details')}</h1>
        <div className="flex-1" />
        {canEdit && (
          <button
            onClick={handlePrint}
            className="flex items-center gap-2 bg-white text-[#001f3f] border border-[#001f3f] px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <Printer className="w-5 h-5" />
            {t('print')}
          </button>
        )}
        {canEdit && (
          <button
            onClick={handleDeleteOrder}
            className="flex items-center gap-2 bg-red-50 text-red-600 border border-red-200 px-4 py-2 rounded-lg hover:bg-red-100 transition-colors"
          >
            <Trash2 className="w-5 h-5" />
            {t('delete_order')}
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-semibold text-[#001f3f] mb-4">{t('order_information')}</h2>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="font-medium text-gray-700">{t('supplier')}:</span>
                <p className="text-gray-900">{order.supplier.name}</p>
              </div>
              <div>
                <span className="font-medium text-gray-700">{t('order_date')}:</span>
                <p className="text-gray-900">{new Date(order.order_date).toLocaleDateString()}</p>
              </div>
              {order.expected_date && (
                <div>
                  <span className="font-medium text-gray-700">{t('expected_date')}:</span>
                  <p className="text-gray-900">{new Date(order.expected_date).toLocaleDateString()}</p>
                </div>
              )}
              <div>
                <span className="font-medium text-gray-700">{t('status')}:</span>
                <p className="text-gray-900">{t(order.status)}</p>
              </div>
              <div>
                <span className="font-medium text-gray-700">{t('delivery_status')}:</span>
                <p className="text-gray-900 font-semibold">{t(order.delivery_status || 'pending')}</p>
              </div>
            </div>
            {order.notes && (
              <div className="mt-4">
                <span className="font-medium text-gray-700">{t('notes')}:</span>
                <p className="text-gray-900 mt-1">{order.notes}</p>
              </div>
            )}
          </div>

          <div className="bg-white rounded-lg shadow-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-[#001f3f]">{t('order_items')}</h2>
              {canEdit && (
                <button
                  onClick={() => setShowItemModal(true)}
                  className="flex items-center gap-2 bg-[#001f3f] text-white px-3 py-1.5 rounded-lg hover:bg-[#003366] text-sm"
                >
                  <Plus className="w-4 h-4" />
                  {t('add_item')}
                </button>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                      {t('description')}
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                      {t('quantity')}
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                      {t('delivered_quantity')}
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                      {t('remaining')}
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                      {t('unit_price')}
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                      {t('total')}
                    </th>
                    {canEdit && (
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                        {t('actions')}
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {order.items.map((item) => (
                    <tr key={item.id}>
                      <td className="px-4 py-2 text-sm text-gray-900">{item.description}</td>
                      <td className="px-4 py-2 text-sm text-gray-900">{item.quantity}</td>
                      <td className="px-4 py-2 text-sm text-gray-900">
                        <div className="flex items-center gap-2">
                          {item.delivered_quantity}
                          {canEdit && (
                            <button 
                              onClick={() => handleUpdateDelivery(item.id, item.delivered_quantity, item.quantity)}
                              className="text-navy hover:text-opacity-70"
                              title={t('update')}
                            >
                              <Edit2 className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-2 text-sm text-gray-900">
                        {item.quantity - item.delivered_quantity > 0 ? (
                          <span className="text-orange-600 font-medium">{item.quantity - item.delivered_quantity}</span>
                        ) : (
                          <CheckCircle className="w-4 h-4 text-green-500" />
                        )}
                      </td>
                      <td className="px-4 py-2 text-sm text-gray-900">{formatCurrency(item.unit_price)}</td>
                      <td className="px-4 py-2 text-sm font-semibold text-gray-900">{formatCurrency(item.total)}</td>
                      {canEdit && (
                        <td className="px-4 py-2 text-sm">
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleEditItem(item)}
                              className="text-blue-600 hover:text-blue-800"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDeleteItem(item.id)}
                              className="text-red-600 hover:text-red-800"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-semibold text-[#001f3f] mb-4">{t('payment_summary')}</h2>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-700">{t('total_amount')}:</span>
                <span className="font-semibold text-gray-900">{formatCurrency(order.total_amount)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-700">{t('paid_amount')}:</span>
                <span className="font-semibold text-green-600">{formatCurrency(order.paid_amount)}</span>
              </div>
              <div className="flex justify-between border-t pt-3">
                <span className="text-gray-700 font-semibold">{t('balance')}:</span>
                <span className="font-bold text-red-600">{formatCurrency(balance)}</span>
              </div>
            </div>

            {canEdit && balance > 0 && (
              <button
                onClick={() => setShowPaymentModal(true)}
                className="w-full mt-4 flex items-center justify-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700"
              >
                <DollarSign className="w-5 h-5" />
                {t('record_payment')}
              </button>
            )}
          </div>

          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-semibold text-[#001f3f] mb-4">{t('payment_history')}</h2>
            <div className="space-y-3">
              {order.payments.map((payment) => (
                <div key={payment.id} className="border-b pb-3 last:border-0">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <div className="font-semibold text-gray-900">{formatCurrency(payment.amount)}</div>
                      <div className="text-xs text-gray-500">
                        {new Date(payment.payment_date).toLocaleDateString()}
                      </div>
                      <div className="text-xs text-gray-500">{t(payment.method)}</div>
                      {payment.reference && (
                        <div className="text-xs text-gray-500">Ref: {payment.reference}</div>
                      )}
                    </div>
                    {canEdit && (
                      <button
                        onClick={() => handleDeletePayment(payment.id)}
                        className="text-red-600 hover:text-red-800"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  {payment.notes && (
                    <p className="text-xs text-gray-600">{payment.notes}</p>
                  )}
                </div>
              ))}

              {order.payments.length === 0 && (
                <p className="text-sm text-gray-500 text-center py-4">{t('no_payments_recorded')}</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {showItemModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <h2 className="text-2xl font-bold text-[#001f3f] mb-4">
              {editingItem ? t('edit_item') : t('add_item')}
            </h2>

            <form onSubmit={handleAddItem} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('description')} *
                </label>
                <input
                  type="text"
                  required
                  value={itemForm.description}
                  onChange={(e) => setItemForm({ ...itemForm, description: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#001f3f] focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('quantity')} *
                </label>
                <input
                  type="number"
                  required
                  min="1"
                  value={itemForm.quantity}
                  onChange={(e) => setItemForm({ ...itemForm, quantity: parseInt(e.target.value) })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#001f3f] focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('unit_price')} *
                </label>
                <input
                  type="number"
                  required
                  min="0"
                  step="0.01"
                  value={itemForm.unit_price}
                  onChange={(e) => setItemForm({ ...itemForm, unit_price: parseFloat(e.target.value) })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#001f3f] focus:border-transparent"
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="submit"
                  className="flex-1 bg-[#001f3f] text-white py-2 rounded-lg hover:bg-[#003366] transition-colors"
                >
                  {editingItem ? t('update') : t('add')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowItemModal(false);
                    setEditingItem(null);
                    resetItemForm();
                  }}
                  className="flex-1 bg-gray-200 text-gray-700 py-2 rounded-lg hover:bg-gray-300 transition-colors"
                >
                  {t('cancel')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showPaymentModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <h2 className="text-2xl font-bold text-[#001f3f] mb-4">{t('record_payment')}</h2>

            <form onSubmit={handleAddPayment} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('amount')} * (Max: {formatCurrency(balance)})
                </label>
                <input
                  type="number"
                  required
                  min="0.01"
                  max={balance}
                  step="0.01"
                  value={paymentForm.amount}
                  onChange={(e) => setPaymentForm({ ...paymentForm, amount: parseFloat(e.target.value) })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#001f3f] focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('payment_date')} *
                </label>
                <input
                  type="date"
                  required
                  value={paymentForm.payment_date}
                  onChange={(e) => setPaymentForm({ ...paymentForm, payment_date: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#001f3f] focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('payment_method')} *
                </label>
                <select
                  required
                  value={paymentForm.method}
                  onChange={(e) => setPaymentForm({ ...paymentForm, method: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#001f3f] focus:border-transparent"
                >
                  <option value="cash">{t('cash')}</option>
                  <option value="bank">{t('bank')}</option>
                  <option value="credit">{t('credit')}</option>
                  <option value="other">{t('other')}</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('reference')}
                </label>
                <input
                  type="text"
                  value={paymentForm.reference}
                  onChange={(e) => setPaymentForm({ ...paymentForm, reference: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#001f3f] focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('notes')}
                </label>
                <textarea
                  value={paymentForm.notes}
                  onChange={(e) => setPaymentForm({ ...paymentForm, notes: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#001f3f] focus:border-transparent"
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="submit"
                  className="flex-1 bg-green-600 text-white py-2 rounded-lg hover:bg-green-700 transition-colors"
                >
                  {t('record_payment')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowPaymentModal(false);
                    resetPaymentForm();
                  }}
                  className="flex-1 bg-gray-200 text-gray-700 py-2 rounded-lg hover:bg-gray-300 transition-colors"
                >
                  {t('cancel')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
