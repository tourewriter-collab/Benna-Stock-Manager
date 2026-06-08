/**
 * attendanceSync.ts
 * -----------------
 * Pulls attendance logs from the on-premise ZKTeco/ADMS device
 * and upserts them into Supabase.
 *
 * Device network details:
 *   IP   : 192.168.0.100  (or VITE_ATTENDANCE_DEVICE_IP)
 *   Port : 5005            (or VITE_ATTENDANCE_DEVICE_PORT)
 *   Auth : none (password = 0)
 *
 * The device exposes an ADMS-compatible HTTP endpoint.
 * We proxy through our local Express server to avoid CORS issues
 * in the Electron renderer context.
 */

import { supabase } from '../lib/supabase';

// ─── Env helpers ────────────────────────────────────────────────────────────

const env = (key: string, fallback: string) =>
  (import.meta.env[key] as string | undefined)?.trim() || fallback;

const SERVER_PORT = env('VITE_ATTENDANCE_SERVER_PORT',  '7005');

// In Electron the renderer can't reach local IPs directly due to CORS.
// We proxy the request through our Express server at localhost:7005.
const PROXY_ENDPOINT = `http://localhost:${SERVER_PORT}/api/hr/attendance/device-pull`;

// ─── Types ──────────────────────────────────────────────────────────────────

export interface RawAttendanceRecord {
  UserID?:             string | number;
  EnrollNumber?:       string | number;   // alternate field name
  DeviceID?:           string;
  sn?:                 string;            // device serial number
  Timestamp?:          string;
  time?:               string;
  VerificationMethod?: string | number;
  Status?:             string | number;
  Direction?:          string;
}

export interface AttendanceRecord {
  id:                  string;   // UUID – generated client-side for idempotency
  employee_id:         string | null;
  device_enroll_id:    string;
  timestamp:           string;   // ISO-8601
  verification_method: string;
  direction:           string;
  source:              string;
  device_sn:           string | null;
  sync_status:         string;
}

export interface PullResult {
  count:    number;
  records:  AttendanceRecord[];
  errors:   string[];
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function mapVerification(raw?: string | number): string {
  const v = String(raw ?? '').toLowerCase();
  if (v.includes('face'))        return 'face';
  if (v.includes('finger'))      return 'fingerprint';
  if (v.includes('card'))        return 'card';
  if (v.includes('pass'))        return 'password';
  if (v === '1')                 return 'fingerprint';
  if (v === '2')                 return 'card';
  if (v === '4')                 return 'face';
  return 'unknown';
}

function mapDirection(raw?: string | number): string {
  const v = String(raw ?? '').toLowerCase();
  if (v === '0' || v === 'in')        return 'in';
  if (v === '1' || v === 'out')       return 'out';
  if (v === '2' || v === 'break_out') return 'break_out';
  if (v === '3' || v === 'break_in')  return 'break_in';
  return 'unknown';
}

/** Deterministic UUID based on device_enroll_id + timestamp string */
function stableUUID(enrollId: string, ts: string): string {
  // Simple but stable enough – crypto.randomUUID() would be different each run
  const raw = `${enrollId}|${ts}`;
  // Use btoa to create a reproducible base string, then format as UUID-like
  const hash = Array.from(raw).reduce((acc, c) => {
    return ((acc << 5) - acc + c.charCodeAt(0)) | 0;
  }, 0);
  const hex = Math.abs(hash).toString(16).padStart(8, '0');
  return `${hex.slice(0, 8)}-${hex.slice(0, 4)}-4${hex.slice(1, 4)}-8${hex.slice(2, 5)}-${hex.padEnd(12, '0').slice(0, 12)}`;
}

// ─── Core pull function ──────────────────────────────────────────────────────

/**
 * Pull attendance records from the device (via server proxy) and upsert to Supabase.
 * Returns the number of new records inserted / updated.
 */
export async function pullAttendance(): Promise<PullResult> {
  const errors: string[] = [];
  let rawRecords: RawAttendanceRecord[] = [];

  // 1. Fetch from device via server proxy
  try {
    const resp = await fetch(PROXY_ENDPOINT, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(10_000), // 10 s timeout
    });

    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status} – ${resp.statusText}`);
    }

    const json = await resp.json();
    // Server may wrap in { records: [...] } or return array directly
    rawRecords = Array.isArray(json) ? json : (json.records ?? json.data ?? []);
  } catch (err: any) {
    const msg = err?.message ?? String(err);
    errors.push(`Device fetch failed: ${msg}`);
    console.error('[AttendanceSync] Fetch error:', msg);
    return { count: 0, records: [], errors };
  }

  if (rawRecords.length === 0) {
    console.info('[AttendanceSync] No records returned from device');
    return { count: 0, records: [], errors };
  }

  // 2. Transform raw records
  const formatted: AttendanceRecord[] = rawRecords.map((r) => {
    const enrollId  = String(r.UserID ?? r.EnrollNumber ?? 'unknown');
    const ts        = r.Timestamp ?? r.time ?? new Date().toISOString();
    const isoTs     = ts.includes('T') ? ts : new Date(ts.replace(' ', 'T')).toISOString();

    return {
      id:                  stableUUID(enrollId, isoTs),
      employee_id:         null, // resolved server-side via JOIN on device_enroll_id
      device_enroll_id:    enrollId,
      timestamp:           isoTs,
      verification_method: mapVerification(r.VerificationMethod),
      direction:           mapDirection(r.Status ?? r.Direction),
      source:              'online_push',
      device_sn:           r.DeviceID ?? r.sn ?? null,
      sync_status:         'synced',
    };
  });

  // 3. Upsert to Supabase (conflict on device_enroll_id + timestamp)
  const { error: upsertError } = await supabase
    .from('attendance')
    .upsert(formatted, { onConflict: 'device_enroll_id,timestamp', ignoreDuplicates: true });

  if (upsertError) {
    errors.push(`Supabase upsert failed: ${upsertError.message}`);
    console.error('[AttendanceSync] Upsert error:', upsertError);
    return { count: 0, records: formatted, errors };
  }

  console.info(`[AttendanceSync] ✅ Upserted ${formatted.length} records`);
  return { count: formatted.length, records: formatted, errors };
}

/** Singleton guard – only pull once per app session automatically */
let _autoPulled = false;

export function autoPullOnce(): void {
  if (_autoPulled) return;
  _autoPulled = true;

  if (!navigator.onLine) {
    console.info('[AttendanceSync] Offline – skipping auto-pull');
    return;
  }

  console.info('[AttendanceSync] Running one-time auto-pull...');
  pullAttendance()
    .then(({ count, errors }) => {
      if (errors.length > 0) {
        console.warn('[AttendanceSync] Pull completed with errors:', errors);
      } else {
        console.info(`[AttendanceSync] Auto-pull complete: ${count} records`);
      }
    })
    .catch((err) => console.error('[AttendanceSync] Unhandled error:', err));
}
