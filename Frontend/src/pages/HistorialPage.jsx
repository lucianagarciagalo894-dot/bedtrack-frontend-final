import { useState, useEffect } from "react";
import { FaHistory, FaSearch, FaUserNurse, FaExchangeAlt, FaBed, FaSyncAlt } from "react-icons/fa";
import { getGlobalAuditHistory } from "../services/roomService";
import BedHistoryModal from "../components/BedHistoryModal";

export default function HistorialPage({ role, sessionHospital }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("todos");
  const [historyBed, setHistoryBed] = useState(null);

  const activeSucursalId = sessionHospital?.sucursalId || sessionHospital?.nosocomioId;

  const fetchLogs = () => {
    setLoading(true);
    getGlobalAuditHistory(activeSucursalId, sessionHospital?.nosocomioId)
      .then((data) => {
        setLogs(data || []);
      })
      .catch((err) => console.error("Error al cargar historial de auditoría:", err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchLogs();

    const handleUpdated = () => fetchLogs();
    window.addEventListener("bedtrack_audit_updated", handleUpdated);
    window.addEventListener("bedtrack_rooms_updated", handleUpdated);

    return () => {
      window.removeEventListener("bedtrack_audit_updated", handleUpdated);
      window.removeEventListener("bedtrack_rooms_updated", handleUpdated);
    };
  }, [activeSucursalId, sessionHospital?.nosocomioId]);

  const filteredLogs = logs.filter((log) => {
    const query = searchQuery.toLowerCase();
    const matchesQuery = !searchQuery ||
      (log.usuarioNombre && log.usuarioNombre.toLowerCase().includes(query)) ||
      (log.usuarioEmail && log.usuarioEmail.toLowerCase().includes(query)) ||
      (log.accion && log.accion.toLowerCase().includes(query)) ||
      (log.camaNumero && log.camaNumero.toString().includes(query)) ||
      (log.habitacionNumero && log.habitacionNumero.toString().includes(query));

    const rLog = (log.usuarioRol || "").toLowerCase();
    const matchesRole = roleFilter === "todos" ||
      !roleFilter ||
      (roleFilter === "enfermeria" && (rLog.includes("enferm") || rLog === "enfermeria")) ||
      (roleFilter === "encargado" && (rLog.includes("encargad") || rLog.includes("admin") || rLog.includes("dev")));

    return matchesQuery && matchesRole;
  });

  const getRoleBadgeStyle = (roleStr) => {
    const r = (roleStr || "enfermeria").toLowerCase();
    if (r.includes("superadmin") || r.includes("developer") || r.includes("desarrollador") || r.includes("dev")) {
      return { background: "#EDE9FE", color: "#6D28D9", label: roleStr || "Desarrollador" };
    }
    if (r.includes("encargado") || r.includes("admin")) {
      return { background: "#FEF3C7", color: "#D97706", label: roleStr || "Encargado / Admin" };
    }
    return { background: "#DBEAFE", color: "#1D4ED8", label: roleStr || "Enfermería" };
  };

  return (
    <div style={{ padding: "24px", maxWidth: "1200px", margin: "0 auto" }}>
      {/* Header Banner */}
      <div
        style={{
          background: "linear-gradient(135deg, #1E293B 0%, #0F172A 100%)",
          borderRadius: "16px",
          padding: "24px 32px",
          color: "#FFFFFF",
          marginBottom: "24px",
          boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "16px",
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
            <div
              style={{
                background: "rgba(59, 130, 246, 0.2)",
                color: "#60A5FA",
                padding: "8px",
                borderRadius: "10px",
                fontSize: "20px",
                display: "flex",
              }}
            >
              <FaHistory />
            </div>
            <h1 style={{ margin: 0, fontSize: "1.5rem", fontWeight: "700" }}>
              Historial de Actividad y Auditoría
            </h1>
          </div>
          <p style={{ margin: 0, color: "#94A3B8", fontSize: "0.9rem" }}>
            Registro en tiempo real de todos los cambios de estado, asignaciones e intervenciones en camas.
          </p>
        </div>

        <button
          onClick={fetchLogs}
          disabled={loading}
          style={{
            background: "#2563EB",
            color: "#FFFFFF",
            border: "none",
            borderRadius: "8px",
            padding: "10px 18px",
            fontWeight: "600",
            fontSize: "0.875rem",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "8px",
            transition: "all 0.2s ease",
          }}
        >
          <FaSyncAlt className={loading ? "spin" : ""} />
          {loading ? "Actualizando..." : "Refrescar Registros"}
        </button>
      </div>

      {/* Main Container */}
      <div
        style={{
          background: "#FFFFFF",
          borderRadius: "16px",
          border: "1px solid #E2E8F0",
          boxShadow: "0 4px 6px -1px rgba(0,0,0,0.05)",
          padding: "24px",
        }}
      >
        {/* Filters */}
        <div style={{ display: "flex", gap: "16px", marginBottom: "20px", flexWrap: "wrap" }}>
          <div style={{ position: "relative", flex: 1, minWidth: "260px" }}>
            <FaSearch
              style={{
                position: "absolute",
                left: "14px",
                top: "50%",
                transform: "translateY(-50%)",
                color: "#94A3B8",
              }}
            />
            <input
              type="text"
              placeholder="Buscar por operador, email, n° de cama o acción..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: "100%",
                padding: "10px 14px 10px 40px",
                borderRadius: "8px",
                border: "1px solid #CBD5E1",
                fontSize: "0.9rem",
                boxSizing: "border-box",
              }}
            />
          </div>

          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            style={{
              padding: "10px 14px",
              borderRadius: "8px",
              border: "1px solid #CBD5E1",
              fontSize: "0.9rem",
              background: "#FFFFFF",
              cursor: "pointer",
            }}
          >
            <option value="todos">Todos los Roles de Usuario</option>
            <option value="enfermeria">Enfermería</option>
            <option value="encargado">Encargado / Administrador</option>
          </select>
        </div>

        {/* Audit List */}
        {loading ? (
          <div style={{ textAlign: "center", padding: "48px", color: "#64748B" }}>
            Cargando historial de auditoría...
          </div>
        ) : filteredLogs.length === 0 ? (
          <div style={{ textAlign: "center", padding: "48px", color: "#64748B" }}>
            {searchQuery || roleFilter !== "todos"
              ? "No se encontraron registros que coincidan con los filtros aplicados."
              : "Aún no se han registrado eventos de cambio en las camas."}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {filteredLogs.map((log) => {
              const roleBadge = getRoleBadgeStyle(log.usuarioRol);
              return (
                <div
                  key={log.id || Math.random()}
                  style={{
                    padding: "16px",
                    borderRadius: "12px",
                    border: "1px solid #E2E8F0",
                    background: "#F8FAFC",
                    display: "flex",
                    flexDirection: "column",
                    gap: "8px",
                    transition: "border-color 0.2s ease, box-shadow 0.2s ease",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <FaUserNurse style={{ color: "#2563EB", fontSize: "18px" }} />
                      <span style={{ fontWeight: "700", fontSize: "0.95rem", color: "#1E293B" }}>
                        {log.usuarioNombre || "Usuario del Sistema"}
                      </span>
                      <span
                        style={{
                          fontSize: "0.725rem",
                          background: roleBadge.background,
                          color: roleBadge.color,
                          padding: "2px 8px",
                          borderRadius: "6px",
                          fontWeight: "600",
                          textTransform: "capitalize",
                        }}
                      >
                        {roleBadge.label}
                      </span>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                      <span style={{ fontSize: "0.8rem", color: "#64748B", fontWeight: "600" }}>
                        🕒 {log.fechaHora || "Recientemente"}
                      </span>
                      {log.camaId && (
                        <button
                          onClick={() => setHistoryBed({ id: log.camaId, number: log.camaNumero, roomNumber: log.habitacionNumero })}
                          style={{
                            background: "#DBEAFE",
                            color: "#1D4ED8",
                            border: "none",
                            borderRadius: "6px",
                            padding: "4px 10px",
                            fontSize: "0.75rem",
                            fontWeight: "600",
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            gap: "4px",
                          }}
                        >
                          <FaBed size={12} />
                          Ver Trazabilidad Cama #{log.camaNumero}
                        </button>
                      )}
                    </div>
                  </div>

                  <div style={{ fontSize: "0.9rem", color: "#334155", fontWeight: "500" }}>
                    <strong>Habitación #{log.habitacionNumero || log.habitacionId} &middot; Cama #{log.camaNumero}:</strong> {log.accion}
                  </div>

                  {log.usuarioEmail && (
                    <div style={{ fontSize: "0.775rem", color: "#94A3B8" }}>
                      📧 {log.usuarioEmail}
                    </div>
                  )}

                  {(log.estadoAnterior || log.estadoNuevo) && (
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.775rem", marginTop: "4px" }}>
                      <span style={{ textTransform: "capitalize", background: "#E2E8F0", padding: "2px 8px", borderRadius: "4px", color: "#475569" }}>
                        Anterior: {log.estadoAnterior || "nuevo"}
                      </span>
                      <FaExchangeAlt style={{ fontSize: "11px", color: "#94A3B8" }} />
                      <span style={{ textTransform: "capitalize", background: "#DBEAFE", color: "#1D4ED8", padding: "2px 8px", borderRadius: "4px", fontWeight: "600" }}>
                        Nuevo: {log.estadoNuevo || "disponible"}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal trazabilidad */}
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
