import db from '../database.js';

let intervalId = null;

export function startGpsSimulator() {
  if (intervalId) {
    clearInterval(intervalId);
  }

  console.log('[GPS Simulator] Starting real-time truck GPS simulator...');

  intervalId = setInterval(() => {
    try {
      // 1. Get map defaults from settings
      let defaultLat = 9.509167;
      let defaultLng = -13.712222;

      const latSetting = db.prepare('SELECT value FROM settings WHERE key = ?').get('default_map_lat');
      const lngSetting = db.prepare('SELECT value FROM settings WHERE key = ?').get('default_map_lng');

      if (latSetting && latSetting.value) {
        const parsed = parseFloat(latSetting.value);
        if (!isNaN(parsed)) defaultLat = parsed;
      }
      if (lngSetting && lngSetting.value) {
        const parsed = parseFloat(lngSetting.value);
        if (!isNaN(parsed)) defaultLng = parsed;
      }

      // 2. Fetch all active trucks
      const trucks = db.prepare('SELECT * FROM trucks WHERE is_archived = 0').all();
      if (trucks.length === 0) return;

      db.transaction(() => {
        for (const truck of trucks) {
          let lat = truck.latitude;
          let lng = truck.longitude;

          if (lat === null || lng === null) {
            // First time seeding GPS
            lat = defaultLat + (Math.random() - 0.5) * 0.05;
            lng = defaultLng + (Math.random() - 0.5) * 0.05;
          } else {
            // Small random walk (simulating driving)
            lat += (Math.random() - 0.5) * 0.002;
            lng += (Math.random() - 0.5) * 0.002;
          }

          const last_location_update = new Date().toISOString();

          db.prepare(
            'UPDATE trucks SET latitude = ?, longitude = ?, last_location_update = ?, sync_status = ?, sync_updated_at = CURRENT_TIMESTAMP WHERE id = ?'
          ).run(lat, lng, last_location_update, 'pending', truck.id);

          const updated = db.prepare('SELECT * FROM trucks WHERE id = ?').get(truck.id);

          // Add to sync queue for cloud sync
          try {
            db.prepare('INSERT INTO sync_queue (table_name, record_id, action, data) VALUES (?, ?, ?, ?)').run(
              'trucks',
              truck.id,
              'UPDATE',
              JSON.stringify(updated)
            );
          } catch (e) {}
        }
      })();

      console.log(`[GPS Simulator] Updated coordinates for ${trucks.length} trucks.`);
    } catch (err) {
      console.error('[GPS Simulator] Error updating truck locations:', err.message);
    }
  }, 15000); // every 15 seconds
}

export function stopGpsSimulator() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    console.log('[GPS Simulator] Stopped.');
  }
}
