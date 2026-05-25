import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { fetchApi } from '../lib/api';
import { MapPin, Navigation, Calendar, Info, ShieldAlert } from 'lucide-react';

interface Truck {
  id: string;
  plate_number: string;
  model: string;
  capacity: number;
  status: 'active' | 'maintenance' | 'inactive';
  latitude: number | null;
  longitude: number | null;
  last_location_update: string | null;
}

// Map center modifier helper
const ChangeView = ({ center, zoom }: { center: [number, number]; zoom: number }) => {
  const map = useMap();
  useEffect(() => {
    map.setView(center, zoom);
  }, [center, zoom, map]);
  return null;
};

// Beautiful custom DivIcon creation for the trucks
const createTruckIcon = (status: 'active' | 'maintenance' | 'inactive') => {
  const colorMap = {
    active: '#10B981',      // Emerald Green
    maintenance: '#F59E0B', // Amber
    inactive: '#EF4444'     // Rose Red
  };
  const color = colorMap[status] || '#6B7280';

  return L.divIcon({
    className: 'custom-truck-marker',
    html: `
      <div style="
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 42px;
        height: 42px;
        background: rgba(255, 255, 255, 0.95);
        border: 2px solid ${color};
        border-radius: 50%;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        transition: all 0.3s ease;
      ">
        <span style="font-size: 20px;">🚚</span>
        <div style="
          position: absolute;
          bottom: 0px;
          right: 0px;
          width: 13px;
          height: 13px;
          background: ${color};
          border: 2.5px solid #ffffff;
          border-radius: 50%;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
        "></div>
      </div>
    `,
    iconSize: [42, 42],
    iconAnchor: [21, 21],
    popupAnchor: [0, -21]
  });
};

