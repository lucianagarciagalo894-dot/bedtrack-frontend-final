import { useState, useMemo, useEffect } from "react";
import { Link } from "react-router-dom";
import BedHistoryModal from "../components/BedHistoryModal";
import {
  FaBed,
  FaCheckCircle,
  FaTimesCircle,
  FaBroom,
  FaArrowRight,
  FaExclamationCircle,
  FaHistory,
  FaUserNurse,
} from "react-icons/fa";
import { getGlobalAuditHistory, getFloors } from "../services/roomService";

export default function Dashboard({ role, sessionHospital, beds }) {
  const userName = role === "enfermeria" ? "Enfermero/a" : "Encargado";
  const [recentLogs, setRecentLogs] = useState([]);
  const [userFilter, setUserFilter] = useState("");
  const [roleFilter, setRoleFilter] = useState("todos");
  const [historyBed, setHistoryBed] = useState(null);
  const [definedFloors, setDefinedFloors] = useState([]);

  const activeSucursalId = sessionHospital?.sucursalId || sessionHospital?.nosocomioId;

  useEffect(() => {
    if (activeSucursalId) {
      getFloors(activeSucursalId)
        .then((fList) => {
          if (Array.isArray(fList) && fList.length > 0) {
            setDefinedFloors(fList.map((f) => f.nombre));
          }
        })
        .catch(() => {});
    }
  }, [activeSucursalId]);

  const fetchAuditLogs = () => {
    getGlobalAuditHistory(activeSucursalId, sessionHospital?.nosocomioId)
      .then((data) => setRecentLogs(data || []))
      .catch((err) => console.warn("Error obteniendo historial reciente:", err));
  };

  useEffect(() => {
    fetchAuditLogs();

    const handleAuditUpdated = () => {
      fetchAuditLogs();
    };

    window.addEventListener("bedtrack_audit_updated", handleAuditUpdated);
    window.addEventListener("bedtrack_rooms_updated", handleAuditUpdated);
    window.addEventListener("bedtrack_floors_updated", handleAuditUpdated);

    return () => {
      window.removeEventListener("bedtrack_audit_updated", handleAuditUpdated);
      window.removeEventListener("bedtrack_rooms_updated", handleAuditUpdated);
      window.removeEventListener("bedtrack_floors_updated", handleAuditUpdated);
    };
  }, [activeSucursalId, sessionHospital?.nosocomioId]);

  const totalBeds = beds.length;
  const totalAvailable = beds.filter((b) => b.status?.toLowerCase() === "disponible").length;
  const totalOccupied = beds.filter((b) => b.status?.toLowerCase() === "ocupada").length;
  const totalCleaning = beds.filter((b) => b.status?.toLowerCase() === "enlimpieza").length;

  const floorList = useMemo(() => {
    const fromBeds = Array.from(new Set(beds.map((b) => b.floor?.trim()).filter(Boolean)));
    const combined = Array.from(new Set([...definedFloors, ...fromBeds]));
    combined.sort((a, b) => {
      const numA = parseInt(a.replace(/\D/g, ""), 10);
      const numB = parseInt(b.replace(/\D/g, ""), 10);
      if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
      return a.localeCompare(b);
    });
    return combined.length > 0 ? combined : ["Piso 1"];
  }, [definedFloors, beds]);

  const floorStats = floorList.map((floor) => {
    const fb = beds.filter((b) => b.floor?.trim() === floor);
    return {
      floor,
      total: fb.length,
      available: fb.filter((b) => b.status?.toLowerCase() === "disponible").length,
      occupied: fb.filter((b) => b.status?.toLowerCase() === "ocupada").length,
      cleaning: fb.filter((b) => b.status?.toLowerCase() === "enlimpieza").length,
    };
  });

  const criticalFloors = floorStats.filter((f) => f.total > 0 && f.available < 3);

  // Derivar la lista de roles presentes para el filtro
  const logRoles = Array.from(
    new Set(
      recentLogs
        .map((l) => l.usuarioRol?.toLowerCase())
        .filter(Boolean)
        .concat(["enfermeria", "encargado", "administrador", "developer", "superadmin"])
    )
  );

  return (
    <div className="page-wrapper">
      {/* Welcome header */}
      <div className="dashboard-welcome">
        <div>
          <h1 className="page-title">Bienvenido/a, {userName}</h1>
          <p className="page-subtitle">
            Resumen general &middot; {sessionHospital?.hospital || "Hospital Central"} (
            {sessionHospital?.sede || sessionHospital?.establecimiento || "Establecimiento Central"})
          </p>
        </div>
        <Link to="/camas" className="btn-go-beds">
          {role === "encargado" ? "Ver camas" : "Gestionar camas"}
          <FaArrowRight size={13} />
        </Link>
      </div>

      {/* Critical alert */}
      {criticalFloors.length > 0 && (
        <div className="alert alert-warning" role="alert">
          <span className="alert-icon" aria-hidden="true">
            <FaExclamationCircle />
          </span>
          <span>
            <strong>
              {criticalFloors.map((f) => f.floor).join(", ")}
            </strong>{" "}
            {criticalFloors.length === 1 ? "tiene" : "tienen"} menos de 3 camas disponibles.
          </span>
        </div>
      )}

      {/* Global stats */}
      <div
        className="stats-grid stats-grid-4"
        role="region"
        aria-label="Estadísticas globales"
      >
        <div className="stat-card">
          <div className="stat-icon stat-icon-primary" aria-hidden="true">
            <FaBed />
          </div>
          <div className="stat-info">
            <div className="stat-value">{totalBeds}</div>
            <div className="stat-label">Total de camas</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon success" aria-hidden="true">
            <FaCheckCircle />
          </div>
          <div className="stat-info">
            <div className="stat-value">{totalAvailable}</div>
            <div className="stat-label">Disponibles</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon error" aria-hidden="true">
            <FaTimesCircle />
          </div>
          <div className="stat-info">
            <div className="stat-value">{totalOccupied}</div>
            <div className="stat-label">Ocupadas</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon cleaning" aria-hidden="true">
            <FaBroom />
          </div>
          <div className="stat-info">
            <div className="stat-value">{totalCleaning}</div>
            <div className="stat-label">En limpieza</div>
          </div>
        </div>
      </div>

      {/* Floor breakdown */}
      <div className="dashboard-section">
        <div className="dashboard-section-header">
          <h2 className="beds-section-title">Estado por piso</h2>
          <div className="floor-legend">
            <span className="legend-item">
              <span className="legend-dot legend-dot-success" />
              Disponible
            </span>
            <span className="legend-item">
              <span className="legend-dot legend-dot-error" />
              Ocupada
            </span>
            <span className="legend-item">
              <span className="legend-dot legend-dot-cleaning" />
              En limpieza
            </span>
          </div>
        </div>

        <div className="floor-breakdown">
          {floorStats.map(({ floor, total, available, occupied, cleaning }) => (
            <div key={floor} className="floor-row">
              <span className="floor-row-name">{floor}</span>

              <div className="floor-row-bars" aria-label={`${floor}: ${available} disponibles, ${occupied} ocupadas, ${cleaning} en limpieza`}>
                {available > 0 && (
                  <div
                    className="floor-bar floor-bar-available"
                    style={{ width: `${total > 0 ? (available / total) * 100 : 0}%` }}
                    title={`${available} disponibles`}
                  />
                )}
                {occupied > 0 && (
                  <div
                    className="floor-bar floor-bar-occupied"
                    style={{ width: `${total > 0 ? (occupied / total) * 100 : 0}%` }}
                    title={`${occupied} ocupadas`}
                  />
                )}
                {cleaning > 0 && (
                  <div
                    className="floor-bar floor-bar-cleaning"
                    style={{ width: `${total > 0 ? (cleaning / total) * 100 : 0}%` }}
                    title={`${cleaning} en limpieza`}
                  />
                )}
              </div>

              <div className="floor-row-chips">
                <span className="floor-chip floor-chip-available">{available}</span>
                <span className="floor-chip floor-chip-occupied">{occupied}</span>
                <span className="floor-chip floor-chip-cleaning">{cleaning}</span>
              </div>

              <Link to={`/camas?floor=${encodeURIComponent(floor)}`} className="floor-row-link" aria-label={`Ver camas del ${floor}`}>
                Ver →
              </Link>
            </div>
          ))}
        </div>
      </div>

      {/* Historial Reciente de Actividad Asistencial y Administrativa */}
      <div className="dashboard-section" style={{ marginTop: "24px" }}>
        <div className="dashboard-section-header">
          <h2 className="beds-section-title" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <FaHistory style={{ color: "#2563EB" }} /> Historial General de Actividad Hospitalaria
          </h2>
        </div>

        <div style={{ background: "var(--card-bg, #FFFFFF)", padding: "16px", borderRadius: "12px", border: "1px solid var(--border, #E2E8F0)" }}>
          <div style={{ display: "flex", gap: "12px", marginBottom: "16px", flexWrap: "wrap" }}>
            <input
              type="text"
              placeholder="🔍 Buscar por nombre, email o acción del usuario..."
              value={userFilter}
              onChange={(e) => setUserFilter(e.target.value)}
              style={{ padding: "8px 12px", borderRadius: "8px", border: "1px solid #CBD5E1", fontSize: "0.85rem", flex: 1, minWidth: "220px" }}
            />
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              style={{ padding: "8px 12px", borderRadius: "8px", border: "1px solid #CBD5E1", fontSize: "0.85rem" }}
            >
              <option value="todos">Todos los Roles del Hospital</option>
              <option value="enfermeria">Enfermería</option>
              <option value="encargado">Encargado / Administrador</option>
            </select>
          </div>

          {(() => {
            const filtered = recentLogs.filter((log) => {
              const query = userFilter.toLowerCase();
              const matchesUser = !userFilter ||
                (log.usuarioNombre && log.usuarioNombre.toLowerCase().includes(query)) ||
                (log.usuarioEmail && log.usuarioEmail.toLowerCase().includes(query)) ||
                (log.accion && log.accion.toLowerCase().includes(query));

              const rLog = (log.usuarioRol || "").toLowerCase();
              const matchesRole = roleFilter === "todos" ||
                !roleFilter ||
                (roleFilter === "enfermeria" && (rLog.includes("enferm") || rLog === "enfermeria")) ||
                (roleFilter === "encargado" && (rLog.includes("encargad") || rLog.includes("admin") || rLog.includes("dev")));
              return matchesUser && matchesRole;
            });

            if (filtered.length === 0) {
              return (
                <p style={{ fontSize: "0.875rem", color: "var(--text-muted, #64748B)" }}>
                  No se encontraron actividades registradas con los filtros seleccionados.
                </p>
              );
            }

            return (
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {filtered.slice(0, 15).map((log) => (
                  <div
                    key={log.id || Math.random()}
                    onClick={() => {
                      if (log.camaId) {
                        setHistoryBed({ id: log.camaId, number: log.camaNumero, roomNumber: log.habitacionNumero });
                      }
                    }}
                    title="Haz clic para ver el historial detallado de esta cama"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "10px 14px",
                      background: "#F8FAFC",
                      borderRadius: "8px",
                      border: "1px solid #E2E8F0",
                      fontSize: "0.85rem",
                      cursor: log.camaId ? "pointer" : "default",
                      transition: "background 0.2s ease",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "#F1F5F9")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "#F8FAFC")}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                      <FaUserNurse style={{ color: "#2563EB", fontSize: "18px" }} />
                      <div>
                        <div style={{ fontWeight: "600", color: "#1E293B", display: "flex", alignItems: "center", gap: "8px" }}>
                          <span>{log.usuarioNombre || "Usuario del Sistema"}</span>
                          <span style={{ fontSize: "0.7rem", background: "#DBEAFE", color: "#1D4ED8", padding: "2px 6px", borderRadius: "4px", fontWeight: "600", textTransform: "capitalize" }}>
                            {log.usuarioRol || "enfermeria"}
                          </span>
                        </div>
                        <div style={{ fontSize: "0.75rem", color: "#64748B" }}>
                          Hab #{log.habitacionNumero} - Cama #{log.camaNumero}: {log.accion}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                      <span style={{ fontSize: "0.75rem", color: "#94A3B8", whiteSpace: "nowrap" }}>
                        {log.fechaHora}
                      </span>
                      {log.camaId && (
                        <span style={{ fontSize: "0.75rem", color: "#2563EB", fontWeight: "600" }}>
                          Ver trazabilidad →
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            );
          })()}
        </div>
      </div>

      {/* Modal de historial de cama al hacer clic en un registro */}
      {historyBed && (
        <BedHistoryModal
          bed={historyBed}
          room={{ number: historyBed.roomNumber }}
          onClose={() => setHistoryBed(null)}
        />
      )}
    </div>
  );
}

