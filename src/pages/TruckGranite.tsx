import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { 
  Truck, 
  Plus, 
  Edit, 
  Trash2, 
  Wrench, 
  CheckCircle, 
  TrendingUp, 
  X, 
  Eye,
  Map
} from 'lucide-react';
import { fetchApi } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { useSync } from '../contexts/SyncContext';
import { formatPrice } from '../utils/currency';
import { FleetMap } from '../components/FleetMap';

interface TruckType {
  id: string;
  plate_number: string;
  model: string;
  capacity: number;
  status: 'active' | 'maintenance' | 'inactive';
  is_archived?: boolean | number;
}

interface GraniteDelivery {
  id: string;
  date: string;
  truck_id: string;
  truck_plate?: string;
  truck_model?: string;
  driver_name: string;
  granite_type: string;
  empty_weight?: number;
  loaded_weight?: number;
  net_weight?: number;
  volume_m3?: number;
  quantity: number;
  unit_price: number;
  total_amount: number;
  client_name: string;
  status: 'pending' | 'delivered' | 'cancelled';
}

interface PartExpense {
  id: string;
  item_name: string;
  quantity_changed: number;
  timestamp: string;
  transaction_type: string;
  authorized_by_name: string | null;
  authorized_by_title: string | null;
  unit_price: number;
  total_cost: number;
}

interface InventoryItem {
  id: string;
  name: string;
  quantity: number;
  price: number;
  location: string;
}

