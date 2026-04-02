import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Plus, CreditCard as Edit2, Trash2, Eye } from 'lucide-react';
import { fetchApi } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { useSync } from '../contexts/SyncContext';

interface Category {
  id: string;
  name_en: string;
  name_fr: string;
  created_at: string;
}

export default function Categories() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { refreshStatus, triggerSync, isOnline } = useSync();
  const navigate = useNavigate();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [formData, setFormData] = useState({
    name_en: '',
    name_fr: ''
  });

  const isAdmin = user?.role === 'admin';

  useEffect(() => {
    fetchCategories();
  }, []);

  const fetchCategories = async () => {
    try {
      const data = await fetchApi('/categories');
      setCategories(data || []);
    } catch (error) {
      console.error('Error fetching categories:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      if (editingCategory) {
        await fetchApi(`/categories/${editingCategory.id}`, {
          method: 'PUT',
          body: JSON.stringify(formData)
        });
      } else {
        await fetchApi('/categories', {
          method: 'POST',
          body: JSON.stringify(formData)
        });
      }

      setShowModal(false);
      setEditingCategory(null);
      resetForm();
      fetchCategories();
      await refreshStatus();
      if (isOnline) triggerSync();
    } catch (error) {
      console.error('Error saving category:', error);
      alert(t('error_saving_category'));
    }
  };

  const handleEdit = (category: Category) => {
    setEditingCategory(category);
    setFormData({
      name_en: category.name_en,
      name_fr: category.name_fr
    });
    setShowModal(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t('confirm_delete_category'))) return;

    try {
      await fetchApi(`/categories/${id}`, { method: 'DELETE' });
      fetchCategories();
      await refreshStatus();
      if (isOnline) triggerSync();
    } catch (error: any) {
      console.error('Error deleting category:', error);
      if (error.message?.includes('foreign key') || error.message?.includes('use')) {
        alert(t('cannot_delete_category_in_use'));
      } else {
        alert(t('error_deleting_category'));
      }
    }
  };

  const resetForm = () => {
    setFormData({
      name_en: '',
      name_fr: ''
    });
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingCategory(null);
    resetForm();
  };

  if (!isAdmin) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">{t('admin_only')}</p>
      </div>
    );
  }

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
        <h1 className="text-3xl font-bold text-[#001f3f]">{t('categories')}</h1>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 bg-[#001f3f] text-white px-4 py-2 rounded-lg hover:bg-[#003366] transition-colors"
        >
          <Plus className="w-5 h-5" />
          {t('add_category')}
        </button>
      </div>

      <div className="bg-white rounded-lg shadow-md overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                {t('english_name')}
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                {t('french_name')}
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                {t('actions')}
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {categories.map((category) => (
              <tr key={category.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {category.name_en}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {category.name_fr}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm">
                  <div className="flex gap-3">
                    <button
                      onClick={() => navigate(`/inventory?category_id=${category.id}`)}
                      className="text-green-600 hover:text-green-800"
                      title={t('view_inventory')}
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleEdit(category)}
                      className="text-blue-600 hover:text-blue-800"
                      title={t('edit')}
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(category.id)}
                      className="text-red-600 hover:text-red-800"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {categories.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            {t('no_categories_found')}
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <h2 className="text-2xl font-bold text-[#001f3f] mb-4">
              {editingCategory ? t('edit_category') : t('add_category')}
            </h2>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('english_name')} *
                </label>
                <input
                  type="text"
                  required
                  value={formData.name_en}
                  onChange={(e) => setFormData({ ...formData, name_en: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#001f3f] focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('french_name')} *
                </label>
                <input
                  type="text"
                  required
                  value={formData.name_fr}
                  onChange={(e) => setFormData({ ...formData, name_fr: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#001f3f] focus:border-transparent"
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="submit"
                  className="flex-1 bg-[#001f3f] text-white py-2 rounded-lg hover:bg-[#003366] transition-colors"
                >
                  {editingCategory ? t('update') : t('create')}
                </button>
                <button
                  type="button"
                  onClick={handleCloseModal}
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
