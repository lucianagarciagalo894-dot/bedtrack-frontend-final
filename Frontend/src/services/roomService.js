const API_BASE = "https://bedtrack-frontend-final-production.up.railway.app/api";
const FETCH_TIMEOUT_MS = 10000;

// Throttle fallback warnings to once per 60 seconds per message key
const _warnTimestamps = {};
function warnOnce(key, ...args) {
  const now = Date.now();
  if (!_warnTimestamps[key] || now - _warnTimestamps[key] > 60000) {
    _warnTimestamps[key] = now;
    console.warn(...args);
  }
}

/**
 * Wraps fetch() with an AbortController timeout.
 * Falls through quickly (after ~10s) instead of waiting for the browser's default timeout (~90s).
 */
async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort(new Error("Timeout de solicitud de red"));
  }, FETCH_TIMEOUT_MS);

  let signal = controller.signal;
  if (options.signal) {
    if (options.signal.aborted) {
      controller.abort(options.signal.reason);
    } else {
      options.signal.addEventListener("abort", () => {
        controller.abort(options.signal.reason);
      }, { once: true });
    }
  }

  try {
    const response = await fetch(url, { ...options, signal });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

export const ROOMS_STORAGE_KEY = "bedtrack_rooms_data";

export function getStorageKey(sucursalId = null) {
  return sucursalId ? `bedtrack_rooms_data_${sucursalId}` : ROOMS_STORAGE_KEY;
}

function findSucursalKeyForRoom(roomId) {
  if (typeof window === "undefined") return null;
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k === ROOMS_STORAGE_KEY || (k && k.startsWith("bedtrack_rooms_data_"))) {
      try {
        const raw = localStorage.getItem(k);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed) && parsed.some((r) => r.id === Number(roomId))) {
            return k === ROOMS_STORAGE_KEY ? null : k.replace("bedtrack_rooms_data_", "");
          }
        }
      } catch (e) {}
    }
  }
  return null;
}

function findSucursalKeyForBed(bedId) {
  if (typeof window === "undefined") return null;
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k === ROOMS_STORAGE_KEY || (k && k.startsWith("bedtrack_rooms_data_"))) {
      try {
        const raw = localStorage.getItem(k);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed) && parsed.some((r) => (r.beds || []).some((b) => b.id === Number(bedId)))) {
            return k === ROOMS_STORAGE_KEY ? null : k.replace("bedtrack_rooms_data_", "");
          }
        }
      } catch (e) {}
    }
  }
  return null;
}

export function getStoredRooms(sucursalId = null) {
  if (sucursalId === "") return [];
  if (typeof window === "undefined") return getFallbackRooms(sucursalId);
  const key = getStorageKey(sucursalId);
  try {
    const raw = localStorage.getItem(key);
    if (raw !== null) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    }
  } catch (err) {
    try {
      localStorage.removeItem(key);
    } catch (e) {}
  }
  const sId = sucursalId ? sucursalId.toString() : null;
  if (sId && sId !== "1" && sId !== "2" && sId !== "3") {
    return [];
  }

  const fallback = getFallbackRooms(sucursalId);
  try {
    localStorage.setItem(key, JSON.stringify(fallback));
  } catch (e) {}
  return fallback;
}

export function saveStoredRooms(rooms, sucursalId = null) {
  if (typeof window === "undefined" || sucursalId === "") return;
  const key = getStorageKey(sucursalId);
  try {
    localStorage.setItem(key, JSON.stringify(rooms));
  } catch (err) {
    console.error(`Error guardando ${key} en localStorage:`, err);
  }
  window.dispatchEvent(new CustomEvent("bedtrack_rooms_updated", { detail: { sucursalId } }));
}

export function getStoredFloors(sucursalId = null) {
  if (!sucursalId || sucursalId === "") return [];
  const sId = sucursalId.toString();
  const key = `bedtrack_floors_data_${sId}`;
  if (typeof window !== "undefined") {
    try {
      const raw = localStorage.getItem(key);
      if (raw !== null) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          return parsed;
        }
      }
    } catch (e) {}
  }

  const rooms = getStoredRooms(sId);
  const floorMap = new Map();
  if (Array.isArray(rooms)) {
    rooms.forEach((r) => {
      const fId = r.floorId ?? 1;
      if (!floorMap.has(fId)) {
        floorMap.set(fId, {
          id: fId,
          nombre: r.floor || (fId === 0 ? "Planta Baja" : `Piso ${fId}`),
          tipo: r.type || "General",
          tipoKey: r.typeKey || "general",
          roomCount: rooms.filter((rm) => (rm.floorId ?? 1) === fId).length,
        });
      }
    });
  }
  const derived = Array.from(floorMap.values());
  if (derived.length > 0 && typeof window !== "undefined") {
    try {
      localStorage.setItem(key, JSON.stringify(derived));
    } catch (e) {}
  }
  return derived;
}

