import React, { useState, useMemo, useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { FaBars } from "react-icons/fa";
import Sidebar from "./components/Sidebar";
import Login from "./pages/Login";
import DevLogin from "./pages/DevLogin";
import SuperAdminPanel from "./pages/SuperAdminPanel";
import Dashboard from "./pages/Dashboard";
import Beds from "./pages/Beds";
import Habitaciones from "./pages/Habitaciones";
import RoomDetail from "./pages/RoomDetail";
import Pacientes from "./pages/Pacientes";
import HistorialPage from "./pages/HistorialPage";
import { getAllRooms, updateBedStatus } from "./services/roomService";
import { getNosocomios, getStaffUsers, normalizeRole } from "./services/superAdminService";

const VALID_TRANSITIONS = {
  disponible: ["ocupada", "enlimpieza"],
  ocupada:    ["enlimpieza", "ocupada"],
  enlimpieza:   ["disponible", "ocupada"],
};

function AppContent() {
  const [role, setRole] = useState(() => {
    try {
      const stored = localStorage.getItem("bedtrack_role");
      return stored && stored !== "superadmin" && stored !== "developer" ? stored : null;
    } catch (e) {
      return null;
    }
  });

  const [devRole, setDevRole] = useState(() => {
    try {
      let storedDev = localStorage.getItem("bedtrack_dev_role");
      if (!storedDev) {
        const storedRole = localStorage.getItem("bedtrack_role");
        if (storedRole === "superadmin" || storedRole === "developer") {
          storedDev = storedRole;
          try {
            localStorage.setItem("bedtrack_dev_role", storedDev);
          } catch (e) {}
        }
      }
      return storedDev || null;
    } catch (e) {
      return null;
    }
  });

  const [sessionHospital, setSessionHospital] = useState(() => {
    try {
      const stored = localStorage.getItem("bedtrack_session_hospital");
      return stored ? JSON.parse(stored) : null;
    } catch (e) {
      return null;
    }
  });

  const [sidebarOpen, setSidebarOpen]         = useState(false);
  const [rooms, setRooms]                     = useState(() => {
    try {
      const storedHosp = localStorage.getItem("bedtrack_session_hospital");
      const hospObj = storedHosp ? JSON.parse(storedHosp) : null;
      const activeSucursalId = hospObj?.sucursalId || hospObj?.nosocomioId;
      return getStoredRooms(activeSucursalId);
    } catch (e) {
      return [];
    }
  });
  const location = useLocation();

  const handleLogout = () => {
    setRole(null);
    setSessionHospital(null);
    try {
      localStorage.removeItem("bedtrack_role");
      localStorage.removeItem("bedtrack_session_hospital");
    } catch (e) {
      console.error("Error eliminando sesión de hospital de localStorage:", e);
    }
  };

  const handleDevLogout = () => {
    setDevRole(null);
    try {
      localStorage.removeItem("bedtrack_dev_role");
    } catch (e) {
      console.error("Error eliminando sesión de desarrollador de localStorage:", e);
    }
  };

  const handleDevLogin = (selectedDevRole) => {
    setDevRole(selectedDevRole);
    try {
      localStorage.setItem("bedtrack_dev_role", selectedDevRole);
    } catch (e) {}
  };

  const handleUserLogin = (selectedRole, hospitalData = null) => {
    if (selectedRole === "superadmin" || selectedRole === "developer") {
      handleDevLogin(selectedRole);
      return;
    }

    setRole(selectedRole);
    try {
      if (selectedRole) {
        localStorage.setItem("bedtrack_role", selectedRole);
      } else {
        localStorage.removeItem("bedtrack_role");
      }
    } catch (e) {
      console.error("Error guardando rol en localStorage:", e);
    }

    if (hospitalData) {
      setSessionHospital(hospitalData);
      try {
        localStorage.setItem("bedtrack_session_hospital", JSON.stringify(hospitalData));
      } catch (e) {
        console.error("Error guardando datos de hospital en localStorage:", e);
      }
    } else {
      setSessionHospital(null);
      try {
        localStorage.removeItem("bedtrack_session_hospital");
      } catch (e) {}
    }
  };

  const fetchRooms = () => {
    const activeSucursalId = sessionHospital?.sucursalId || sessionHospital?.nosocomioId;
    getAllRooms(activeSucursalId)
      .then((data) => setRooms(data))
      .catch((err) => console.error("Error cargando habitaciones para la institución", err));
  };

  useEffect(() => {
    if (role) {
      fetchRooms();
      const timer = setInterval(() => {
        fetchRooms();
      }, 30000);
      return () => clearInterval(timer);
    }
  }, [role, sessionHospital]);

  useEffect(() => {
    const handleRoomsUpdated = () => {
      fetchRooms();
    };

    const handleHospitalsUpdated = async () => {
      if (!sessionHospital) return;
      try {
        const nosData = await getNosocomios();
        if (!nosData || nosData.length === 0) return;
        const activeNosId = sessionHospital.nosocomioId?.toString();
        const matchedNos = nosData.find((n) => n.id?.toString() === activeNosId || n.nombre === sessionHospital.hospital);
        
        if (matchedNos && matchedNos.activo === false) {
          handleLogout();
          return;
        }

        if (!matchedNos) return;

        const activeSucId = sessionHospital.sucursalId?.toString();
        const matchedSuc = (matchedNos.sucursales || []).find((s) => s.id?.toString() === activeSucId || s.nombre === sessionHospital.sede);

        if (matchedSuc && matchedSuc.activo === false) {
          handleLogout();
          return;
        }

        const updatedHospitalData = {
          ...sessionHospital,
          hospital: matchedNos.nombre || sessionHospital.hospital,
          sede: matchedSuc?.nombre || sessionHospital.sede,
          establecimiento: matchedSuc?.nombre || sessionHospital.establecimiento,
        };

        setSessionHospital(updatedHospitalData);
        try {
          localStorage.setItem("bedtrack_session_hospital", JSON.stringify(updatedHospitalData));
        } catch (e) {}
      } catch (err) {}
    };

    const handleUsersUpdated = async () => {
      if (!role || role === "superadmin" || role === "developer" || !sessionHospital?.email) return;
      try {
        const activeEmail = sessionHospital.email.trim().toLowerCase();
        const activeNosId = sessionHospital.nosocomioId;
        const activeSucId = sessionHospital.sucursalId;
        const users = await getStaffUsers(activeNosId, activeSucId);
        if (!users || users.length === 0) return;
        const currentUser = users.find((u) => u.email && u.email.trim().toLowerCase() === activeEmail);

        if (currentUser && (currentUser.activo === false || normalizeRole(currentUser.rol) !== normalizeRole(role))) {
          handleLogout();
        }
      } catch (err) {}
    };

    const handleStorageEvent = (e) => {
      if (e.key === "bedtrack_role" && !e.newValue) {
        setRole(null);
        setSessionHospital(null);
      } else if (e.key === "bedtrack_dev_role" && !e.newValue) {
        setDevRole(null);
      } else if (e.key === "bedtrack_session_hospital" && e.newValue) {
        try {
          setSessionHospital(JSON.parse(e.newValue));
        } catch (err) {}
      } else if (e.key === "bedtrack_nosocomios_data") {
        handleHospitalsUpdated();
      } else if (e.key === "bedtrack_staff_users_data") {
        handleUsersUpdated();
      }
    };

    window.addEventListener("bedtrack_rooms_updated", handleRoomsUpdated);
    window.addEventListener("bedtrack_floors_updated", handleRoomsUpdated);
    window.addEventListener("bedtrack_hospitals_updated", handleHospitalsUpdated);
    window.addEventListener("bedtrack_users_updated", handleUsersUpdated);
    window.addEventListener("storage", handleStorageEvent);

    return () => {
      window.removeEventListener("bedtrack_rooms_updated", handleRoomsUpdated);
      window.removeEventListener("bedtrack_floors_updated", handleRoomsUpdated);
      window.removeEventListener("bedtrack_hospitals_updated", handleHospitalsUpdated);
      window.removeEventListener("bedtrack_users_updated", handleUsersUpdated);
      window.removeEventListener("storage", handleStorageEvent);
    };
  }, [role, sessionHospital]);

  const beds = useMemo(
    () =>
      rooms.flatMap((room) =>
        (room.beds || []).map((bed, bedIdx) => ({
          id:         bed.id,
          number:     bed.number ?? bed.numero ?? (bedIdx + 1),
          floor:      room.floor || `Piso ${room.floorId ?? 1}`,
          roomId:     room.id,
          roomNumber: room.number,
          status:     bed.status?.toLowerCase(),
          patient:    bed.patient,
        }))
      ),
    [rooms]
  );

  const changeStatus = async (bedId, newStatus, patientData = null) => {
    if (role !== "enfermeria") {
      alert("El rol de Encargado es de solo lectura. Solo el personal de Enfermería puede modificar estados de camas.");
      return;
    }

    const currentBed = rooms.flatMap((r) => r.beds || []).find((b) => b.id === bedId);
    const currentStatus = currentBed?.status?.toLowerCase();
    if (!currentBed || !VALID_TRANSITIONS[currentStatus]?.includes(newStatus)) {
      return;
    }

    try {
      const activeName =
        sessionHospital?.userName ||
        sessionHospital?.userNombre ||
        (sessionHospital?.email ? sessionHospital.email.split("@")[0] : null) ||
        (role === "enfermeria" ? "Lic. Personal de Enfermería" : "Encargado de Hospital");
      const activeEmail =
        sessionHospital?.email ||
        (role === "enfermeria" ? "enfermeria@hospital.com" : "encargado@hospital.com");

      const operatorInfo = {
        name: activeName,
        email: activeEmail,
        role: role || "enfermeria",
      };

      const activeSucursalId = sessionHospital?.sucursalId || sessionHospital?.nosocomioId;

      // 1. Actualización optimista INSTANTÁNEA en la interfaz del usuario (< 10 ms)
      setRooms((prev) =>
        prev.map((room) => ({
          ...room,
          beds: (room.beds || []).map((bed) =>
            bed.id === bedId
              ? {
                  ...bed,
                  status: newStatus,
                  patient: newStatus === "ocupada" ? patientData : (newStatus === "enlimpieza" ? null : bed.patient),
                }
              : bed
          ),
        }))
      );

      // 2. Persistencia en la base de datos central en segundo plano
      updateBedStatus(bedId, newStatus, patientData, operatorInfo, activeSucursalId).catch((err) => {
        console.error("Error al sincronizar cambio de cama en segundo plano:", err);
      });
    } catch (error) {
      console.error("Error al procesar cambio de cama:", error);
    }
  };

  const closeSidebar = () => setSidebarOpen(false);

  const isHospitalDedicatedUrl = location.pathname.startsWith("/h/");
  const cleanPath = location.pathname.toLowerCase().replace(/\/$/, "");
  const isDevUrl =
    cleanPath === "/dev-login" ||
    cleanPath === "/superadmin-login" ||
    cleanPath === "/superadmin" ||
    cleanPath === "/dev" ||
    cleanPath.startsWith("/dev-login") ||
    cleanPath.startsWith("/superadmin") ||
    cleanPath.startsWith("/dev");

  const activeDevRole = devRole;

  if (isDevUrl) {
    if (activeDevRole === "superadmin" || activeDevRole === "developer") {
      return <SuperAdminPanel onLogout={handleDevLogout} />;
    }
    return <DevLogin onLogin={(r) => handleDevLogin(r)} />;
  }

  const hospitalRole = role && role !== "superadmin" && role !== "developer" ? role : null;

  if (isHospitalDedicatedUrl && !hospitalRole) {
    return (
      <Routes>
        <Route path="/h/:hospitalCode/:sucursalId?" element={<Login onLogin={handleUserLogin} />} />
        <Route path="/h/:hospitalCode" element={<Login onLogin={handleUserLogin} />} />
        <Route path="*" element={<Login onLogin={handleUserLogin} />} />
      </Routes>
    );
  }

  if (!hospitalRole) {
    return (
      <Routes>
        <Route path="/h/:hospitalCode/:sucursalId?" element={<Login onLogin={handleUserLogin} />} />
        <Route path="/h/:hospitalCode" element={<Login onLogin={handleUserLogin} />} />
        <Route path="*" element={<Login onLogin={handleUserLogin} />} />
      </Routes>
    );
  }

  return (
    <>
      <div
        className={`sidebar-overlay${sidebarOpen ? " open" : ""}`}
        onClick={closeSidebar}
        aria-hidden="true"
      />

      <Sidebar
        role={role}
        hospitalInfo={sessionHospital}
        onLogout={handleLogout}
        isOpen={sidebarOpen}
        onClose={closeSidebar}
      />

      <div className="main-content">
        <div className="topbar">
          <button
            className="hamburger"
            onClick={() => setSidebarOpen(true)}
            aria-label="Abrir menú"
            aria-expanded={sidebarOpen}
          >
            <FaBars />
          </button>
          <span className="topbar-title">
            BedTrack {sessionHospital ? `— ${sessionHospital.hospital} (${sessionHospital.sede})` : ""}
          </span>
        </div>

        <Routes>
          <Route path="/"              element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard"     element={<Dashboard role={role} sessionHospital={sessionHospital} beds={beds} />} />
          <Route
            path="/camas"
            element={<Beds role={role} beds={beds} onChangeStatus={changeStatus} />}
          />
          <Route
            path="/habitaciones"
            element={<Habitaciones rooms={rooms} />}
          />
          <Route
            path="/habitaciones/:roomId"
            element={<RoomDetail rooms={rooms} role={role} onChangeBedStatus={changeStatus} />}
          />
          <Route
            path="/pacientes"
            element={<Pacientes rooms={rooms} />}
          />
          <Route
            path="/historial"
            element={<HistorialPage role={role} sessionHospital={sessionHospital} />}
          />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </div>
    </>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  );
}
