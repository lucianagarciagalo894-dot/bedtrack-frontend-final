import { getAllRooms, saveStoredRooms, getStoredRooms, getStoredFloors, saveStoredFloors, getStoredAuditLogs, addLocalAuditLog } from "./roomService";

const API_BASE = "https://bedtrack-frontend-final-production.up.railway.app/api";
const FETCH_TIMEOUT_MS = 20000;

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

// Throttle fallback warnings to once per 5 minutes per message key, suppressing noise
const _warnTimestamps = {};
function warnOnce(key, msg) {
  const now = Date.now();
  if (!_warnTimestamps[key] || now - _warnTimestamps[key] > 300000) {
    _warnTimestamps[key] = now;
    console.info(`${msg} [Modo Fallback / Offline]`);
  }
}

export async function loginDev(email = "", devKey = "") {
  const cleanEmail = email.trim().toLowerCase();
  if (cleanEmail !== "dev@gmail.com" || devKey !== "proyectofinal") {
    throw new Error("Credenciales de desarrollador invรกlidas. Ingrese dev@gmail.com y clave proyectofinal.");
  }

  try {
    const res = await fetchWithTimeout(`${API_BASE}/superadmin/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: cleanEmail, devKey }),
    });

    if (!res.ok) {
      return { success: true, role: "superadmin", message: "Acceso concedido (Modo Offline Desarrollador)" };
    }

    return await res.json();
  } catch (error) {
    return { success: true, role: "superadmin", message: "Acceso concedido (Desarrollador Modo Resiliente)" };
  }
}

export function normalizeRole(role) {
  if (!role) return "enfermeria";
  const clean = role.toString().trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (clean.includes("enferm") || clean.includes("nurse")) return "enfermeria";
  if (clean.includes("encargad") || clean.includes("admin")) return "encargado";
  return clean;
}

export async function validateStaffLogin(email = "", password = "", role = "enfermeria", nosocomioId = null, sucursalId = null) {
  let apiErrorMessage = null;
  try {
    const res = await fetchWithTimeout(`${API_BASE}/superadmin/users/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: email.trim(),
        password,
        role: normalizeRole(role),
        nosocomioId: nosocomioId ? parseInt(nosocomioId, 10) : null,
        sucursalId: sucursalId ? parseInt(sucursalId, 10) : null,
      }),
    });

    if (res.ok) {
      return await res.json();
    }
    const errData = await res.json().catch(() => ({}));
    apiErrorMessage = errData.message || null;
  } catch (error) {
    if (error.message && !error.message.includes("fetch")) {
      apiErrorMessage = error.message;
    }
  }

  const targetRole = normalizeRole(role);
  const staff = getStoredStaffUsers();
  const found = staff.find(
    (u) =>
      u.email &&
      u.email.trim().toLowerCase() === email.trim().toLowerCase() &&
      normalizeRole(u.rol) === targetRole &&
      (!nosocomioId || !u.nosocomioId || parseInt(u.nosocomioId, 10) === parseInt(nosocomioId, 10))
  );

  if (found) {
    if (found.activo === false) {
      throw new Error("Usuario desactivado por la administraciรณn.");
    }
    if (found.password && found.password !== password) {
      throw new Error("Contraseรฑa incorrecta.");
    }
    return { success: true, user: found, message: "Inicio de sesiรณn exitoso" };
  }

  throw new Error(apiErrorMessage || "Usuario no registrado para este hospital o rol inactivo.");
}

export const NOSOCOMIOS_STORAGE_KEY = "bedtrack_nosocomios_data";
export const STAFF_USERS_STORAGE_KEY = "bedtrack_staff_users_data";
export const DELETED_NOSOCOMIOS_STORAGE_KEY = "bedtrack_deleted_nosocomio_ids";

let localNosocomiosStore = [];
let localStaffUsersStore = [];

export function getDeletedNosocomioIds() {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(DELETED_NOSOCOMIOS_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return [];
}

export function registerDeletedNosocomio(id, codigo = null) {
  if (typeof window === "undefined") return;
  try {
    const current = getDeletedNosocomioIds();
    const next = [...current];
    if (id && !next.includes(id.toString())) next.push(id.toString());
    if (codigo && !next.includes(codigo.toString().toLowerCase())) next.push(codigo.toString().toLowerCase());
    localStorage.setItem(DELETED_NOSOCOMIOS_STORAGE_KEY, JSON.stringify(next));
  } catch (e) {}
}

function filterDeletedNosocomios(list) {
  return (list || []).filter((n) => Boolean(n && n.nombre));
}

function getBaseNosocomios() {
  return [];
}

export function getStoredNosocomios() {
  if (typeof window === "undefined") {
    return filterDeletedNosocomios(localNosocomiosStore);
  }
  try {
    const raw = localStorage.getItem(NOSOCOMIOS_STORAGE_KEY);
    if (raw !== null) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return filterDeletedNosocomios(parsed);
      }
    }
  } catch (e) {}
  return filterDeletedNosocomios(localNosocomiosStore);
}

