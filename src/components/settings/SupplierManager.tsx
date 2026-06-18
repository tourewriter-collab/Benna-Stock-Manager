import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, CreditCard as Edit2, Trash2, Phone, Mail, MapPin, Archive, ArchiveRestore, RefreshCw, BarChart3, Clock } from 'lucide-react';
import { fetchApi } from '../../lib/api';
import { useAuth } from '../../contexts/AuthContext';
import { useSync } from '../../contexts/SyncContext';
import { formatPrice } from '../../utils/currency';

interface Supplier {
  id: string;
  name: string;
  contact: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  is_archived?: boolean | number;
}

interface PerformanceStat {
  id: string;
  name: string;
  total_orders: number;
  total_spent: number;
  avg_lead_time: number | null;
  on_time_rate: number | null;
}

export default function SupplierManager() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { refreshStatus, triggerSync, isOnline } = useSync();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [stats, setStats] = useState<PerformanceStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    contact: '',
    phone: '',
    email: '',
    address: ''
  });

  const canEdit = user?.role === 'admin' || user?.role === 'audit_manager';

  useEffect(() => {
    fetchSuppliers();
    fetchPerformance();
  }, [showArchived]);

  const fetchSuppliers = async () => {
    try {
      const data = await fetchApi('/suppliers?include_archived=true');
      const filtered = (data || []).filter((s: Supplier) => showArchived ? s.is_archived : !s.is_archived);
      setSuppliers(filtered);
    } catch (error) {
      console.error('Error fetching suppliers:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchPerformance = async () => {
    try {
      const data = await fetchApi('/suppliers/performance/stats');
      setStats(data || []);
    } catch (error) {
      console.error('Error fetching performance:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingSupplier) {
        await fetchApi(`/suppliers/${editingSupplier.id}`, {
          method: 'PUT',
          body: JSON.stringify(formData)
        });
      } else {
        await fetchApi('/suppliers', {
          method: 'POST',
          body: JSON.stringify(formData)
        });
      }
      setShowModal(false);
      setEditingSupplier(null);
      setFormData({ name: '', contact: '', phone: '', email: '', address: '' });
      fetchSuppliers();
      await refreshStatus();
      if (isOnline) triggerSync();
    } catch (error) {
      console.error('Error saving supplier:', error);
    }
  };

  const handleEdit = (supplier: Supplier) => {
    setEditingSupplier(supplier);
    setFormData({
      name: supplier.name,
      contact: supplier.contact || '',
      phone: supplier.phone || '',
      email: supplier.email || '',
      address: supplier.address || ''
    });
    setShowModal(true);
  };

  const handleDelete = async (id: string, permanent: boolean = false) => {
    if (!confirm(permanent ? t('delete_permanently') + '?' : t('confirm_archive_supplier'))) return;
    try {
      await fetchApi(`/suppliers/${id}${permanent ? '/permanent' : ''}`, { method: 'DELETE' });
      fetchSuppliers();
      await refreshStatus();
      if (isOnline) triggerSync();
    } catch (error) {
      console.error('Error deleting supplier:', error);
    }
  };

  const handleRestore = async (id: string) => {
    try {
      await fetchApi(`/suppliers/${id}/restore`, { method: 'PATCH' });
      fetchSuppliers();
      await refreshStatus();
      if (isOnline) triggerSync();
    } catch (error) {
      console.error('Error restoring supplier:', error);
    }
  };

  if (loading) return <div className="p-8 text-center text-gray-500">{t('loading')}</div>;

  return (
    <div className="space-y-8">
      {/* ── Performance Section ── */}
      {!showArchived && stats.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-xl font-bold text-[#001f3f] flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-blue-600" />
            {t('supplier_performance_analytics')}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {stats.slice(0, 3).map(stat => (
              <div key={stat.id} className="bg-gradient-to-br from-white to-blue-50 p-5 rounded-xl shadow-sm border border-blue-100">
                <div className="font-bold text-lg text-blue-900 mb-3 truncate">{stat.name}</div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col">
                    <span className="text-[10px] text-blue-600 uppercase font-black tracking-widest mb-1 flex items-center gap-1">
                      <Clock size={10} /> {t('lead_time')}
                    </span>
                    <span className="text-xl font-black text-blue-950">
                      {stat.avg_lead_time ? `${stat.avg_lead_time.toFixed(1)} Days` : 'N/A'}
                    </span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[10px] text-green-600 uppercase font-black tracking-widest mb-1 flex items-center gap-1">
                      <Clock size={10} /> {t('on_time_rate')}
                    </span>
                    <span className="text-xl font-black text-green-700">
                      {stat.on_time_rate ? `${Math.round(stat.on_time_rate)}%` : 'N/A'}
                    </span>
                  </div>
                  <div className="col-span-2 mt-2 pt-2 border-t border-blue-100 flex justify-between items-center">
                    <span className="text-xs text-blue-600 font-bold">{t('total_volume')}</span>
                    <span className="text-sm font-black text-blue-900">{formatPrice(stat.total_spent)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Management Section ── */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold text-[#001f3f]">{t('suppliers')}</h2>
          <div className="flex gap-2">
            <button
              onClick={() => setShowArchived(!showArchived)}
              className="flex items-center gap-2 text-gray-600 bg-white border border-gray-300 px-4 py-2 rounded-lg text-sm"
            >
              {showArchived ? <ArchiveRestore size={18} /> : <Archive size={18} />}
              {showArchived ? t('viewing_active') : t('viewing_archived')}
            </button>
            {!showArchived && canEdit && (
              <button
                onClick={() => setShowModal(true)}
                className="flex items-center gap-2 bg-[#001f3f] text-white px-4 py-2 rounded-lg text-sm"
              >
                <Plus size={18} />
                {t('add_supplier')}
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {suppliers.map((supplier) => (
            <div key={supplier.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 hover:shadow-md transition-shadow">
              <div className="flex justify-between items-start mb-4">
                <h3 className="font-bold text-[#001f3f] text-lg">{supplier.name}</h3>
                {canEdit && (
                  <div className="flex gap-1">
                    {!showArchived ? (
                      <>
                        <button onClick={() => handleEdit(supplier)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded"><Edit2 size={16} /></button>
                        <button onClick={() => handleDelete(supplier.id)} className="p-1.5 text-orange-600 hover:bg-orange-50 rounded"><Archive size={16} /></button>
                      </>
                    ) : (
                      <>
                        <button onClick={() => handleRestore(supplier.id)} className="p-1.5 text-green-600 hover:bg-green-50 rounded"><RefreshCw size={16} /></button>
                        <button onClick={() => handleDelete(supplier.id, true)} className="p-1.5 text-red-600 hover:bg-red-50 rounded"><Trash2 size={16} /></button>
                      </>
                    )}
                  </div>
                )}
              </div>
              <div className="space-y-2 text-sm text-gray-600">
                {supplier.contact && <div className="flex items-center gap-2 font-medium">Contact: {supplier.contact}</div>}
                {supplier.phone && <div className="flex items-center gap-2"><Phone size={14} /> {supplier.phone}</div>}
                {supplier.email && <div className="flex items-center gap-2"><Mail size={14} /> {supplier.email}</div>}
                {supplier.address && <div className="flex items-start gap-2"><MapPin size={14} className="mt-1" /> {supplier.address}</div>}
              </div>
            </div>
          ))}
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[60]">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-2xl">
            <h3 className="text-xl font-bold mb-4">{editingSupplier ? t('edit_supplier') : t('add_supplier')}</h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">{t('supplier_name')} *</label>
                <input required value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full border rounded-lg px-3 py-2" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">{t('phone')}</label>
                  <input type="tel" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} className="w-full border rounded-lg px-3 py-2" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t('email')}</label>
                  <input type="email" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} className="w-full border rounded-lg px-3 py-2" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{t('address')}</label>
                <textarea value={formData.address} onChange={e => setFormData({...formData, address: e.target.value})} rows={2} className="w-full border rounded-lg px-3 py-2" />
              </div>
              <div className="flex gap-2 pt-2">
                <button type="submit" className="flex-1 bg-[#001f3f] text-white py-2 rounded-lg font-bold">{t('save')}</button>
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 bg-gray-100 py-2 rounded-lg">{t('cancel')}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