export default function TruckGranite() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const { refreshStatus, triggerSync, isOnline } = useSync();
  const isFr = i18n.language.startsWith('fr');

  const [activeTab, setActiveTab] = useState<'fleet' | 'trips' | 'map'>('fleet');
  const [trucks, setTrucks] = useState<TruckType[]>([]);
  const [trips, setTrips] = useState<GraniteDelivery[]>([]);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Detail Modal slideover
  const [selectedTruck, setSelectedTruck] = useState<TruckType | null>(null);
  const [truckExpenses, setTruckExpenses] = useState<PartExpense[]>([]);
  const [loadingExpenses, setLoadingExpenses] = useState(false);

  // Form modals
  const [showTruckModal, setShowTruckModal] = useState(false);
  const [editingTruck, setEditingTruck] = useState<TruckType | null>(null);
  const [truckFormData, setTruckFormData] = useState({
    plate_number: '',
    model: '',
    capacity: '',
    status: 'active'
  });

  const [showTripModal, setShowTripModal] = useState(false);
  const [editingTrip, setEditingTrip] = useState<GraniteDelivery | null>(null);
  const [tripFormData, setTripFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    truck_id: '',
    driver_name: '',
    granite_type: '',
    empty_weight: '',
    loaded_weight: '',
    quantity: '',
    unit_price: '',
    client_name: '',
    status: 'delivered'
  });

  // Direct Maintenance modal
  const [showMaintenanceModal, setShowMaintenanceModal] = useState(false);
  const [maintenanceFormData, setMaintenanceFormData] = useState({
    inventory_item_id: '',
    quantity: '1',
    authorized_by_name: '',
    authorized_by_title: ''
  });

  const canEdit = user?.role === 'admin' || user?.role === 'audit_manager';

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async (showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      const [trucksData, tripsData, invData] = await Promise.all([
        fetchApi('/trucks'),
        fetchApi('/granite'),
        fetchApi('/inventory?limit=1000')
      ]);
      setTrucks(trucksData || []);
      setTrips(tripsData || []);
      setInventoryItems(invData?.items || []);
    } catch (error) {
      console.error('Error fetching Truck & Granite data:', error);
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  const fetchSelectedTruckExpenses = async (truckId: string) => {
    setLoadingExpenses(true);
    try {
      const expenses = await fetchApi(`/trucks/${truckId}/expenses`);
      setTruckExpenses(expenses || []);
    } catch (error) {
      console.error('Error fetching truck expenses:', error);
    } finally {
      setLoadingExpenses(false);
    }
  };

  // --- TRUCK FLEET CRUD ---

  const handleOpenTruckModal = (truck: TruckType | null = null) => {
    if (truck) {
      setEditingTruck(truck);
      setTruckFormData({
        plate_number: truck.plate_number,
        model: truck.model || '',
        capacity: truck.capacity ? String(truck.capacity) : '',
        status: truck.status
      });
    } else {
      setEditingTruck(null);
      setTruckFormData({
        plate_number: '',
        model: '',
        capacity: '',
        status: 'active'
      });
    }
    setShowTruckModal(true);
  };

  const handleTruckSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!truckFormData.plate_number.trim()) return;

    try {
      const payload = {
        ...truckFormData,
        capacity: truckFormData.capacity ? parseFloat(truckFormData.capacity) : 0
      };

      if (editingTruck) {
        await fetchApi(`/trucks/${editingTruck.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload)
        });
      } else {
        await fetchApi('/trucks', {
          method: 'POST',
          body: JSON.stringify(payload)
        });
      }

      setShowTruckModal(false);
      await fetchData(false);
      await refreshStatus();
      if (isOnline) triggerSync();
    } catch (error) {
      console.error('Error saving truck:', error);
      alert(t('error'));
    }
  };

  const handleArchiveTruck = async (id: string) => {
    if (!confirm(t('confirm_archive_truck') || 'Are you sure you want to archive this truck?')) return;
    try {
      await fetchApi(`/trucks/${id}`, { method: 'DELETE' });
      await fetchData(false);
      await refreshStatus();
      if (isOnline) triggerSync();
    } catch (error) {
      console.error('Error archiving truck:', error);
    }
  };

  // --- GRANITE TRIPS CRUD ---

  const handleOpenTripModal = (trip: GraniteDelivery | null = null) => {
    if (trip) {
      setEditingTrip(trip);
      setTripFormData({
        date: trip.date,
        truck_id: trip.truck_id,
        driver_name: trip.driver_name,
        granite_type: trip.granite_type,
        empty_weight: trip.empty_weight ? String(trip.empty_weight) : '',
        loaded_weight: trip.loaded_weight ? String(trip.loaded_weight) : '',
        quantity: String(trip.quantity),
        unit_price: String(trip.unit_price),
        client_name: trip.client_name || '',
        status: trip.status
      });
    } else {
      setEditingTrip(null);
      setTripFormData({
        date: new Date().toISOString().split('T')[0],
        truck_id: trucks[0]?.id || '',
        driver_name: '',
        granite_type: '',
        empty_weight: '',
        loaded_weight: '',
        quantity: '',
        unit_price: '',
        client_name: '',
        status: 'delivered'
      });
    }
    setShowTripModal(true);
  };

  const handleWeightChange = (field: 'empty_weight' | 'loaded_weight', value: string) => {
    const newFormData = { ...tripFormData, [field]: value };
    const empty = parseFloat(newFormData.empty_weight || '0');
    const loaded = parseFloat(newFormData.loaded_weight || '0');
    
    if (empty > 0 && loaded > 0 && loaded > empty) {
      const netWeight = loaded - empty;
      newFormData.quantity = netWeight.toFixed(2);
    }
    setTripFormData(newFormData);
  };

  const printDeliveryTicket = (trip: GraniteDelivery) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const truck = trucks.find(t => t.id === trip.truck_id) || { plate_number: trip.truck_plate || 'N/A' };
    const volume = trip.volume_m3 ? trip.volume_m3.toFixed(2) : (trip.quantity / 2.6).toFixed(2);

    printWindow.document.write(`
      <html>
        <head>
          <title>Bon de Livraison - ${trip.id}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; max-width: 800px; margin: 0 auto; }
            .header { text-align: center; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 20px; }
            .title { font-size: 24px; font-weight: bold; margin: 0; }
            .subtitle { font-size: 14px; color: #666; margin-top: 5px; }
            .row { display: flex; justify-content: space-between; margin-bottom: 10px; font-size: 16px; }
            .row strong { min-width: 150px; display: inline-block; }
            .section { margin-bottom: 20px; border: 1px solid #ddd; padding: 15px; border-radius: 8px; }
            .section-title { font-weight: bold; margin-bottom: 15px; font-size: 18px; border-bottom: 1px solid #eee; padding-bottom: 5px; }
            .footer { margin-top: 40px; display: flex; justify-content: space-between; }
            .signature { border-top: 1px solid #000; width: 200px; text-align: center; padding-top: 5px; }
          </style>
        </head>
        <body>
          <div class="header">
            <p class="title">BON DE LIVRAISON / DELIVERY TICKET</p>
            <p class="subtitle">ID: ${trip.id}</p>
          </div>
          
          <div class="section">
            <div class="row"><strong>Date:</strong> <span>${new Date(trip.date).toLocaleDateString()}</span></div>
            <div class="row"><strong>Client:</strong> <span>${trip.client_name || 'N/A'}</span></div>
            <div class="row"><strong>Transporteur (Camion):</strong> <span>${truck.plate_number}</span></div>
            <div class="row"><strong>Chauffeur:</strong> <span>${trip.driver_name}</span></div>
            <div class="row"><strong>Type de Granite:</strong> <span>${trip.granite_type}</span></div>
          </div>
          
          <div class="section">
            <div class="section-title">Détails de Pesée (Pont Bascule)</div>
            <div class="row"><strong>Poids à vide (Tare):</strong> <span>${trip.empty_weight ? trip.empty_weight + ' Tonnes' : 'N/A'}</span></div>
            <div class="row"><strong>Poids chargé (Brut):</strong> <span>${trip.loaded_weight ? trip.loaded_weight + ' Tonnes' : 'N/A'}</span></div>
            <div class="row"><strong>Poids net (Quantité):</strong> <span>${trip.quantity} Tonnes</span></div>
            <div class="row"><strong>Volume estimé:</strong> <span>${volume} m³</span></div>
          </div>
          
          <div class="footer">
            <div class="signature">Visa Pesée / Expédition</div>
            <div class="signature">Visa Chauffeur</div>
            <div class="signature">Visa Client / Réception</div>
          </div>
          
          <script>
            window.onload = function() { window.print(); window.close(); }
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const handleTripSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const { date, truck_id, driver_name, granite_type, empty_weight, loaded_weight, quantity, unit_price } = tripFormData;
    if (!date || !truck_id || !driver_name || !granite_type || !quantity || !unit_price) {
      alert(t('please_add_items') || 'Please fill in all required fields');
      return;
    }

    const net_weight = parseFloat(quantity);
    const volume_m3 = net_weight / 2.6; // Assuming density 2.6 t/m3

    try {
      const payload = {
        ...tripFormData,
        empty_weight: empty_weight ? parseFloat(empty_weight) : null,
        loaded_weight: loaded_weight ? parseFloat(loaded_weight) : null,
        net_weight: net_weight,
        volume_m3: volume_m3,
        quantity: net_weight,
        unit_price: parseFloat(unit_price)
      };

      if (editingTrip) {
        await fetchApi(`/granite/${editingTrip.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload)
        });
      } else {
        await fetchApi('/granite', {
          method: 'POST',
          body: JSON.stringify(payload)
        });
      }

      setShowTripModal(false);
      await fetchData(false);
      await refreshStatus();
      if (isOnline) triggerSync();
    } catch (error) {
      console.error('Error saving granite trip:', error);
      alert(t('error'));
    }
  };

  const handleDeleteTrip = async (id: string) => {
    if (!confirm(t('confirm_delete_trip') || 'Are you sure you want to delete this trip?')) return;
    try {
      await fetchApi(`/granite/${id}`, { method: 'DELETE' });
      await fetchData(false);
      await refreshStatus();
      if (isOnline) triggerSync();
    } catch (error) {
      console.error('Error deleting trip:', error);
    }
  };

  // --- SPARE PARTS MAINTENANCE DEDUCTION ---

  const handleMaintenanceSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTruck) return;
    const { inventory_item_id, quantity, authorized_by_name, authorized_by_title } = maintenanceFormData;

    if (!inventory_item_id || !quantity || !authorized_by_name || !authorized_by_title) {
      alert(t('name_title_truck_required'));
      return;
    }

    const item = inventoryItems.find(i => i.id === inventory_item_id);
    if (!item) return;

    if (item.quantity < parseInt(quantity)) {
      alert(t('error') + ': Insufficient stock available.');
      return;
    }

    try {
      const payload = {
        quantity: parseInt(quantity),
        authorized_by_name,
        authorized_by_title,
        truck_id: selectedTruck.plate_number, // Link by plate number!
        notes: `Direct maintenance deduction logged under Trucks fleet system for ${selectedTruck.plate_number}`
      };

      await fetchApi(`/inventory/${inventory_item_id}/consume`, {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      setShowMaintenanceModal(false);
      setMaintenanceFormData({
        inventory_item_id: '',
        quantity: '1',
        authorized_by_name: '',
        authorized_by_title: ''
      });

      // Refresh list, stock items, and the sliding panel
      await fetchData(false);
      await fetchSelectedTruckExpenses(selectedTruck.id);
      alert(t('maintenance_recorded_success'));
    } catch (error) {
      console.error('Error recording maintenance parts deduction:', error);
      alert(t('error'));
    }
  };

  // --- ANALYTICS AND CALCULATIONS ---

  const calculateTruckMetrics = (truck: TruckType) => {
    const truckTrips = trips.filter(trip => trip.truck_id === truck.id && trip.status === 'delivered');
    const totalRevenue = truckTrips.reduce((acc, trip) => acc + trip.total_amount, 0);
    const tonsHauled = truckTrips.reduce((acc, trip) => acc + trip.quantity, 0);

    return {
      tripsCount: truckTrips.length,
      totalRevenue,
      tonsHauled
    };
  };

  const getOverallMetrics = () => {
    const deliveredTrips = trips.filter(t => t.status === 'delivered');
    const totalRevenue = deliveredTrips.reduce((acc, t) => acc + t.total_amount, 0);
    const totalTons = deliveredTrips.reduce((acc, t) => acc + t.quantity, 0);
    const avgPricePerTon = totalTons > 0 ? totalRevenue / totalTons : 0;

    return {
      totalRevenue,
      totalTons,
      avgPricePerTon,
      tripsCount: deliveredTrips.length
    };
  };

  const overall = getOverallMetrics();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="bg-navy bg-opacity-10 p-2.5 rounded-lg text-navy">
            <Truck className="w-8 h-8" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-navy">{t('fleet')}</h1>
            <p className="text-sm text-gray-500">{t('supplier_performance_analytics')}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {canEdit && activeTab === 'fleet' && (
            <button
              onClick={() => handleOpenTruckModal()}
              className="flex items-center gap-2 bg-[#001f3f] text-white px-4 py-2 rounded-lg hover:bg-[#003366] transition-colors shadow-sm"
            >
              <Plus className="w-5 h-5" />
              {t('add_truck')}
            </button>
          )}
          {canEdit && activeTab === 'trips' && (
            <button
              onClick={() => handleOpenTripModal()}
              className="flex items-center gap-2 bg-[#001f3f] text-white px-4 py-2 rounded-lg hover:bg-[#003366] transition-colors shadow-sm"
            >
              <Plus className="w-5 h-5" />
              {t('add_delivery')}
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200">
        <button
          onClick={() => setActiveTab('fleet')}
          className={`py-3 px-6 text-sm font-semibold border-b-2 transition-all ${
            activeTab === 'fleet'
              ? 'border-navy text-navy font-bold'
              : 'border-transparent text-gray-500 hover:text-navy'
          }`}
        >
          {t('trucks')} ({trucks.length})
        </button>
        <button
          onClick={() => setActiveTab('trips')}
          className={`py-3 px-6 text-sm font-semibold border-b-2 transition-all ${
            activeTab === 'trips'
              ? 'border-navy text-navy font-bold'
              : 'border-transparent text-gray-500 hover:text-navy'
          }`}
        >
          {t('granite_deliveries')} ({trips.length})
        </button>
        <button
          onClick={() => setActiveTab('map')}
          className={`py-3 px-6 text-sm font-semibold border-b-2 transition-all flex items-center gap-2 ${
            activeTab === 'map'
              ? 'border-navy text-navy font-bold font-extrabold'
              : 'border-transparent text-gray-500 hover:text-navy'
          }`}
        >
          <Map className="w-4 h-4" />
          <span>{t('fleet_ai_tracking') || 'Carte GPS'}</span>
        </button>
      </div>

      {/* Main Content */}
      {loading ? (
        <div className="text-center py-12 text-gray-500 font-semibold">{t('loading')}</div>
      ) : activeTab === 'map' ? (
        <div className="bg-white rounded-2xl p-6 shadow-md border border-slate-100">
          <FleetMap />
        </div>
      ) : activeTab === 'fleet' ? (
        // FLEET PANEL
        <div className="space-y-6">
          {/* Fleet Statistics Summary */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white rounded-xl shadow-md border border-gray-100 p-6 flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">{t('active_status')}</p>
                <p className="text-3xl font-extrabold text-navy mt-1">
                  {trucks.filter(t => t.status === 'active').length}
                </p>
              </div>
              <div className="bg-emerald-100 p-3 rounded-full text-emerald-600">
                <CheckCircle className="w-6 h-6" />
              </div>
            </div>
            <div className="bg-white rounded-xl shadow-md border border-gray-100 p-6 flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">{t('maintenance_status')}</p>
                <p className="text-3xl font-extrabold text-yellow-600 mt-1">
                  {trucks.filter(t => t.status === 'maintenance').length}
                </p>
              </div>
              <div className="bg-yellow-100 p-3 rounded-full text-yellow-600">
                <Wrench className="w-6 h-6 animate-pulse" />
              </div>
            </div>
            <div className="bg-white rounded-xl shadow-md border border-gray-100 p-6 flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">{t('hauling_revenue')}</p>
                <p className="text-2xl font-extrabold text-emerald-600 mt-1">
                  {formatPrice(overall.totalRevenue)}
                </p>
              </div>
              <div className="bg-emerald-50 p-3 rounded-full text-white">
                <TrendingUp className="w-6 h-6" />
              </div>
            </div>
          </div>

          {/* Trucks Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {trucks.map((truck) => {
              const metrics = calculateTruckMetrics(truck);
              const statusColors = {
                active: 'bg-emerald-100 text-emerald-800 border-emerald-200',
                maintenance: 'bg-yellow-100 text-yellow-800 border-yellow-200',
                inactive: 'bg-gray-100 text-gray-800 border-gray-200'
              };

              return (
                <div
                  key={truck.id}
                  className="bg-white border border-gray-200 rounded-xl shadow-sm hover:shadow-md transition-all overflow-hidden flex flex-col justify-between"
                >
                  <div className="p-6">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center space-x-3">
                        <div className="bg-blue-50 p-2.5 rounded-lg text-blue-600">
                          <Truck className="w-6 h-6" />
                        </div>
                        <div>
                          <h3 className="text-xl font-bold text-gray-800">{truck.plate_number}</h3>
                          <p className="text-xs text-gray-500">{truck.model || t('na')}</p>
                        </div>
                      </div>
                      <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${statusColors[truck.status]}`}>
                        {t(`${truck.status}_status`)}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-4 mt-6 border-t pt-4">
                      <div>
                        <span className="text-[10px] uppercase font-bold text-gray-400">{t('capacity')}</span>
                        <p className="text-sm font-semibold text-gray-800">{truck.capacity} {t('tons')}</p>
                      </div>
                      <div>
                        <span className="text-[10px] uppercase font-bold text-gray-400">{t('usage_summary')}</span>
                        <p className="text-sm font-semibold text-gray-800">{metrics.tripsCount} {t('usage_events', 'Trips')}</p>
                      </div>
                    </div>
                  </div>

                  <div className="bg-gray-50 px-6 py-3 border-t flex items-center justify-between">
                    <button
                      onClick={() => {
                        setSelectedTruck(truck);
                        fetchSelectedTruckExpenses(truck.id);
                      }}
                      className="text-navy text-xs font-bold flex items-center hover:underline"
                    >
                      <Eye className="w-4 h-4 mr-1.5" />
                      {t('view') || 'View Details'}
                    </button>
                    {canEdit && (
                      <div className="flex space-x-3">
                        <button
                          onClick={() => handleOpenTruckModal(truck)}
                          className="text-blue-600 hover:text-blue-800"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleArchiveTruck(truck.id)}
                          className="text-orange-600 hover:text-orange-800"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {trucks.length === 0 && (
            <div className="text-center py-12 text-gray-500 font-semibold bg-white border rounded-xl">
              {t('no_data')}
            </div>
          )}
        </div>
      ) : (
        // GRANITE TRIPS PANEL
        <div className="space-y-6">
          {/* Stats Header */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 bg-white border rounded-xl p-6 shadow-sm">
            <div>
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">{t('usage_summary')}</span>
              <p className="text-2xl font-black text-navy mt-1">{overall.tripsCount} trips</p>
            </div>
            <div>
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">{t('total_volume')}</span>
              <p className="text-2xl font-black text-navy mt-1">{overall.totalTons.toLocaleString()} {t('tons')}</p>
            </div>
            <div>
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">{t('hauling_revenue')}</span>
              <p className="text-2xl font-black text-emerald-600 mt-1">{formatPrice(overall.totalRevenue)}</p>
            </div>
            <div>
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">{t('unit_price_ton')} (Avg)</span>
              <p className="text-2xl font-black text-blue-600 mt-1">{formatPrice(overall.avgPricePerTon)}</p>
            </div>
          </div>

          {/* Trips List */}
          <div className="bg-white rounded-xl shadow-md border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr className="border-b text-left">
                    <th className="py-3.5 px-4 text-xs font-bold uppercase text-gray-500">{t('date')}</th>
                    <th className="py-3.5 px-4 text-xs font-bold uppercase text-gray-500">{t('truck')}</th>
                    <th className="py-3.5 px-4 text-xs font-bold uppercase text-gray-500">{t('driver')}</th>
                    <th className="py-3.5 px-4 text-xs font-bold uppercase text-gray-500">{t('granite_type')}</th>
                    <th className="py-3.5 px-4 text-xs font-bold uppercase text-gray-500 text-right">{t('tons')}</th>
                    <th className="py-3.5 px-4 text-xs font-bold uppercase text-gray-500 text-right">{t('unit_price_label')}</th>
                    <th className="py-3.5 px-4 text-xs font-bold uppercase text-gray-500 text-right">{t('trip_revenue')}</th>
                    <th className="py-3.5 px-4 text-xs font-bold uppercase text-gray-500">{t('client')}</th>
                    <th className="py-3.5 px-4 text-xs font-bold uppercase text-gray-500">{t('status')}</th>
                    {canEdit && <th className="py-3.5 px-4 text-xs font-bold uppercase text-gray-500">{t('actions')}</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-150">
                  {trips.map((trip) => (
                    <tr key={trip.id} className="hover:bg-gray-50/50">
                      <td className="py-3 px-4 text-sm font-medium text-gray-800">
                        {new Date(trip.date).toLocaleDateString(isFr ? 'fr-FR' : 'en-US')}
                      </td>
                      <td className="py-3 px-4 text-sm">
                        <span className="font-semibold text-navy">{trip.truck_plate || 'Unknown'}</span>
                        {trip.truck_model && <span className="text-xs text-gray-500 block">{trip.truck_model}</span>}
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-700">{trip.driver_name}</td>
                      <td className="py-3 px-4 text-sm">
                        <span className="bg-gray-100 text-gray-800 text-xs px-2 py-0.5 rounded-full font-medium">
                          {trip.granite_type}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-sm text-right font-semibold">
                        {trip.quantity} <br/>
                        {trip.volume_m3 && <span className="text-xs text-gray-400 font-normal">{trip.volume_m3.toFixed(2)} m³</span>}
                      </td>
                      <td className="py-3 px-4 text-sm text-right text-gray-600">{formatPrice(trip.unit_price)}</td>
                      <td className="py-3 px-4 text-sm text-right font-bold text-emerald-600">{formatPrice(trip.total_amount)}</td>
                      <td className="py-3 px-4 text-sm text-gray-600">{trip.client_name || t('na')}</td>
                      <td className="py-3 px-4 text-sm">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          trip.status === 'delivered'
                            ? 'bg-emerald-100 text-emerald-800'
                            : trip.status === 'pending'
                            ? 'bg-yellow-100 text-yellow-800'
                            : 'bg-red-100 text-red-800'
                        }`}>
                          {t(trip.status)}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-sm">
                        <div className="flex space-x-3">
                          <button
                            onClick={() => printDeliveryTicket(trip)}
                            title={t('print_ticket')}
                            className="text-gray-600 hover:text-gray-800"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>
                          </button>
                          {canEdit && (
                            <>
                              <button
                                onClick={() => handleOpenTripModal(trip)}
                                className="text-blue-600 hover:text-blue-800"
                              >
                                <Edit className="w-4.5 h-4.5" />
                              </button>
                              <button
                                onClick={() => handleDeleteTrip(trip.id)}
                                className="text-red-600 hover:text-red-800"
                              >
                                <Trash2 className="w-4.5 h-4.5" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}

                  {trips.length === 0 && (
                    <tr>
                      <td colSpan={10} className="py-12 text-center text-gray-500 font-semibold">
                        {t('no_data')}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* --- SLIDEOVER / DRAWER FOR TRUCK DETAILS & STOCK LINK --- */}
      {selectedTruck && (
        <div className="fixed inset-0 overflow-hidden z-50">
          <div className="absolute inset-0 overflow-hidden">
            {/* Backdrop */}
            <div 
              className="absolute inset-0 bg-black bg-opacity-50 transition-opacity" 
              onClick={() => setSelectedTruck(null)} 
            />

            <div className="pointer-events-none fixed inset-y-0 right-0 flex max-w-full pl-10">
              <div className="pointer-events-auto w-screen max-w-2xl transform bg-white shadow-xl transition-all">
                <div className="flex h-full flex-col overflow-y-scroll bg-white">
                  {/* Header */}
                  <div className="bg-navy px-6 py-6 text-white flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <Truck className="w-7 h-7" />
                      <div>
                        <h2 className="text-xl font-bold">{selectedTruck.plate_number}</h2>
                        <p className="text-xs text-blue-200">{selectedTruck.model || 'No model specified'}</p>
                      </div>
                    </div>
                    <button 
                      onClick={() => setSelectedTruck(null)} 
                      className="text-white hover:text-blue-100 rounded-full p-1"
                    >
                      <X className="w-6 h-6" />
                    </button>
                  </div>

                  {/* Summary operational dashboard */}
                  <div className="p-6 bg-gray-50 border-b border-gray-200">
                    <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-3">
                      {t('performance') || 'OPERATIONAL LEDGER'}
                    </h3>
                    <div className="grid grid-cols-3 gap-4">
                      <div className="bg-white p-4 rounded-lg border shadow-sm">
                        <span className="text-[10px] font-bold text-gray-400 uppercase">{t('hauling_revenue')}</span>
                        <p className="text-lg font-black text-emerald-600 mt-1">
                          {formatPrice(calculateTruckMetrics(selectedTruck).totalRevenue)}
                        </p>
                      </div>
                      <div className="bg-white p-4 rounded-lg border shadow-sm">
                        <span className="text-[10px] font-bold text-gray-400 uppercase">{t('maintenance_expense')}</span>
                        <p className="text-lg font-black text-red-500 mt-1">
                          {formatPrice(truckExpenses.reduce((acc, exp) => acc + exp.total_cost, 0))}
                        </p>
                      </div>
                      <div className="bg-white p-4 rounded-lg border shadow-sm">
                        <span className="text-[10px] font-bold text-gray-400 uppercase">{t('net_income')}</span>
                        <p className="text-lg font-black text-blue-600 mt-1">
                          {formatPrice(
                            calculateTruckMetrics(selectedTruck).totalRevenue - 
                            truckExpenses.reduce((acc, exp) => acc + exp.total_cost, 0)
                          )}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Parts history list */}
                  <div className="flex-1 p-6 space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-base font-bold text-navy flex items-center">
                        <Wrench className="w-5 h-5 mr-2 text-navy" />
                        {t('parts_consumed_title')}
                      </h3>
                      {canEdit && (
                        <button
                          onClick={() => setShowMaintenanceModal(true)}
                          className="text-xs bg-indigo-600 text-white font-semibold py-1.5 px-3 rounded hover:bg-indigo-700 transition"
                        >
                          {t('record_part_maintenance_btn')}
                        </button>
                      )}
                    </div>

                    {loadingExpenses ? (
                      <div className="text-center py-8 text-gray-500">{t('loading')}</div>
                    ) : truckExpenses.length === 0 ? (
                      <div className="text-center py-12 border border-dashed rounded-lg bg-gray-50/50 text-gray-400 font-medium">
                        {t('no_parts_consumed')}
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {truckExpenses.map((exp) => (
                          <div 
                            key={exp.id} 
                            className="bg-white border rounded-lg p-4 shadow-sm hover:shadow transition"
                          >
                            <div className="flex justify-between items-start">
                              <div>
                                <h4 className="font-bold text-gray-800 text-sm">{exp.item_name}</h4>
                                <p className="text-xs text-gray-500 mt-0.5">
                                  {new Date(exp.timestamp).toLocaleString(isFr ? 'fr-FR' : 'en-US')}
                                </p>
                              </div>
                              <span className="text-sm font-bold text-navy">
                                - {formatPrice(exp.total_cost)}
                              </span>
                            </div>
                            <div className="flex items-center justify-between text-xs text-gray-500 mt-3 pt-2.5 border-t border-gray-100">
                              <span>Qty: <strong className="text-gray-700 font-semibold">{exp.quantity_changed} units</strong></span>
                              {exp.authorized_by_name && (
                                <span>{t('approved_by')}: <strong className="text-gray-700 font-semibold">{exp.authorized_by_name} ({exp.authorized_by_title})</strong></span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- ADD/EDIT TRUCK FLEET MODAL --- */}
      {showTruckModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-2xl">
            <h2 className="text-2xl font-bold text-navy mb-4">
              {editingTruck ? t('edit_truck') : t('add_truck')}
            </h2>
            <form onSubmit={handleTruckSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('plate_number')} *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. TRK-001 or AB-1234"
                  value={truckFormData.plate_number}
                  onChange={(e) => setTruckFormData({ ...truckFormData, plate_number: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-navy focus:border-transparent outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('model')}</label>
                <input
                  type="text"
                  placeholder="e.g. Volvo FMX, Scania R500"
                  value={truckFormData.model}
                  onChange={(e) => setTruckFormData({ ...truckFormData, model: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-navy focus:border-transparent outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('capacity')}</label>
                <input
                  type="number"
                  step="0.1"
                  placeholder="e.g. 20"
                  value={truckFormData.capacity}
                  onChange={(e) => setTruckFormData({ ...truckFormData, capacity: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-navy focus:border-transparent outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('truck_status')}</label>
                <select
                  value={truckFormData.status}
                  onChange={(e) => setTruckFormData({ ...truckFormData, status: e.target.value as any })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-navy focus:border-transparent outline-none"
                >
                  <option value="active">{t('active_status')}</option>
                  <option value="maintenance">{t('maintenance_status')}</option>
                  <option value="inactive">{t('inactive_status')}</option>
                </select>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="submit"
                  className="flex-1 bg-navy text-white py-2 rounded-lg hover:bg-opacity-95 font-bold transition shadow-sm"
                >
                  {editingTruck ? t('update') : t('create')}
                </button>
                <button
                  type="button"
                  onClick={() => setShowTruckModal(false)}
                  className="flex-1 bg-gray-100 text-gray-700 py-2 rounded-lg hover:bg-gray-200 font-bold transition border"
                >
                  {t('cancel')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- LOG/EDIT GRANITE TRIP MODAL --- */}
      {showTripModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-2xl overflow-y-auto max-h-[90vh]">
            <h2 className="text-2xl font-bold text-navy mb-4">
              {editingTrip ? t('edit_delivery') : t('add_delivery')}
            </h2>
            <form onSubmit={handleTripSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('date')} *</label>
                <input
                  type="date"
                  required
                  value={tripFormData.date}
                  onChange={(e) => setTripFormData({ ...tripFormData, date: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-navy focus:border-transparent outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('truck')} *</label>
                <select
                  required
                  value={tripFormData.truck_id}
                  onChange={(e) => setTripFormData({ ...tripFormData, truck_id: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-navy focus:border-transparent outline-none"
                >
                  <option value="" disabled>{t('select_truck')}</option>
                  {trucks.filter(t => t.status === 'active').map(t => (
                    <option key={t.id} value={t.id}>{t.plate_number}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('driver')} *</label>
                <input
                  type="text"
                  required
                  placeholder="Driver's Full Name"
                  value={tripFormData.driver_name}
                  onChange={(e) => setTripFormData({ ...tripFormData, driver_name: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-navy focus:border-transparent outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('granite_type')} *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Coarse Red, Fine Grey, 0/20"
                  value={tripFormData.granite_type}
                  onChange={(e) => setTripFormData({ ...tripFormData, granite_type: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-navy focus:border-transparent outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('tare_weight')} (Tonnes)</label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="e.g. 12.5"
                    value={tripFormData.empty_weight}
                    onChange={(e) => handleWeightChange('empty_weight', e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-navy focus:border-transparent outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('gross_weight')} (Tonnes)</label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="e.g. 32.5"
                    value={tripFormData.loaded_weight}
                    onChange={(e) => handleWeightChange('loaded_weight', e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-navy focus:border-transparent outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('net_weight_tons')} *</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    placeholder="e.g. 20"
                    value={tripFormData.quantity}
                    onChange={(e) => setTripFormData({ ...tripFormData, quantity: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-navy focus:border-transparent outline-none bg-gray-50"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('unit_price_ton')} *</label>
                  <input
                    type="number"
                    required
                    placeholder="GNF"
                    value={tripFormData.unit_price}
                    onChange={(e) => setTripFormData({ ...tripFormData, unit_price: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-navy focus:border-transparent outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('client')}</label>
                <input
                  type="text"
                  placeholder="Client Name"
                  value={tripFormData.client_name}
                  onChange={(e) => setTripFormData({ ...tripFormData, client_name: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-navy focus:border-transparent outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('status')}</label>
                <select
                  value={tripFormData.status}
                  onChange={(e) => setTripFormData({ ...tripFormData, status: e.target.value as any })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-navy focus:border-transparent outline-none"
                >
                  <option value="delivered">{t('delivered')}</option>
                  <option value="pending">{t('pending')}</option>
                  <option value="cancelled">{t('cancelled')}</option>
                </select>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="submit"
                  className="flex-1 bg-navy text-white py-2 rounded-lg hover:bg-opacity-95 font-bold transition shadow-sm"
                >
                  {editingTrip ? t('update') : t('create')}
                </button>
                <button
                  type="button"
                  onClick={() => setShowTripModal(false)}
                  className="flex-1 bg-gray-100 text-gray-700 py-2 rounded-lg hover:bg-gray-200 font-bold transition border"
                >
                  {t('cancel')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- DIRECT SPARE PART MAINTENANCE CONSUMPTION MODAL --- */}
      {showMaintenanceModal && selectedTruck && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-2xl">
            <h2 className="text-xl font-bold text-navy mb-4">
              {t('record_part_maintenance_btn')} — {selectedTruck.plate_number}
            </h2>
            <form onSubmit={handleMaintenanceSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Select Product / Spare Part *
                </label>
                <select
                  required
                  value={maintenanceFormData.inventory_item_id}
                  onChange={(e) => setMaintenanceFormData({ ...maintenanceFormData, inventory_item_id: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-navy focus:border-transparent outline-none text-sm"
                >
                  <option value="" disabled>-- Select Spare Part --</option>
                  {inventoryItems.filter(i => i.quantity > 0).map(i => (
                    <option key={i.id} value={i.id}>
                      {i.name} (Stock: {i.quantity} units, Cost: {formatPrice(i.price)})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('quantity_used')} *</label>
                <input
                  type="number"
                  min="1"
                  required
                  value={maintenanceFormData.quantity}
                  onChange={(e) => setMaintenanceFormData({ ...maintenanceFormData, quantity: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-navy focus:border-transparent outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('authorized_by_name')} *</label>
                  <input
                    type="text"
                    required
                    placeholder="Manager Name"
                    value={maintenanceFormData.authorized_by_name}
                    onChange={(e) => setMaintenanceFormData({ ...maintenanceFormData, authorized_by_name: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-navy focus:border-transparent outline-none text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('authorized_by_title')} *</label>
                  <input
                    type="text"
                    required
                    placeholder="Manager Title"
                    value={maintenanceFormData.authorized_by_title}
                    onChange={(e) => setMaintenanceFormData({ ...maintenanceFormData, authorized_by_title: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-navy focus:border-transparent outline-none text-sm"
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="submit"
                  className="flex-1 bg-indigo-600 text-white py-2 rounded-lg hover:bg-indigo-700 font-bold transition shadow-sm"
                >
                  {t('confirm_usage')}
                </button>
                <button
                  type="button"
                  onClick={() => setShowMaintenanceModal(false)}
                  className="flex-1 bg-gray-100 text-gray-700 py-2 rounded-lg hover:bg-gray-200 font-bold transition border"
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