export function saveStoredNosocomios(list) {
  const filtered = filterDeletedNosocomios(list);
  localNosocomiosStore = filtered;
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(NOSOCOMIOS_STORAGE_KEY, JSON.stringify(filtered));
    } catch (e) {}
    window.dispatchEvent(new CustomEvent("bedtrack_hospitals_updated", { detail: { nosocomios: filtered } }));
  }
}

export function getStoredStaffUsers() {
  let list = localStaffUsersStore;
  if (typeof window !== "undefined") {
    try {
      const raw = localStorage.getItem(STAFF_USERS_STORAGE_KEY);
      if (raw !== null) list = JSON.parse(raw);
    } catch (e) {}
  }
  return (list || []).map((u) => ({
    ...u,
    rol: normalizeRole(u.rol),
  }));
}

export function saveStoredStaffUsers(list) {
  localStaffUsersStore = list;
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(STAFF_USERS_STORAGE_KEY, JSON.stringify(list));
    } catch (e) {}
    window.dispatchEvent(new CustomEvent("bedtrack_users_updated", { detail: { users: list } }));
  }
}

export async function getNosocomios() {
  const stored = getStoredNosocomios();
  try {
    const res = await fetchWithTimeout(`${API_BASE}/superadmin/nosocomios?_t=${Date.now()}`, { cache: "no-store" });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data)) {
        localNosocomiosStore = filterDeletedNosocomios(data);
        if (typeof window !== "undefined") {
          try {
            localStorage.setItem(NOSOCOMIOS_STORAGE_KEY, JSON.stringify(localNosocomiosStore));
          } catch (e) {}
        }
        return localNosocomiosStore;
      }
    }
    return filterDeletedNosocomios(stored);
  } catch (err) {
    return filterDeletedNosocomios(stored);
  }
}

function getFallbackNosocomios() {
  return filterDeletedNosocomios(getStoredNosocomios());
}

export async function createNosocomio(data) {
  let createdNos = null;
  try {
    const res = await fetchWithTimeout(`${API_BASE}/superadmin/nosocomios`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    if (res.ok) {
      createdNos = await res.json();
    }
  } catch (err) {
    warnOnce("createNos", "Creaciรณn local de nosocomio por fallback:", err);
  }

  if (!createdNos) {
    const createdId = Date.now();
    createdNos = {
      id: createdId,
      nombre: data.nombre,
      codigo: data.codigo || `NOS-${Math.floor(Math.random() * 9000 + 1000)}`,
      direccion: data.direccion || "Direcciรณn Principal",
      sucursales: [
        {
          id: createdId + 1,
          nombre: "Establecimiento Central",
          direccion: data.direccion || "Direcciรณn Principal",
          nosocomioId: createdId,
        },
      ],
    };
  }

  if (!createdNos.sucursales || createdNos.sucursales.length === 0) {
    createdNos.sucursales = [
      {
        id: createdNos.id + 100,
        nombre: "Establecimiento Central",
        direccion: createdNos.direccion || "Direcciรณn Principal",
        nosocomioId: createdNos.id,
      },
    ];
  }

  const currentNosocomios = getStoredNosocomios();
  const updatedNosocomios = [...currentNosocomios, createdNos];
  saveStoredNosocomios(updatedNosocomios);

  const newSucId = createdNos.sucursales?.[0]?.id;
  if (newSucId) {
    saveStoredRooms([], newSucId);
    saveStoredFloors([], newSucId);
  }

  return createdNos;
}

export async function deleteNosocomio(id) {
  const currentStore = getStoredNosocomios();
  const targetNos = currentStore.find((n) => n.id.toString() === id.toString());
  registerDeletedNosocomio(id, targetNos?.codigo);

  const sucursalIds = (targetNos?.sucursales || []).map((s) => s.id.toString());

  try {
    await fetchWithTimeout(`${API_BASE}/superadmin/nosocomios/${id}`, {
      method: "DELETE",
    });
  } catch (err) {
    // Manejar fallo de red en silencio
  }

  // Purgar datos de habitaciones/camas/auditorรญa de localStorage para cada sede del hospital
  if (typeof window !== "undefined") {
    try {
      localStorage.removeItem(`bedtrack_rooms_data_${id}`);
      sucursalIds.forEach((sId) => {
        localStorage.removeItem(`bedtrack_rooms_data_${sId}`);
        localStorage.removeItem(`bedtrack_floors_data_${sId}`);
      });
      const rawAudit = localStorage.getItem("bedtrack_audit_logs_data");
      if (rawAudit) {
        const parsed = JSON.parse(rawAudit);
        if (Array.isArray(parsed)) {
          const cleaned = parsed.filter((l) => {
            const nosMatch = l.nosocomioId && l.nosocomioId.toString() === id.toString();
            const sucMatch = l.sucursalId && sucursalIds.includes(l.sucursalId.toString());
            return !nosMatch && !sucMatch;
          });
          localStorage.setItem("bedtrack_audit_logs_data", JSON.stringify(cleaned));
        }
      }
    } catch (e) {}
  }

  const updatedList = currentStore.filter((n) => n.id.toString() !== id.toString());
  saveStoredNosocomios(updatedList);

  const currentStaff = getStoredStaffUsers();
  const updatedStaff = currentStaff.filter((u) => {
    if (!u) return false;
    const matchNos = u.nosocomioId && u.nosocomioId.toString() === id.toString();
    const matchSuc = u.sucursalId && sucursalIds.includes(u.sucursalId.toString());
    return !matchNos && !matchSuc;
  });
  saveStoredStaffUsers(updatedStaff);

  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("bedtrack_rooms_updated", { detail: { nosocomioId: id } }));
  }

  return true;
}