export function saveStoredFloors(floors, sucursalId = null) {
  if (typeof window === "undefined" || !sucursalId || sucursalId === "") return;
  const sId = sucursalId.toString();
  const key = `bedtrack_floors_data_${sId}`;
  try {
    localStorage.setItem(key, JSON.stringify(floors));
  } catch (e) {}
  window.dispatchEvent(new CustomEvent("bedtrack_floors_updated", { detail: { sucursalId: sId } }));
}

export async function getFloors(sucursalId = null) {
  if (sucursalId === "") return [];
  const sId = sucursalId ? sucursalId.toString() : null;
  if (!sId) return [];

  try {
    const url = `${API_BASE}/floors?sucursalId=${sId}`;
    const res = await fetchWithTimeout(url);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        saveStoredFloors(data, sId);
        return data;
      }
    }
  } catch (err) {}

  return getStoredFloors(sId);
}

export async function getAllRooms(sucursalId = null) {
  if (sucursalId === "") return [];

  try {
    const url = sucursalId ? `${API_BASE}/rooms?sucursalId=${sucursalId}` : `${API_BASE}/rooms`;
    const res = await fetchWithTimeout(url);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data)) {
        saveStoredRooms(data, sucursalId);
        return data;
      }
    }
  } catch (err) {}

  return getStoredRooms(sucursalId);
}

export async function getRoomsByFloor(floorId, sucursalId = null) {
  try {
    const all = await getAllRooms(sucursalId);
    return all.filter((r) => String(r.floorId) === String(floorId));
  } catch (err) {
    warnOnce("roomsByFloor", "Usando filtro local de habitaciones por piso:", err);
    const all = getStoredRooms(sucursalId);
    return all.filter((r) => String(r.floorId) === String(floorId));
  }
}

export async function getRoomById(roomId, sucursalId = null) {
  try {
    const all = await getAllRooms(sucursalId);
    return all.find((r) => r.id === Number(roomId)) || all[0];
  } catch (err) {
    warnOnce("roomById", "Usando búsqueda local de habitación:", err);
    const all = getStoredRooms(sucursalId);
    return all.find((r) => r.id === Number(roomId)) || all[0];
  }
}

export async function createRoom(data, sucursalId = null) {
  const sId = sucursalId || data?.sucursalId;
  const currentRooms = await getAllRooms(sId);
  const createdId = Date.now();
  const num = parseInt(data.numero, 10) || 101;
  const pId = data.pisoId !== undefined ? parseInt(data.pisoId, 10) : 1;
  const floorLabel = data.floor || `Piso ${pId}`;
  const bedCount = parseInt(data.cantidadCamasInicial || data.bedsCount, 10) || 1;

  const newRoom = {
    id: createdId,
    number: num,
    floorId: pId,
    floor: floorLabel,
    type: data.tipo || "General",
    typeKey: data.tipoKey || "general",
    sucursalId: sId ? parseInt(sId, 10) : undefined,
    beds: Array.from({ length: bedCount }, (_, i) => ({
      id: createdId + i + 1,
      number: i + 1,
      status: "disponible",
      patient: null,
    })),
  };

  const updatedRooms = [...currentRooms, newRoom];
  saveStoredRooms(updatedRooms, sId);
  return newRoom;
}

export const addRoom = createRoom;

export async function updateRoom(roomId, data, sucursalId = null) {
  const sId = sucursalId || data?.sucursalId || findSucursalKeyForRoom(roomId);
  const currentRooms = await getAllRooms(sId);
  const existingRoom = currentRooms.find((r) => r.id === Number(roomId));

  const num = parseInt(data.numero, 10) || existingRoom?.number || 101;
  const pId = data.pisoId !== undefined ? parseInt(data.pisoId, 10) : (existingRoom?.floorId ?? 1);

  const updatedRoom = {
    ...existingRoom,
    id: Number(roomId),
    number: num,
    floorId: pId,
    floor: data.floor || existingRoom?.floor || `Piso ${pId}`,
    type: data.tipo || data.type || existingRoom?.type || "General",
    typeKey: data.tipoKey || data.typeKey || existingRoom?.typeKey || "general",
    beds: existingRoom?.beds || [],
  };

  const updatedRooms = currentRooms.map((r) => (r.id === Number(roomId) ? updatedRoom : r));
  saveStoredRooms(updatedRooms, sId);
  return updatedRoom;
}

export async function deleteRoom(roomId, sucursalId = null) {
  const sId = sucursalId || findSucursalKeyForRoom(roomId);
  const currentRooms = await getAllRooms(sId);
  const updatedRooms = currentRooms.filter((r) => r.id !== Number(roomId));
  saveStoredRooms(updatedRooms, sId);
  return true;
}

export const AUDIT_STORAGE_KEY = "bedtrack_audit_logs";

