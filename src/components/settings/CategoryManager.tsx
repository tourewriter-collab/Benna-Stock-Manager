import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, CreditCard as Edit2, Trash2, RefreshCw, Archive, ArchiveRestore } from 'lucide-react';
import { fetchApi } from '../../lib/api';
import { useAuth } from '../../contexts/AuthContext';
import { useSync } from '../../contexts/SyncContext';

interface Category {
  id: string;
  name_en: string;
  name_fr: string;
  is_archived?: number | boolean;
  created_at: string;
}

export default function CategoryManager() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const { refreshStatus, triggerSync, isOnline } = useSync();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [formData, setFormData] = useState({
    name_en: '',
    name_fr: ''
  });

  const isAdmin = user?.role === 'admin';

  useEffect(() => {
    fetchCategories();
  }, [showArchived]);

  const fetchCategories = async () => {
    try {
      const data = await fetchApi(`/categories?include_archived=true`);
      
      const uniqueData: Category[] = [];
      const seenNames = new Set();
      
      (data || []).forEach((cat: Category) => {
        const nameKey = (cat.name_en || '').toLowerCase().trim();
        if (!seenNames.has(nameKey) && nameKey !== '') {
          seenNames.add(nameKey);
          uniqueData.push(cat);
        }
      });

      const filtered = uniqueData.filter((c: Category) => showArchived ? c.is_archived : !c.is_archived);
      setCategories(filtered);
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
      setFormData({ name_en: '', name_fr: '' });
      fetchCategories();
      await refreshStatus();
      if (isOnline) triggerSync();
    } catch (error) {
      console.error('Error saving category:', error);
    }
  };

  const handleEdit = (category: Category) => {
    setEditingCategory(category);
    setFormData({ name_en: category.name_en, name_fr: category.name_fr });
    setShowModal(true);
  };

  const handleDelete = async (id: string, permanent: boolean = false) => {
    if (!confirm(permanent ? 'Permanently delete?' : 'Archive category?')) return;
    try {
      await fetchApi(`/categories/${id}${permanent ? '/permanent' : ''}`, { method: 'DELETE' });
      fetchCategories();
      await refreshStatus();
      if (isOnline) triggerSync();
    } catch (error) {
      console.error('Error deleting category:', error);
    }
  };

  const handleRestore = async (id: string) => {
    try {
      await fetchApi(`/categories/${id}/restore`, { method: 'PATCH' });
      fetchCategories();
      await refreshStatus();
      if (isOnline) triggerSync();
    } catch (error) {
      console.error('Error restoring category:', error);
    }
  };

  if (loading) return <div className="p-8 text-center text-gray-500">{t('loading')}</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-[#001f3f]">{t('categories')}</h2>
        <div className="flex gap-2">
          <button
            onClick={() => setShowArchived(!showArchived)}
            className="flex items-center gap-2 text-gray-600 bg-white border border-gray-300 px-4 py-2 rounded-lg text-sm"
          >
            {showArchived ? <ArchiveRestore size={18} /> : <Archive size={18} />}
            {showArchived ? 'View Active' : 'View Archived'}
          </button>
          {!showArchived && isAdmin && (
            <button
              onClick={() => setShowModal(true)}
              className="flex items-center gap-2 bg-[#001f3f] text-white px-4 py-2 rounded-lg text-sm"
            >
              <Plus size={18} />
              {t('add_category')}
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {categories.map((cat) => (
          <div key={cat.id} className="bg-white p-4 rounded-lg shadow-sm border border-gray-100 flex justify-between items-center">
            <div>
              <div className="font-bold text-[#001f3f]">{i18n.language === 'fr' ? cat.name_fr : cat.name_en}</div>
              <div className="text-xs text-gray-400">{i18n.language === 'fr' ? cat.name_en : cat.name_fr}</div>
            </div>
            {isAdmin && (
              <div className="flex gap-2">
                {!showArchived ? (
                  <>
                    <button onClick={() => handleEdit(cat)} className="text-blue-600 hover:bg-blue-50 p-1 rounded"><Edit2 size={16} /></button>
                    <button onClick={() => handleDelete(cat.id)} className="text-orange-600 hover:bg-orange-50 p-1 rounded"><Archive size={16} /></button>
                  </>
                ) : (
                  <>
                    <button onClick={() => handleRestore(cat.id)} className="text-green-600 hover:bg-green-50 p-1 rounded"><RefreshCw size={16} /></button>
                    <button onClick={() => handleDelete(cat.id, true)} className="text-red-600 hover:bg-red-50 p-1 rounded"><Trash2 size={16} /></button>
                  </>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[60]">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-2xl">
            <h3 className="text-xl font-bold mb-4">{editingCategory ? t('edit_category') : t('add_category')}</h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Name (English)</label>
                <input required value={formData.name_en} onChange={e => setFormData({...formData, name_en: e.target.value})} className="w-full border rounded-lg px-3 py-2" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Nom (Français)</label>
                <input required value={formData.name_fr} onChange={e => setFormData({...formData, name_fr: e.target.value})} className="w-full border rounded-lg px-3 py-2" />
              </div>
              <div className="flex gap-2 pt-2">
                <button type="submit" className="flex-1 bg-[#001f3f] text-white py-2 rounded-lg font-bold">Save</button>
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 bg-gray-100 py-2 rounded-lg">Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