export async function exportHospitalAuditHistoryCSV(nosocomioId = null, sucursalId = null, hospitalName = "Hospital") {
  let logs = [];
  try {
    logs = await getAuditLogs(sucursalId, nosocomioId);
  } catch (e) {
    logs = getStoredAuditLogs(sucursalId, nosocomioId) || [];
  }

  if (!logs || logs.length === 0) {
    logs = getStoredAuditLogs() || [];
  }

  if (nosocomioId || sucursalId) {
    logs = logs.filter((log) => {
      const matchNos = !nosocomioId || (log.nosocomioId && log.nosocomioId.toString() === nosocomioId.toString());
      const matchSuc = !sucursalId || (log.sucursalId && log.sucursalId.toString() === sucursalId.toString());
      return matchNos || matchSuc;
    });
  }

  const headers = [
    "ID Evento",
    "Fecha y Hora",
    "Operador",
    "Correo Electrรณnico",
    "Rol",
    "Habitaciรณn",
    "Cama Nยฐ",
    "Acciรณn Realizada",
    "Estado Anterior",
    "Estado Nuevo",
  ];

  const escapeCSV = (val) => {
    if (val === null || val === undefined) return '""';
    const str = String(val).replace(/"/g, '""');
    return `"${str}"`;
  };

  const rows = logs.map((log) => [
    escapeCSV(log.id || "-"),
    escapeCSV(log.fechaHora || "-"),
    escapeCSV(log.usuarioNombre || "Personal Hospitalario"),
    escapeCSV(log.usuarioEmail || "-"),
    escapeCSV(log.usuarioRol || "-"),
    escapeCSV(log.habitacionNumero || log.habitacionId || "-"),
    escapeCSV(log.camaNumero || log.camaId || "-"),
    escapeCSV(log.accion || "-"),
    escapeCSV(log.estadoAnterior || "-"),
    escapeCSV(log.estadoNuevo || "-"),
  ]);

  const csvContent = "\uFEFF" + [headers.map((h) => `"${h}"`).join(","), ...rows.map((r) => r.join(","))].join("\r\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const cleanName = (hospitalName || "Hospital").toLowerCase().replace(/[^a-z0-9]/g, "_");
  const dateSuffix = new Date().toISOString().slice(0, 10);
  link.setAttribute("href", url);
  link.setAttribute("download", `historial_${cleanName}_${dateSuffix}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export async function getSucursales(nosocomioId) {
  try {
    const res = await fetchWithTimeout(`${API_BASE}/superadmin/nosocomios/${nosocomioId}/sucursales`);
    if (!res.ok) throw new Error("Error al obtener sucursales");
    return await res.json();
  } catch (err) {
    warnOnce("sucursales", "Usando lista local de sucursales:", err);
    return [
      { id: 1, nombre: "Sede Central", direccion: "Av. Principal 123", nosocomioId },
    ];
  }
}

export async function createSucursal(data) {
  let created = null;
  try {
    const res = await fetchWithTimeout(`${API_BASE}/superadmin/sucursales`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    if (res.ok) {
      created = await res.json();
    }
  } catch (err) {
    if (data.nombre) {
      const createdId = Date.now();
      created = {
        id: createdId,
        nombre: data.nombre,
        direccion: data.direccion || "Direcciรณn Sede",
        nosocomioId: data.nosocomioId,
      };
    }
  }

  if (!created && data.nombre) {
    const createdId = Date.now();
    created = {
      id: createdId,
      nombre: data.nombre,
      direccion: data.direccion || "Direcciรณn Sede",
      nosocomioId: data.nosocomioId,
    };
  }

  if (created) {
    const currentStore = getStoredNosocomios();
    const updatedList = currentStore.map((n) => {
      if (n.id.toString() === data.nosocomioId?.toString()) {
        const sucursales = n.sucursales || [];
        const exists = sucursales.some((s) => s.id === created.id);
        return {
          ...n,
          sucursales: exists ? sucursales.map((s) => (s.id === created.id ? created : s)) : [...sucursales, created],
        };
      }
      return n;
    });
    saveStoredNosocomios(updatedList);
  }

  return created;
}

export async function createRoom(data, sucursalId = null) {
  const sId = sucursalId || data?.sucursalId;
  let created = null;
  try {
    const res = await fetchWithTimeout(`${API_BASE}/superadmin/rooms`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (res.ok) {
      created = await res.json();
    }
  } catch (err) {
    warnOnce("createRoom", "Creaciรณn local de habitaciรณn por fallback:", err);
  }

  if (!created) {
    const createdId = Date.now();
    const num = parseInt(data.numero, 10) || 101;
    const pId = data.pisoId !== undefined ? parseInt(data.pisoId, 10) : 1;
    const bedCount = parseInt(data.cantidadCamasInicial || data.bedsCount, 10) || 1;

    created = {
      id: createdId,
      number: num,
      floorId: pId,
      floor: data.floor || `Piso ${pId}`,
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
  }

  try {
    const currentRooms = await getAllRooms(sId);
    const updatedRooms = [...currentRooms, created];
    saveStoredRooms(updatedRooms, sId);
  } catch (e) {
    console.error("Error guardando habitaciรณn en localStorage:", e);
  }

  return created;
}

export async function updateRoom(roomId, data, sucursalId = null) {
  const sId = sucursalId || data?.sucursalId;
  let updated = null;
  try {
    const res = await fetchWithTimeout(`${API_BASE}/superadmin/rooms/${roomId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (res.ok) {
      updated = await res.json();
    }
  } catch (err) {
    warnOnce("updateRoom", "Actualizaciรณn local de habitaciรณn por fallback:", err);
  }

  const currentRooms = await getAllRooms(sId);
  const existingRoom = currentRooms.find((r) => r.id === Number(roomId));

  if (!updated) {
    const num = parseInt(data.numero, 10) || existingRoom?.number || 101;
    const pId = data.pisoId !== undefined ? parseInt(data.pisoId, 10) : (existingRoom?.floorId ?? 1);
    updated = {
      ...existingRoom,
      id: Number(roomId),
      number: num,
      floorId: pId,
      floor: data.floor || existingRoom?.floor || `Piso ${pId}`,
      beds: existingRoom?.beds || [],
    };
  }

  try {
    const updatedRooms = currentRooms.map((r) => (r.id === Number(roomId) ? { ...r, ...updated } : r));
    saveStoredRooms(updatedRooms, sId);
  } catch (e) {
    console.error("Error actualizando habitaciรณn en localStorage:", e);
  }

  return updated;
}

export async function deleteRoom(roomId, sucursalId = null) {
  try {
    await fetchWithTimeout(`${API_BASE}/superadmin/rooms/${roomId}`, {
      method: "DELETE",
    });
  } catch (err) {
    warnOnce("deleteRoom", "Eliminaciรณn local de habitaciรณn por fallback:", err);
  }

  try {
    const currentRooms = await getAllRooms(sucursalId);
    const updatedRooms = currentRooms.filter((r) => r.id !== Number(roomId));
    saveStoredRooms(updatedRooms, sucursalId);
  } catch (e) {
    console.error("Error eliminando habitaciรณn de localStorage:", e);
  }

  return true;
}

export async function createBed(data, sucursalId = null) {
  const sId = sucursalId || data?.sucursalId;
  let created = null;
  try {
    const res = await fetchWithTimeout(`${API_BASE}/superadmin/beds`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (res.ok) {
      created = await res.json();
    }
  } catch (err) {
    warnOnce("createBed", "Creaciรณn local de cama por fallback:", err);
  }

  if (!created) {
    created = {
      id: Date.now(),
      number: parseInt(data.numero, 10) || 1,
      status: data.status || "disponible",
      patient: null,
    };
  }

  try {
    const targetRoomId = parseInt(data.habitacionId, 10);
    const currentRooms = await getAllRooms(sId);
    const updatedRooms = currentRooms.map((r) =>
      r.id === targetRoomId
        ? { ...r, beds: [...(r.beds || []), created] }
        : r
    );
    saveStoredRooms(updatedRooms, sId);
  } catch (e) {}

  addLocalAuditLog({
    id: Date.now(),
    camaId: created.id,
    camaNumero: created.number || created.numero || 1,
    habitacionId: Number(data.habitacionId) || 1,
    habitacionNumero: Number(data.habitacionId) || 1,
    usuarioNombre: data.operatorName || "Desarrollador / SuperAdmin",
    usuarioEmail: data.operatorEmail || "developer@bedtrack.com",
    usuarioRol: data.operatorRole || "developer",
    accion: `Creรณ la Cama #${created.number || created.numero || 1} (${data.status || "disponible"})`,
    estadoAnterior: "-",
    estadoNuevo: data.status || "disponible",
    fechaHora: new Date().toLocaleString("es-AR"),
    sucursalId: sId ? Number(sId) : null,
  });

  return created;
}

export async function updateBed(bedId, data, sucursalId = null) {
  const sId = sucursalId || data?.sucursalId;
  let updated = null;
  try {
    const res = await fetchWithTimeout(`${API_BASE}/superadmin/beds/${bedId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (res.ok) {
      updated = await res.json();
    }
  } catch (err) {
    warnOnce("updateBed", "Actualizaciรณn local de cama por fallback:", err);
  }

  if (!updated) {
    updated = {
      id: Number(bedId),
      number: parseInt(data.numero, 10) || 1,
      status: data.status || "disponible",
      patient: null,
    };
  }

  try {
    const currentRooms = await getAllRooms(sId);
    const updatedRooms = currentRooms.map((r) => ({
      ...r,
      beds: (r.beds || []).map((b) => (b.id === Number(bedId) ? { ...b, ...updated } : b)),
    }));
    saveStoredRooms(updatedRooms, sId);
  } catch (e) {}

  addLocalAuditLog({
    id: Date.now(),
    camaId: Number(bedId),
    camaNumero: updated.number || updated.numero || 1,
    habitacionId: Number(data.habitacionId) || 1,
    habitacionNumero: Number(data.habitacionId) || 1,
    usuarioNombre: data.operatorName || "Desarrollador / SuperAdmin",
    usuarioEmail: data.operatorEmail || "developer@bedtrack.com",
    usuarioRol: data.operatorRole || "developer",
    accion: `Modificรณ datos/estado de la Cama #${updated.number || updated.numero || 1}`,
    estadoAnterior: "modificado",
    estadoNuevo: data.status || "disponible",
    fechaHora: new Date().toLocaleString("es-AR"),
    sucursalId: sId ? Number(sId) : null,
  });

  return updated;
}

export async function deleteBed(bedId, sucursalId = null) {
  let targetBedNum = bedId;
  try {
    const currentRooms = await getAllRooms(sucursalId);
    for (const r of currentRooms) {
      const found = (r.beds || []).find((b) => b.id === Number(bedId));
      if (found) {
        targetBedNum = found.number || found.numero || bedId;
        break;
      }
    }
  } catch (e) {}

  try {
    await fetchWithTimeout(`${API_BASE}/superadmin/beds/${bedId}`, {
      method: "DELETE",
    });
  } catch (err) {
    warnOnce("deleteBed", "Eliminaciรณn local de cama por fallback:", err);
  }

  try {
    const currentRooms = await getAllRooms(sucursalId);
    const updatedRooms = currentRooms.map((r) => ({
      ...r,
      beds: (r.beds || []).filter((b) => b.id !== Number(bedId)),
    }));
    saveStoredRooms(updatedRooms, sucursalId);
  } catch (e) {}

  addLocalAuditLog({
    id: Date.now(),
    camaId: Number(bedId),
    camaNumero: Number(targetBedNum) || 1,
    habitacionId: 1,
    habitacionNumero: 1,
    usuarioNombre: "Desarrollador / SuperAdmin",
    usuarioEmail: "developer@bedtrack.com",
    usuarioRol: "developer",
    accion: `Eliminรณ la Cama #${targetBedNum}`,
    estadoAnterior: "disponible",
    estadoNuevo: "eliminada",
    fechaHora: new Date().toLocaleString("es-AR"),
    sucursalId: sucursalId ? Number(sucursalId) : null,
  });

  return true;
}

export async function createFullHospitalSetup(data) {
  let createdNos = null;
  try {
    const res = await fetchWithTimeout(`${API_BASE}/superadmin/hospitals/setup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (res.ok) {
      createdNos = await res.json();
    }
  } catch (err) {
    warnOnce("createHospital", "Creaciรณn local de hospital completo por fallback:", err);
  }

  if (!createdNos) {
    const createdId = Date.now();
    createdNos = {
      id: createdId,
      nombre: data.nombreNosocomio,
      codigo: data.codigoNosocomio || "HOSP-" + Math.floor(Math.random() * 900 + 100),
      direccion: data.direccionNosocomio || "Direcciรณn Principal",
      sucursales: [
        {
          id: createdId + 1,
          nombre: data.nombreSucursal || "Establecimiento Central",
          direccion: data.direccionSucursal || "Direcciรณn Principal",
          nosocomioId: createdId,
        },
      ],
    };
  }

  if (!createdNos.sucursales || createdNos.sucursales.length === 0) {
    createdNos.sucursales = [
      {
        id: createdNos.id + 100,
        nombre: data.nombreSucursal || "Establecimiento Central",
        direccion: data.direccionSucursal || createdNos.direccion || "Direcciรณn Principal",
        nosocomioId: createdNos.id,
      },
    ];
  }

  try {
    const generatedRooms = [];
    let rIdSeq = Date.now();
    let bIdSeq = Date.now() + 10000;
    const generatedFloors = (data.pisos || []).map((floorSpec, fIdx) => ({
      id: fIdx + 1,
      nombre: floorSpec.nombre || `Piso ${fIdx + 1}`,
      tipo: floorSpec.tipo || "General",
      tipoKey: floorSpec.tipoKey || "general",
      roomCount: parseInt(floorSpec.cantidadHabitaciones, 10) || 2,
    }));

    (data.pisos || []).forEach((floorSpec, fIdx) => {
      const fId = fIdx + 1;
      const habCount = parseInt(floorSpec.cantidadHabitaciones, 10) || 2;
      const bedCount = parseInt(floorSpec.camasPorHabitacion, 10) || 2;

      for (let r = 1; r <= habCount; r++) {
        const roomNum = fId * 100 + r;
        const roomId = rIdSeq++;
        const beds = [];
        for (let b = 1; b <= bedCount; b++) {
          beds.push({
            id: bIdSeq++,
            number: b,
            status: "disponible",
            patient: null,
          });
        }
        generatedRooms.push({
          id: roomId,
          number: roomNum,
          floorId: fId,
          floor: floorSpec.nombre || `Piso ${fId}`,
          type: floorSpec.tipo || "General",
          typeKey: floorSpec.tipoKey || "general",
          beds,
        });
      }
    });

    const sucursalId = createdNos?.sucursales?.[0]?.id;
    if (generatedRooms.length > 0) {
      saveStoredRooms(generatedRooms, sucursalId);
    }
    if (generatedFloors.length > 0) {
      saveStoredFloors(generatedFloors, sucursalId);
    }
  } catch (e) {
    console.error("Error al generar habitaciones para nuevo hospital:", e);
  }

  const currentStore = getStoredNosocomios();
  const updatedList = [...currentStore, createdNos];
  saveStoredNosocomios(updatedList);
  return createdNos;
}

export async function updateNosocomio(id, data) {
  let updated = { id, ...data };
  try {
    const res = await fetchWithTimeout(`${API_BASE}/superadmin/nosocomios/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (res.ok) {
      const serverUpdated = await res.json();
      updated = { ...updated, ...serverUpdated };
    }
  } catch (err) {
    warnOnce("updateNos", "Actualizaciรณn local de nosocomio por fallback:", err);
  }
  const currentStore = getStoredNosocomios();
  const updatedList = currentStore.map((n) => (n.id.toString() === id.toString() ? { ...n, ...updated } : n));
  saveStoredNosocomios(updatedList);
  return updated;
}

export async function updateSucursal(id, data) {
  let updated = { id, ...data };
  try {
    const res = await fetchWithTimeout(`${API_BASE}/superadmin/sucursales/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (res.ok) {
      const serverUpdated = await res.json();
      updated = { ...updated, ...serverUpdated };
    }
  } catch (err) {
    warnOnce("updateSuc", "Actualizaciรณn local de sucursal por fallback:", err);
  }
  const currentStore = getStoredNosocomios();
  const updatedList = currentStore.map((n) => ({
    ...n,
    sucursales: (n.sucursales || []).map((s) => (s.id.toString() === id.toString() ? { ...s, ...updated } : s)),
  }));
  saveStoredNosocomios(updatedList);
  return updated;
}

export async function createFloor(data, sucursalId = null) {
  const sId = sucursalId || data?.sucursalId;
  let created = null;
  try {
    const res = await fetchWithTimeout(`${API_BASE}/floors`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (res.ok) created = await res.json();
  } catch (err) {
    warnOnce("createFloor", "Creaciรณn local de piso por fallback:", err);
  }

  if (!created) {
    created = { id: Date.now(), ...data, roomCount: 0 };
  }

  if (sId) {
    const currentFloors = getStoredFloors(sId);
    const updatedFloors = [...currentFloors, created];
    saveStoredFloors(updatedFloors, sId);
  }

  return created;
}

export async function updateFloor(id, data, sucursalId = null) {
  const targetSucursalId = sucursalId || data?.sucursalId;
  let updatedFloor = null;
  try {
    const res = await fetchWithTimeout(`${API_BASE}/floors/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (res.ok) {
      updatedFloor = await res.json();
    }
  } catch (err) {
    warnOnce("updateFloor", "Actualizaciรณn local de piso por fallback:", err);
  }

  if (!updatedFloor) {
    updatedFloor = { id, ...data };
  }

  if (targetSucursalId) {
    const currentFloors = getStoredFloors(targetSucursalId);
    const exists = currentFloors.some((f) => String(f.id) === String(id) || f.nombre?.trim().toLowerCase() === data.nombre?.trim().toLowerCase());
    let updatedFloors;
    if (exists) {
      updatedFloors = currentFloors.map((f) => {
        if (String(f.id) === String(id) || f.nombre?.trim().toLowerCase() === data.nombre?.trim().toLowerCase()) {
          return { ...f, ...updatedFloor };
        }
        return f;
      });
    } else {
      updatedFloors = [...currentFloors, updatedFloor];
    }
    saveStoredFloors(updatedFloors, targetSucursalId);

    const floorNumData = parseInt(data.nombre?.replace(/\D/g, ""), 10);
    const currentRooms = getStoredRooms(targetSucursalId);
    if (Array.isArray(currentRooms) && currentRooms.length > 0) {
      const updatedRooms = currentRooms.map((r) => {
        const rFloorNum = r.floorId ? parseInt(r.floorId, 10) : Math.floor((r.number || 101) / 100);
        const matchesId = r.floorId?.toString() === id?.toString();
        const matchesName = r.floor && r.floor.trim().toLowerCase() === data.nombre?.trim().toLowerCase();
        const matchesNum = Boolean(floorNumData && floorNumData === rFloorNum);

        if (matchesId || matchesName || matchesNum) {
          return {
            ...r,
            floor: data.nombre || r.floor,
            type: data.tipo || data.type || r.type,
            typeKey: data.tipoKey || data.typeKey || r.typeKey,
          };
        }
        return r;
      });
      saveStoredRooms(updatedRooms, targetSucursalId);
    }
  }

  return updatedFloor;
}

export async function deleteFloor(id, sucursalId = null) {
  try {
    await fetchWithTimeout(`${API_BASE}/floors/${id}`, {
      method: "DELETE",
    });
  } catch (err) {
    warnOnce("deleteFloor", "Eliminaciรณn local de piso por fallback:", err);
  }

  if (sucursalId) {
    const currentFloors = getStoredFloors(sucursalId);
    const updatedFloors = currentFloors.filter((f) => f.id.toString() !== id.toString());
    saveStoredFloors(updatedFloors, sucursalId);

    const currentRooms = getStoredRooms(sucursalId);
    const updatedRooms = currentRooms.filter((r) => r.floorId?.toString() !== id.toString());
    saveStoredRooms(updatedRooms, sucursalId);
  }

  return true;
}

export async function getStaffUsers(nosocomioId = null, sucursalId = null) {
  try {
    let url = `${API_BASE}/superadmin/users`;
    const params = new URLSearchParams();
    if (nosocomioId) params.append("nosocomioId", nosocomioId);
    if (sucursalId) params.append("sucursalId", sucursalId);
    if (params.toString()) url += `?${params.toString()}`;

    const res = await fetchWithTimeout(url);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data)) {
        saveStoredStaffUsers(data);
        return filterUsersBySucursal(data, nosocomioId, sucursalId);
      }
    }
    return getFallbackStaffUsers(nosocomioId, sucursalId);
  } catch (err) {
    warnOnce("staff", "Usando lista local de usuarios staff:", err);
    return getFallbackStaffUsers(nosocomioId, sucursalId);
  }
}

function getFallbackStaffUsers(nosocomioId = null, sucursalId = null) {
  return filterUsersBySucursal(getStoredStaffUsers(), nosocomioId, sucursalId);
}

function filterUsersBySucursal(users, nosocomioId, sucursalId) {
  if (!nosocomioId && !sucursalId) return users;
  return users.filter((u) => {
    if (nosocomioId && u.nosocomioId && String(u.nosocomioId) !== String(nosocomioId)) {
      return false;
    }
    if (sucursalId && u.sucursalId && String(u.sucursalId) !== String(sucursalId)) {
      return false;
    }
    return true;
  });
}

export async function createStaffUser(userData) {
  let created = null;
  try {
    const res = await fetchWithTimeout(`${API_BASE}/superadmin/users`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(userData),
    });
    if (res.ok) {
      created = await res.json();
    }
  } catch (err) {
    warnOnce("createUser", "Creaciรณn local de usuario por fallback:", err);
  }

  if (!created) {
    const createdId = Date.now();
    const allNos = getFallbackNosocomios();
    const matchedNos = allNos.find((n) => n.id.toString() === userData.nosocomioId?.toString());
    created = {
      id: createdId,
      nombre: userData.nombre,
      email: userData.email,
      password: userData.password || "123456",
      rol: normalizeRole(userData.rol),
      activo: userData.activo !== false,
      nosocomioId: userData.nosocomioId ? parseInt(userData.nosocomioId, 10) : null,
      sucursalId: userData.sucursalId ? parseInt(userData.sucursalId, 10) : null,
      hospitalNombre: matchedNos?.nombre || "Hospital Asignado",
    };
  }

  const currentStaff = getStoredStaffUsers();
  const exists = currentStaff.some((u) => u.id.toString() === created.id.toString());
  const updated = exists
    ? currentStaff.map((u) => (u.id.toString() === created.id.toString() ? created : u))
    : [...currentStaff, created];
  saveStoredStaffUsers(updated);
  return created;
}

export async function updateStaffUser(id, userData) {
  let updatedObj = { id, ...userData };
  try {
    const res = await fetchWithTimeout(`${API_BASE}/superadmin/users/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(userData),
    });
    if (res.ok) {
      const serverRes = await res.json();
      updatedObj = { ...updatedObj, ...serverRes };
    }
  } catch (err) {}
  const currentStaff = getStoredStaffUsers();
  const updated = currentStaff.map((u) => (u.id.toString() === id.toString() ? { ...u, ...updatedObj } : u));
  saveStoredStaffUsers(updated);
  return updatedObj;
}

export async function deleteStaffUser(id) {
  try {
    await fetchWithTimeout(`${API_BASE}/superadmin/users/${id}`, { method: "DELETE" });
  } catch (err) {}
  const currentStaff = getStoredStaffUsers();
  const updated = currentStaff.filter((u) => u.id.toString() !== id.toString());
  saveStoredStaffUsers(updated);
  return true;
}

export async function getAuditLogs(sucursalId = null, nosocomioId = null, camaId = null) {
  let targetSucursalId = sucursalId;
  let targetNosocomioId = nosocomioId;
  let targetCamaId = camaId;

  if (typeof sucursalId === "object" && sucursalId !== null) {
    targetSucursalId = sucursalId.sucursalId;
    targetNosocomioId = sucursalId.nosocomioId;
    targetCamaId = sucursalId.camaId;
  }

  try {
    let url = `${API_BASE}/superadmin/audit-logs`;
    const params = new URLSearchParams();
    if (targetCamaId) params.append("camaId", targetCamaId);
    if (targetSucursalId) params.append("sucursalId", targetSucursalId);
    if (targetNosocomioId) params.append("nosocomioId", targetNosocomioId);
    if (params.toString()) url += `?${params.toString()}`;

    const res = await fetchWithTimeout(url);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data)) return data;
    }
  } catch (err) {}

  const localLogs = getStoredAuditLogs(targetSucursalId);
  if (targetCamaId) {
    return localLogs.filter((l) => String(l.camaId) === String(targetCamaId));
  }
  return localLogs;
}