export const FleetMap: React.FC = () => {
  const [mapCenter, setMapCenter] = useState<[number, number]>([9.509167, -13.712222]); // Default Conakry
  const [zoom, setZoom] = useState(13);
  const [trucks, setTrucks] = useState<Truck[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTruck, setSelectedTruck] = useState<Truck | null>(null);

  useEffect(() => {
    // 1. Fetch map center set in settings
    fetchApi('/settings')
      .then(settings => {
        if (settings) {
          const lat = parseFloat(settings.default_map_lat);
          const lng = parseFloat(settings.default_map_lng);
          if (!isNaN(lat) && !isNaN(lng)) {
            setMapCenter([lat, lng]);
          }
        }
      })
      .catch(err => console.error('[FleetMap] Settings load error:', err));

    // 2. Fetch trucks periodically for live simulation updates
    const fetchTrucksData = () => {
      fetchApi('/trucks')
        .then(data => {
          if (Array.isArray(data)) {
            setTrucks(data);
          }
          setLoading(false);
        })
        .catch(err => {
          console.error('[FleetMap] Trucks load error:', err);
          setLoading(false);
        });
    };

    fetchTrucksData();
    const interval = setInterval(fetchTrucksData, 10000); // 10s auto-refresh
    return () => clearInterval(interval);
  }, []);

  const trucksWithGps = trucks.filter(t => t.latitude !== null && t.longitude !== null);
  const trucksWithoutGps = trucks.filter(t => t.latitude === null || t.longitude === null);

  const focusTruckOnMap = (truck: Truck) => {
    if (truck.latitude !== null && truck.longitude !== null) {
      setMapCenter([truck.latitude, truck.longitude]);
      setZoom(15);
      setSelectedTruck(truck);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-[550px] bg-slate-50 border border-slate-200/60 rounded-2xl">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-navy"></div>
        <p className="mt-4 text-slate-500 font-medium">Chargement de la carte de la flotte...</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 h-[600px]">
      {/* Sidebar - Trucks list */}
      <div className="lg:col-span-1 bg-white border border-slate-100 rounded-2xl shadow-sm p-4 flex flex-col h-full overflow-hidden">
        <h3 className="text-slate-800 font-bold text-lg mb-3 flex items-center gap-2">
          <Navigation className="w-5 h-5 text-navy" />
          <span>Suivi de la Flotte</span>
        </h3>
        
        <div className="flex-1 overflow-y-auto space-y-3 pr-1">
          {/* Active / Tracked Section */}
          <div>
            <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
              Véhicules en Ligne ({trucksWithGps.length})
            </h4>
            {trucksWithGps.length === 0 ? (
              <p className="text-xs text-slate-400 italic py-1">Aucun camion en ligne</p>
            ) : (
              trucksWithGps.map(truck => {
                const statusColor = 
                  truck.status === 'active' ? 'bg-emerald-500' :
                  truck.status === 'maintenance' ? 'bg-amber-500' : 'bg-red-500';
                return (
                  <button
                    key={truck.id}
                    onClick={() => focusTruckOnMap(truck)}
                    className={`w-full text-left p-3 rounded-xl border mb-2 transition flex flex-col gap-1 hover:border-navy/30 hover:bg-slate-50/80 ${
                      selectedTruck?.id === truck.id ? 'border-navy bg-blue-50/20' : 'border-slate-100'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-700">{truck.plate_number}</span>
                      <span className={`w-2.5 h-2.5 rounded-full ${statusColor}`} />
                    </div>
                    <span className="text-xs text-slate-500">{truck.model || 'Modèle inconnu'}</span>
                    {truck.last_location_update && (
                      <span className="text-[10px] text-slate-400 font-mono flex items-center gap-1 mt-1">
                        <Calendar className="w-3 h-3" />
                        {new Date(truck.last_location_update).toLocaleTimeString()}
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </div>

          {/* Offline Section */}
          {trucksWithoutGps.length > 0 && (
            <div className="pt-2 border-t border-slate-100">
              <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1">
                <ShieldAlert className="w-3.5 h-3.5 text-amber-500" />
                <span>Hors Ligne ({trucksWithoutGps.length})</span>
              </h4>
              {trucksWithoutGps.map(truck => (
                <div key={truck.id} className="p-3 border border-slate-100/70 rounded-xl opacity-60 flex justify-between items-center bg-slate-50/50 mb-2">
                  <div className="flex flex-col">
                    <span className="font-semibold text-slate-600 text-sm">{truck.plate_number}</span>
                    <span className="text-[10px] text-slate-400">{truck.model || 'Modèle inconnu'}</span>
                  </div>
                  <span className="text-[10px] bg-slate-200 text-slate-500 px-2 py-0.5 rounded-full font-medium">Inactif</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Map view */}
      <div className="lg:col-span-3 h-full relative border border-slate-100 rounded-2xl overflow-hidden shadow-sm">
        <MapContainer
          center={mapCenter}
          zoom={zoom}
          style={{ width: '100%', height: '100%' }}
          zoomControl={true}
        >
          <ChangeView center={mapCenter} zoom={zoom} />
          
          {/* Beautiful sleek corporate cartography map layer */}
          <TileLayer
            attribution='&copy; <a href="https://carto.com/attributions">CARTO</a>'
            url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
          />

          {trucksWithGps.map(truck => (
            <Marker
              key={truck.id}
              position={[truck.latitude!, truck.longitude!]}
              icon={createTruckIcon(truck.status)}
              eventHandlers={{
                click: () => {
                  setSelectedTruck(truck);
                }
              }}
            >
              <Popup className="custom-leaflet-popup">
                <div className="p-2 space-y-2 min-w-[200px]">
                  <div className="flex items-center justify-between border-b pb-1">
                    <span className="font-extrabold text-slate-800 text-base">{truck.plate_number}</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                      truck.status === 'active' ? 'bg-emerald-50 text-emerald-600' :
                      truck.status === 'maintenance' ? 'bg-amber-50 text-amber-600' : 'bg-rose-50 text-rose-600'
                    }`}>
                      {truck.status === 'active' ? 'En Service' : truck.status === 'maintenance' ? 'Maintenance' : 'Inactif'}
                    </span>
                  </div>

                  <div className="text-xs space-y-1.5 text-slate-600">
                    <div className="flex items-center gap-1.5">
                      <Info className="w-3.5 h-3.5 text-slate-400" />
                      <span>{truck.model || 'Modèle de camion classique'}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Navigation className="w-3.5 h-3.5 text-slate-400" />
                      <span>Capacité: <strong>{truck.capacity} T</strong></span>
                    </div>
                    {truck.last_location_update && (
                      <div className="flex items-start gap-1.5 pt-1 border-t mt-1">
                        <MapPin className="w-3.5 h-3.5 text-navy flex-shrink-0 mt-0.5" />
                        <div className="flex flex-col">
                          <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Dernière mise à jour</span>
                          <span className="font-mono text-slate-500">{new Date(truck.last_location_update).toLocaleString()}</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>
    </div>
  );
};
