import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Plus, CreditCard as Edit2, Trash2, Phone, Mail, MapPin, Eye, Archive, ArchiveRestore, RefreshCw } from 'lucide-react';
import { fetchApi } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { useSync } from '../contexts/SyncContext';

interface Supplier {
  id: string;
  name: string;
  contact: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  is_archived?: boolean | number;
  created_at: string;
}

export default function Suppliers() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { refreshStatus, triggerSync, isOnline } = useSync();
  const navigate = useNavigate();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

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
      resetForm();
      fetchSuppliers();
      await refreshStatus();
      if (isOnline) triggerSync();
    } catch (error) {
      console.error('Error saving supplier:', error);
      alert(t('error_saving_supplier'));
    } finally {
      setSaving(false);
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
    if (!confirm(permanent ? 'Are you sure you want to permanently delete this supplier?' : (t('confirm_archive_supplier') || "Do you want to archive this supplier?"))) return;
    setSaving(true);
    try {
      if (permanent) {
        await fetchApi(`/suppliers/${id}/permanent`, { method: 'DELETE' });
      } else {
        await fetchApi(`/suppliers/${id}`, { method: 'DELETE' });
      }
      fetchSuppliers();
      await refreshStatus();
      if (isOnline) triggerSync();
    } catch (error: any) {
      console.error('Error deleting supplier:', error);
      if (error.message?.includes('associated orders')) {
        alert('Cannot physically delete a supplier that has associated orders. They must remain archived.');
      } else {
        alert(t('error_archiving_supplier') || "Error modified supplier");
      }
    } finally {
      setSaving(false);
    }
  };

  const handleRestore = async (id: string) => {
    try {
      await fetchApi(`/suppliers/${id}/restore`, { method: 'PATCH' });
      fetchSuppliers();
    } catch (error) {
      console.error('Error restoring supplier:', error);
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      contact: '',
      phone: '',
      email: '',
      address: ''
    });
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingSupplier(null);
    resetForm();
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
        <h1 className="text-3xl font-bold text-[#001f3f]">{t('suppliers')}</h1>
        <div className="flex items-center gap-3">
          {canEdit && (
            <button
              onClick={() => setShowArchived(!showArchived)}
              className="flex items-center gap-2 text-gray-600 hover:text-gray-900 bg-white border border-gray-300 px-4 py-2 rounded-lg transition-colors"
            >
              {showArchived ? <ArchiveRestore className="w-5 h-5" /> : <Archive className="w-5 h-5" />}
              {showArchived ? 'View Active' : 'View Archived'}
            </button>
          )}
          {canEdit && !showArchived && (
            <button
              onClick={() => setShowModal(true)}
              className="flex items-center gap-2 bg-[#001f3f] text-white px-4 py-2 rounded-lg hover:bg-[#003366] transition-colors"
            >
              <Plus className="w-5 h-5" />
              {t('add_supplier')}
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {suppliers.map((supplier) => (
          <div
            key={supplier.id}
            className="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow"
          >
            <div className="flex items-start justify-between mb-4">
              <h3 className="text-xl font-semibold text-[#001f3f]">{supplier.name}</h3>
              {canEdit && (
                <div className="flex gap-2">
                  {!showArchived ? (
                    <>
                      <button
                        onClick={() => handleEdit(supplier)}
                        className="text-blue-600 hover:text-blue-800"
                        title={t('edit')}
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => navigate(`/orders?supplier_id=${supplier.id}`)}
                        className="text-green-600 hover:text-green-800"
                        title={t('view_orders')}
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(supplier.id, false)}
                        className="text-orange-600 hover:text-orange-800"
                        title={t('archive') || "Archive"}
                        disabled={saving}
                      >
                        <Archive className="w-4 h-4" />
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => handleRestore(supplier.id)}
                        className="text-green-600 hover:text-green-800"
                        title="Restore"
                      >
                        <RefreshCw className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(supplier.id, true)}
                        className="text-red-600 hover:text-red-800"
                        title="Permanently Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>

            <div className="space-y-2 text-sm text-gray-600">
              {supplier.contact && (
                <div className="flex items-center gap-2">
                  <span className="font-medium">{t('contact')}:</span>
                  <span>{supplier.contact}</span>
                </div>
              )}
              {supplier.phone && (
                <div className="flex items-center gap-2">
                  <Phone className="w-4 h-4" />
                  <span>{supplier.phone}</span>
                </div>
              )}
              {supplier.email && (
                <div className="flex items-center gap-2">
                  <Mail className="w-4 h-4" />
                  <span>{supplier.email}</span>
                </div>
              )}
              {supplier.address && (
                <div className="flex items-start gap-2">
                  <MapPin className="w-4 h-4 mt-1" />
                  <span>{supplier.address}</span>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {suppliers.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          {t('no_suppliers_found')}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <h2 className="text-2xl font-bold text-[#001f3f] mb-4">
              {editingSupplier ? t('edit_supplier') : t('add_supplier')}
            </h2>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('supplier_name')} *
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#001f3f] focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('contact_person')}
                </label>
                <input
                  type="text"
                  value={formData.contact}
                  onChange={(e) => setFormData({ ...formData, contact: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#001f3f] focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('phone')}
                </label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#001f3f] focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('email')}
                </label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#001f3f] focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('address')}
                </label>
                <textarea
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#001f3f] focus:border-transparent"
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 bg-[#001f3f] text-white py-2 rounded-lg hover:bg-[#003366] transition-colors disabled:opacity-50"
                >
                  {saving ? (t('loading') || 'Saving...') : (editingSupplier ? t('update') : t('create'))}
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={handleCloseModal}
                  className="flex-1 bg-gray-200 text-gray-700 py-2 rounded-lg hover:bg-gray-300 transition-colors disabled:opacity-50"
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