export function getInitialSeedAuditLogs() {
  return [];
}

export function getStoredAuditLogs(sucursalId = null) {
  if (sucursalId === "") return [];
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(AUDIT_STORAGE_KEY);
    let logs = [];
    if (raw) {
      logs = JSON.parse(raw);
    }
    if (!Array.isArray(logs)) logs = [];
    if (sucursalId) {
      return logs.filter(
        (log) => !log.sucursalId || log.sucursalId.toString() === sucursalId.toString()
      );
    }
    return logs;
  } catch (e) {
    return [];
  }
}

export function addLocalAuditLog(logEntry) {
  if (typeof window === "undefined") return;
  try {
    const current = getStoredAuditLogs();
    const updated = [logEntry, ...current];
    localStorage.setItem(AUDIT_STORAGE_KEY, JSON.stringify(updated));
    window.dispatchEvent(new CustomEvent("bedtrack_audit_updated", { detail: logEntry }));
  } catch (e) {
    console.error("Error al guardar log de auditoría local:", e);
  }
}

export async function updateBedStatus(bedId, status, patient = null, operatorInfo = null, sucursalId = null) {
  const payload = {
    status,
    patient,
    operatorName: operatorInfo?.name || "Lic. Personal de Enfermería",
    operatorEmail: operatorInfo?.email || "enfermeria@hospital.com",
    operatorRole: operatorInfo?.role || "enfermeria",
  };

  let updatedBed = null;
  try {
    const res = await fetchWithTimeout(`${API_BASE}/beds/${bedId}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      updatedBed = await res.json();
    }
  } catch (err) {
    warnOnce("updateBedLocal", "Usando respuesta local para actualizar cama:", err);
  }

  if (!updatedBed) {
    updatedBed = {
      id: bedId,
      number: 1,
      status,
      patient: status === "ocupada" ? patient : null,
    };
  }

  const sId = sucursalId || findSucursalKeyForBed(bedId) || "1";
  let targetRoom = null;
  let targetBed = null;

  try {
    const rooms = await getAllRooms(sId);
    for (const r of rooms) {
      const b = (r.beds || []).find((x) => x.id === Number(bedId));
      if (b) {
        targetRoom = r;
        targetBed = b;
        break;
      }
    }
    const newRooms = rooms.map((room) => ({
      ...room,
      beds: (room.beds || []).map((bed) =>
        bed.id === Number(bedId)
          ? {
              ...bed,
              status: updatedBed.status,
              patient: updatedBed.patient,
            }
          : bed
      ),
    }));
    saveStoredRooms(newRooms, sId);
  } catch (e) {
    console.warn("Error guardando cama actualizada en localStorage:", e);
  }

  const previousStatus = targetBed?.status?.toLowerCase() || "disponible";
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10) + " " + now.toTimeString().slice(0, 8);
  const accionText = status === "ocupada"
    ? `Asignó paciente ${patient?.nombre || ''} ${patient?.apellido || ''}`.trim()
    : status === "enlimpieza"
      ? "Liberó la cama para desinfección y limpieza"
      : "Habilitó la cama como Disponible";

  const localLog = {
    id: Date.now(),
    camaId: bedId,
    camaNumero: targetBed?.number || 1,
    habitacionId: targetRoom?.id || 101,
    habitacionNumero: targetRoom?.number || 101,
    sucursalId: sId ? sId.toString() : "1",
    nosocomioId: "1",
    usuarioNombre: operatorInfo?.name || "Personal de Enfermería",
    usuarioEmail: operatorInfo?.email || "enfermeria@hospital.com",
    usuarioRol: operatorInfo?.role || "enfermeria",
    accion: accionText,
    estadoAnterior: previousStatus,
    estadoNuevo: status,
    fechaHora: dateStr
  };
  addLocalAuditLog(localLog);

  return updatedBed;
}

function getFallbackFloors(sucursalId) {
  return getStoredFloors(sucursalId);
}

function getFallbackRooms(sucursalId) {
  return [];
}

function hashCode(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}

export async function getGlobalAuditHistory(sucursalId = null) {
  let logs = [];
  try {
    const url = sucursalId ? `${API_BASE}/beds/history?sucursalId=${sucursalId}` : `${API_BASE}/beds/history`;
    const res = await fetchWithTimeout(url);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        logs = data;
      }
    }
  } catch (err) {}

  if (!logs || logs.length === 0) {
    logs = getStoredAuditLogs(sucursalId);
  }

  return logs;
}

export async function getBedHistory(bedId) {
  let logs = [];
  try {
    const res = await fetchWithTimeout(`${API_BASE}/beds/${bedId}/history`);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        logs = data;
      }
    }
  } catch (err) {}

  if (!logs || logs.length === 0) {
    const localLogs = getStoredAuditLogs();
    logs = localLogs.filter((l) => Number(l.camaId) === Number(bedId));
  }

  return logs;
}
