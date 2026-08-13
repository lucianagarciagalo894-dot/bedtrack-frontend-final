import { useState, useEffect, useCallback, useRef } from "react";
import {
  FaBuilding,
  FaHospital,
  FaBed,
  FaDoorOpen,
  FaPlus,
  FaEdit,
  FaTrash,
  FaCogs,
  FaCheckCircle,
  FaExclamationTriangle,
  FaExchangeAlt,
  FaUserNurse,
  FaHistory,
  FaUserPlus,
  FaToggleOn,
  FaToggleOff,
  FaCopy,
  FaLink,
  FaLayerGroup,
} from "react-icons/fa";
import {
  getNosocomios,
  getStoredNosocomios,
  createNosocomio,
  updateNosocomio,
  createSucursal,
  updateSucursal,
  createFloor,
  updateFloor,
  deleteFloor,
  createRoom,
  updateRoom,
  deleteRoom,
  createBed,
  updateBed,
  deleteBed,
  createFullHospitalSetup,
  getStaffUsers,
  createStaffUser,
  updateStaffUser,
  deleteStaffUser,
  getAuditLogs,
  normalizeRole,
  deleteNosocomio,
  exportHospitalAuditHistoryCSV,
} from "../services/superAdminService";
import { getAllRooms, getFloors, getStoredRooms, getStoredFloors } from "../services/roomService";

export default function SuperAdminPanel({ onLogout }) {
  // State for Nosocomio & Sucursal selection
  const [nosocomios, setNosocomios] = useState([]);
  const [selectedNosocomioId, setSelectedNosocomioId] = useState("");
  const [selectedSucursalId, setSelectedSucursalId] = useState("");

  // State for Rooms, Beds and Floors
  const [floors, setFloors] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [staffUsers, setStaffUsers] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [auditUserFilter, setAuditUserFilter] = useState("");
  const [auditRoleFilter, setAuditRoleFilter] = useState("todos");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState(null);

  // Modals state
  const [showNosocomioModal, setShowNosocomioModal] = useState(false);
  const [showEditNosocomioModal, setShowEditNosocomioModal] = useState(false);
  const [showSucursalModal, setShowSucursalModal] = useState(false);
  const [showEditSucursalModal, setShowEditSucursalModal] = useState(false);
  const [showFloorModal, setShowFloorModal] = useState(false);
  const [showRoomModal, setShowRoomModal] = useState(false);
  const [showBedModal, setShowBedModal] = useState(false);
  const [showFullHospitalModal, setShowFullHospitalModal] = useState(false);
  const [showUserModal, setShowUserModal] = useState(false);
  const [showDeleteNosocomioModal, setShowDeleteNosocomioModal] = useState(false);

  // Forms data
  const [newNosocomio, setNewNosocomio] = useState({ nombre: "", codigo: "", direccion: "" });
  const [editNosocomioForm, setEditNosocomioForm] = useState({ id: null, nombre: "", codigo: "", direccion: "", activo: true });
  const [newSucursal, setNewSucursal] = useState({ nombre: "", direccion: "" });
  const [editSucursalForm, setEditSucursalForm] = useState({ id: null, nombre: "", direccion: "", activo: true });
  const [floorForm, setFloorForm] = useState({ id: null, nombre: "", tipo: "General", tipoKey: "general", sucursalId: "" });
  const [roomForm, setRoomForm] = useState({ id: null, numero: "", pisoId: "", bedsCount: 1 });
  const [bedForm, setBedForm] = useState({ id: null, numero: "", habitacionId: "", status: "disponible" });
  const [userForm, setUserForm] = useState({ id: null, nombre: "", email: "", password: "", rol: "enfermeria", activo: true, nosocomioId: "", sucursalId: "" });
  const [fullHospitalForm, setFullHospitalForm] = useState({
    nombreNosocomio: "",
    codigoNosocomio: "",
    direccionNosocomio: "",
    nombreSucursal: "Sede Central",
    direccionSucursal: "",
    cantidadPisos: 3,
    habitacionesPorPiso: 4,
    camasPorHabitacion: 2,
  });

  // System Settings State
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [loadingData, setLoadingData] = useState(false);

  const showNotification = (text, type = "success") => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 4000);
  };

  const selectedNosIdRef = useRef(selectedNosocomioId);
  const selectedSucIdRef = useRef(selectedSucursalId);

  useEffect(() => {
    selectedNosIdRef.current = selectedNosocomioId;
    selectedSucIdRef.current = selectedSucursalId;
  }, [selectedNosocomioId, selectedSucursalId]);

  // Cache for sucursal data to avoid flickering when switching back
  const sucursalCache = useRef({});

  // --- Load sucursal-specific data (rooms, floors, staff, audit) ---
  const loadSucursalData = useCallback(async (nosId, sucId) => {
    if (!nosId || !sucId) {
      setRooms([]);
      setFloors([]);
      setStaffUsers([]);
      setAuditLogs([]);
      return;
    }

    // STEP 1: Load cached data immediately (no flicker)
    const cacheKey = `${nosId}_${sucId}`;
    const cached = sucursalCache.current[cacheKey];
    if (cached) {
      setRooms(cached.rooms || []);
      setFloors(cached.floors || []);
      setStaffUsers(cached.staffUsers || []);
      setAuditLogs(cached.auditLogs || []);
    }

    // STEP 2: Try to refresh from server (or localStorage) in background
    try {
      const [roomsData, floorsData, usersData, logsData] = await Promise.all([
        getAllRooms(sucId),
        getFloors(sucId),
        getStaffUsers(nosId, sucId),
        getAuditLogs(sucId, nosId),
      ]);
      // Only update if the selection hasn't changed while we were fetching
      if (selectedNosIdRef.current === nosId && selectedSucIdRef.current === sucId) {
        const freshRooms = roomsData || [];
        const freshFloors = floorsData || [];
        const freshUsers = usersData || [];
        const freshLogs = logsData || [];
        setRooms(freshRooms);
        setFloors(freshFloors);
        setStaffUsers(freshUsers);
        setAuditLogs(freshLogs);
        // Populate cache
        sucursalCache.current[cacheKey] = {
          rooms: freshRooms,
          floors: freshFloors,
          staffUsers: freshUsers,
          auditLogs: freshLogs,
        };
      }
    } catch (err) {
      console.warn("Error al cargar datos de sucursal:", err);
      // If we didn't have cached data, try loading from localStorage as last resort
      if (!cached && selectedNosIdRef.current === nosId && selectedSucIdRef.current === sucId) {
        setRooms(getStoredRooms(sucId));
        setFloors(getStoredFloors(sucId));
      }
    }
  }, []);

  // --- Load nosocomios list only (used for init + polling) ---
  const loadNosocomiosList = useCallback(async (isInitial = false) => {
    try {
      const nosData = await getNosocomios();
      const activeNosocomios = nosData || [];
      setNosocomios(activeNosocomios);

      if (activeNosocomios.length > 0) {
        let currentNosId = selectedNosIdRef.current;
        let currentSucId = selectedSucIdRef.current;

        if (!currentNosId || !activeNosocomios.some((n) => n?.id?.toString() === currentNosId?.toString())) {
          currentNosId = activeNosocomios[0]?.id?.toString() || "";
          if (currentNosId) setSelectedNosocomioId(currentNosId);
        }

        const nosObj = activeNosocomios.find((n) => n?.id?.toString() === currentNosId?.toString());
        const sucs = nosObj?.sucursales || [];

        if (!currentSucId || !sucs.some((s) => s?.id?.toString() === currentSucId?.toString())) {
          currentSucId = sucs[0]?.id?.toString() || "";
          setSelectedSucursalId(currentSucId);
        }
      } else {
        setSelectedNosocomioId("");
        setSelectedSucursalId("");
        setRooms([]);
        setFloors([]);
        setStaffUsers([]);
        setAuditLogs([]);
      }
    } catch (err) {
      console.error("Error al cargar nosocomios:", err);
    } finally {
      if (isInitial) setLoading(false);
    }
  }, []);

  // Backwards-compatible alias used by event handlers and other parts of the component
  const loadInitialData = useCallback(async () => {
    await loadNosocomiosList(false);
    // Also refresh current sucursal data
    const nosId = selectedNosIdRef.current;
    const sucId = selectedSucIdRef.current;
    if (nosId && sucId) {
      await loadSucursalData(nosId, sucId);
    }
  }, [loadNosocomiosList, loadSucursalData]);

  // --- Initial load + polling for nosocomios list ---
  useEffect(() => {
    let ignore = false;
    const init = async () => {
      if (!ignore) {
        await loadNosocomiosList(true);
      }
    };
    init();
    const timer = setInterval(() => {
      if (!ignore) {
        loadNosocomiosList(false);
      }
    }, 30000);
    return () => {
      ignore = true;
      clearInterval(timer);
    };
  }, [loadNosocomiosList]);

  // --- Load sucursal data when selection changes ---
  useEffect(() => {
    let cancelled = false;
    if (selectedNosocomioId && selectedSucursalId) {
      setLoadingData(true);
      loadSucursalData(selectedNosocomioId, selectedSucursalId).finally(() => {
        if (!cancelled) setLoadingData(false);
      });
    } else {
      setRooms([]);
      setFloors([]);
      setStaffUsers([]);
      setAuditLogs([]);
    }
    return () => {
      cancelled = true;
    };
  }, [selectedNosocomioId, selectedSucursalId, loadSucursalData]);

  useEffect(() => {
    const handleSyncAll = () => {
      const nosId = selectedNosIdRef.current;
      const sucId = selectedSucIdRef.current;
      if (nosId && sucId) {
        loadSucursalData(nosId, sucId);
      }
    };

    window.addEventListener("bedtrack_rooms_updated", handleSyncAll);
    window.addEventListener("bedtrack_audit_updated", handleSyncAll);

    return () => {
      window.removeEventListener("bedtrack_rooms_updated", handleSyncAll);
      window.removeEventListener("bedtrack_audit_updated", handleSyncAll);
    };
  }, [loadSucursalData]);

  const currentNosocomio = nosocomios.find((n) => n?.id?.toString() === selectedNosocomioId?.toString());
  const sucursalesList = currentNosocomio?.sucursales || [];

  const handleNosocomioChange = (e) => {
    const id = e.target.value;
    setSelectedNosocomioId(id);
    const nos = nosocomios.find((n) => n.id.toString() === id);
    if (nos && nos.sucursales && nos.sucursales.length > 0) {
      setSelectedSucursalId(nos.sucursales[0].id.toString());
    } else {
      setSelectedSucursalId("");
    }
  };

  const handleSucursalChange = (e) => {
    const newSucId = e.target.value;
    setSelectedSucursalId(newSucId);
  };

  // --- Handlers para Nosocomios y Establecimientos ---
  const handleCreateNosocomio = async (e) => {
    e.preventDefault();
    if (!newNosocomio.nombre) return;
    try {
      const autoCodigo = "NOS-" + (newNosocomio.nombre.length >= 3 ? newNosocomio.nombre.substring(0, 3).toUpperCase() : "HOSP") + "-" + Math.floor(Math.random() * 900 + 100);
      const created = await createNosocomio({
        nombre: newNosocomio.nombre,
        direccion: newNosocomio.direccion,
        codigo: autoCodigo,
      });

      const updatedList = getStoredNosocomios();
      setNosocomios(updatedList || []);
      setSelectedNosocomioId(created.id.toString());
      if (created.sucursales && created.sucursales.length > 0) {
        setSelectedSucursalId(created.sucursales[0].id.toString());
      } else if (updatedList) {
        const match = updatedList.find((n) => n.id.toString() === created.id.toString());
        if (match && match.sucursales && match.sucursales.length > 0) {
          setSelectedSucursalId(match.sucursales[0].id.toString());
        }
      }
      setNewNosocomio({ nombre: "", codigo: "", direccion: "" });
      setShowNosocomioModal(false);
      showNotification("Nosocomio registrado correctamente");
    } catch (err) {
      showNotification(err.message, "error");
    }
  };

  const handleDeleteNosocomioConfirm = async () => {
    if (!selectedNosocomioId) return;
    const targetId = selectedNosocomioId;
    const targetName = currentNosocomio?.nombre || "Nosocomio";
    setShowDeleteNosocomioModal(false);
    try {
      await deleteNosocomio(targetId);
      const updatedList = getStoredNosocomios();
      setNosocomios(updatedList || []);
      if (updatedList && updatedList.length > 0) {
        setSelectedNosocomioId(updatedList[0].id.toString());
        setSelectedSucursalId(updatedList[0].sucursales?.[0]?.id?.toString() || "");
      } else {
        setSelectedNosocomioId("");
        setSelectedSucursalId("");
        setStaffUsers([]);
        setRooms([]);
        setFloors([]);
        setAuditLogs([]);
      }
      showNotification(`Nosocomio "${targetName}" y todas sus dependencias eliminadas con éxito.`);
    } catch (err) {
      showNotification("Error al eliminar el nosocomio: " + err.message, "error");
    }
  };

  const handleCreateSucursal = async (e) => {
    e.preventDefault();
    if (!newSucursal.nombre || !selectedNosocomioId) return;
    try {
      const created = await createSucursal({
        ...newSucursal,
        nosocomioId: parseInt(selectedNosocomioId, 10),
      });

      setNosocomios((prev) =>
        prev.map((n) =>
          n.id.toString() === selectedNosocomioId
            ? { ...n, sucursales: [...(n.sucursales || []), created] }
            : n
        )
      );
      setSelectedSucursalId(created.id.toString());
      setNewSucursal({ nombre: "", direccion: "" });
      setShowSucursalModal(false);
      showNotification("Establecimiento registrado correctamente");
    } catch (err) {
      showNotification(err.message, "error");
    }
  };

  const handleOpenEditNosocomioModal = () => {
    if (!currentNosocomio) return;
    setEditNosocomioForm({
      id: currentNosocomio.id,
      nombre: currentNosocomio.nombre || "",
      codigo: currentNosocomio.codigo || "",
      direccion: currentNosocomio.direccion || "",
      activo: currentNosocomio.activo !== false,
    });
    setShowEditNosocomioModal(true);
  };

  const handleSaveEditNosocomio = async (e) => {
    e.preventDefault();
    if (!editNosocomioForm.nombre) return;
    try {
      const updated = await updateNosocomio(editNosocomioForm.id, editNosocomioForm);
      setNosocomios((prev) =>
        prev.map((n) => (n.id === editNosocomioForm.id ? { ...n, ...updated } : n))
      );
      setShowEditNosocomioModal(false);
      showNotification("Nosocomio actualizado correctamente");
    } catch (err) {
      showNotification(err.message, "error");
    }
  };

  const handleToggleNosocomioStatus = () => {
    if (!currentNosocomio) return;
    const nextStatus = currentNosocomio.activo === false ? true : false;
    setNosocomios((prev) =>
      prev.map((n) => (n.id === currentNosocomio.id ? { ...n, activo: nextStatus } : n))
    );
    showNotification(`Nosocomio ${nextStatus ? "activado" : "desactivado (Borrado Lógico)"}`);
  };

  const handleOpenEditSucursalModal = () => {
    const currentSucursal = sucursalesList.find((s) => s.id.toString() === selectedSucursalId);
    if (!currentSucursal) return;
    setEditSucursalForm({
      id: currentSucursal.id,
      nombre: currentSucursal.nombre || "",
      direccion: currentSucursal.direccion || "",
      activo: currentSucursal.activo !== false,
    });
    setShowEditSucursalModal(true);
  };

  const handleSaveEditSucursal = async (e) => {
    e.preventDefault();
    if (!editSucursalForm.nombre) return;
    try {
      const updated = await updateSucursal(editSucursalForm.id, editSucursalForm);
      setNosocomios((prev) =>
        prev.map((n) =>
          n.id.toString() === selectedNosocomioId
            ? {
                ...n,
                sucursales: n.sucursales.map((s) =>
                  s.id === editSucursalForm.id ? { ...s, ...updated } : s
                ),
              }
            : n
        )
      );
      setShowEditSucursalModal(false);
      showNotification("Establecimiento actualizado correctamente");
    } catch (err) {
      showNotification(err.message, "error");
    }
  };

  // --- Handlers para Pisos Hospitalarios ---
  const handleOpenFloorModal = (floor = null) => {
    if (maintenanceMode) {
      showNotification("El Bloqueo de Seguridad de Infraestructura está activo. Desactívelo para aplicar modificaciones.", "error");
      return;
    }
    if (floor) {
      setFloorForm({
        id: floor.id,
        nombre: floor.nombre || "",
        tipo: floor.tipo || "General",
        tipoKey: floor.tipoKey || "general",
        sucursalId: selectedSucursalId,
      });
    } else {
      setFloorForm({
        id: null,
        nombre: "",
        tipo: "General",
        tipoKey: "general",
        sucursalId: selectedSucursalId,
      });
    }
    setShowFloorModal(true);
  };

  const handleSaveFloor = async (e) => {
    e.preventDefault();
    if (!floorForm.nombre) return;
    try {
      if (floorForm.id) {
        const updated = await updateFloor(
          floorForm.id,
          {
            nombre: floorForm.nombre,
            tipo: floorForm.tipo,
            tipoKey: floorForm.tipoKey,
            sucursalId: selectedSucursalId,
          },
          selectedSucursalId
        );
        const freshFloors = await getFloors(selectedSucursalId);
        setFloors(freshFloors && freshFloors.length > 0 ? freshFloors : [(updated || floorForm)]);
        const freshRooms = await getAllRooms(selectedSucursalId);
        setRooms(freshRooms || []);
        showNotification("Piso hospitalario actualizado exitosamente");
      } else {
        const created = await createFloor(
          {
            nombre: floorForm.nombre,
            tipo: floorForm.tipo,
            tipoKey: floorForm.tipoKey,
            sucursalId: selectedSucursalId,
          },
          selectedSucursalId
        );
        const freshFloors = await getFloors(selectedSucursalId);
        setFloors(freshFloors && freshFloors.length > 0 ? freshFloors : [created]);
        showNotification("Piso hospitalario creado exitosamente");
      }
      setShowFloorModal(false);
    } catch (err) {
      showNotification(err.message, "error");
    }
  };

  const handleDeleteFloor = async (floorId) => {
    if (!window.confirm("¿Está seguro de eliminar este piso y todas sus habitaciones/camas asociadas?")) return;
    try {
      await deleteFloor(floorId);
      setFloors((prev) => prev.filter((f) => f.id !== floorId));
      setRooms((prev) => prev.filter((r) => r.floorId !== floorId));
      showNotification("Piso eliminado correctamente");
    } catch (err) {
      showNotification(err.message, "error");
    }
  };

  // --- Handlers para Habitaciones ---
  const handleOpenRoomModal = (room = null) => {
    if (room) {
      setRoomForm({
        id: room.id,
        numero: room.number,
        pisoId: room.floorId || (floors[0]?.id || 1),
        bedsCount: room.beds?.length || 1,
      });
    } else {
      setRoomForm({
        id: null,
        numero: "",
        pisoId: floors[0]?.id || 1,
        bedsCount: 1,
      });
    }
    setShowRoomModal(true);
  };

  const handleSaveRoom = async (e) => {
    e.preventDefault();
    if (!roomForm.pisoId) return;
    try {
      if (roomForm.id) {
        // Actualizar
        await updateRoom(roomForm.id, {
          numero: parseInt(roomForm.numero, 10),
          pisoId: parseInt(roomForm.pisoId, 10),
          sucursalId: selectedSucursalId,
        }, selectedSucursalId);
        showNotification("Habitación actualizada con éxito");
      } else {
        // Crear
        await createRoom({
          numero: parseInt(roomForm.numero, 10) || 1,
          pisoId: parseInt(roomForm.pisoId, 10),
          cantidadCamasInicial: parseInt(roomForm.bedsCount, 10) || 1,
          sucursalId: selectedSucursalId,
        }, selectedSucursalId);
        showNotification("Habitación agregada con éxito");
      }
      const freshRooms = await getAllRooms(selectedSucursalId);
      setRooms(freshRooms || []);
      setShowRoomModal(false);
    } catch (err) {
      showNotification(err.message, "error");
    }
  };

  const handleDeleteRoom = async (roomId) => {
    if (!window.confirm("¿Está seguro de eliminar esta habitación y sus camas?")) return;
    try {
      await deleteRoom(roomId, selectedSucursalId);
      const freshRooms = await getAllRooms(selectedSucursalId);
      setRooms(freshRooms || []);
      showNotification("Habitación eliminada correctamente");
    } catch (err) {
      showNotification(err.message, "error");
    }
  };

  // --- Handlers para Camas ---
  const handleOpenBedModal = (bed = null, roomId = null) => {
    if (bed) {
      setBedForm({
        id: bed.id,
        numero: bed.number,
        habitacionId: roomId || rooms[0]?.id,
        status: bed.status || "disponible",
      });
    } else {
      setBedForm({
        id: null,
        numero: "",
        habitacionId: roomId || (rooms[0]?.id || 1),
        status: "disponible",
      });
    }
    setShowBedModal(true);
  };

  const handleSaveBed = async (e) => {
    e.preventDefault();
    if (!bedForm.habitacionId) return;
    try {
      if (bedForm.id) {
        // Actualizar Cama
        const updated = await updateBed(bedForm.id, {
          numero: parseInt(bedForm.numero, 10) || 1,
          habitacionId: parseInt(bedForm.habitacionId, 10),
          status: bedForm.status,
        });

        setRooms((prev) =>
          prev.map((r) => ({
            ...r,
            beds: r.beds.map((b) => (b.id === bedForm.id ? { ...b, ...updated } : b)),
          }))
        );
        showNotification("Cama actualizada correctamente");
      } else {
        // Crear Cama
        const created = await createBed({
          numero: parseInt(bedForm.numero, 10) || 1,
          habitacionId: parseInt(bedForm.habitacionId, 10),
          status: bedForm.status,
        });

        setRooms((prev) =>
          prev.map((r) =>
            r.id === parseInt(bedForm.habitacionId, 10)
              ? { ...r, beds: [...r.beds, created] }
              : r
          )
        );
        showNotification("Cama agregada correctamente");
      }
      setShowBedModal(false);
    } catch (err) {
      showNotification(err.message, "error");
    }
  };

  const handleDeleteBed = async (bedId) => {
    if (!window.confirm("¿Está seguro de eliminar esta cama?")) return;
    try {
      await deleteBed(bedId);
      setRooms((prev) =>
        prev.map((r) => ({
          ...r,
          beds: r.beds.filter((b) => b.id !== bedId),
        }))
      );
      showNotification("Cama eliminada correctamente");
    } catch (err) {
      showNotification(err.message, "error");
    }
  };

  const handleCreateFullHospital = async (e) => {
    e.preventDefault();
    if (!fullHospitalForm.nombreNosocomio) return;

    try {
      const floorsPayload = [];
      const numPisos = parseInt(fullHospitalForm.cantidadPisos, 10) || 3;
      const habsPorPiso = parseInt(fullHospitalForm.habitacionesPorPiso, 10);
      const habCount = isNaN(habsPorPiso) ? 2 : habsPorPiso;
      const camasPorHab = parseInt(fullHospitalForm.camasPorHabitacion, 10) || 2;

      for (let i = 1; i <= numPisos; i++) {
        let tipo = "Compartida";
        let tipoKey = "compartida";
        if (i === 1) { tipo = "Privada"; tipoKey = "privada"; }
        else if (i === numPisos) { tipo = "Terapia Intensiva"; tipoKey = "intensiva"; }

        if (habCount === 0) {
          floorsPayload.push({
            nombre: `Piso ${i} (Sala de Urgencias Directas)`,
            tipo: "Guardia",
            tipoKey: "guardia",
            cantidadHabitaciones: 1,
            camasPorHabitacion: camasPorHab,
            enfermeroAsignadoId: fullHospitalForm.enfermeroAsignadoId || null,
          });
        } else {
          floorsPayload.push({
            nombre: `Piso ${i}`,
            tipo,
            tipoKey,
            cantidadHabitaciones: habCount,
            camasPorHabitacion: camasPorHab,
            enfermeroAsignadoId: fullHospitalForm.enfermeroAsignadoId || null,
          });
        }
      }

      const autoCodigo = "HOSP-" + (fullHospitalForm.nombreNosocomio.length >= 3 ? fullHospitalForm.nombreNosocomio.substring(0, 3).toUpperCase() : "MED") + "-" + Math.floor(Math.random() * 900 + 100);

      const payload = {
        nombreNosocomio: fullHospitalForm.nombreNosocomio,
        codigoNosocomio: autoCodigo,
        direccionNosocomio: fullHospitalForm.direccionNosocomio,
        nombreSucursal: fullHospitalForm.nombreSucursal || "Establecimiento Central",
        direccionSucursal: fullHospitalForm.direccionSucursal || fullHospitalForm.direccionNosocomio,
        pisos: floorsPayload,
      };

      const result = await createFullHospitalSetup(payload);
      setShowFullHospitalModal(false);

      showNotification(`Hospital "${result.nombre}" generado exitosamente con sus pisos, habitaciones y camas.`);

      await loadInitialData();
    } catch (err) {
      showNotification(err.message, "error");
    }
  };

  // --- Handlers para Usuarios Staff de Enfermería ---
  const handleOpenUserModal = (user = null) => {
    if (user) {
      setUserForm({
        id: user.id,
        nombre: user.nombre,
        email: user.email,
        password: "",
        rol: user.rol || "enfermeria",
        activo: user.activo !== false,
        nosocomioId: user.nosocomioId ? user.nosocomioId.toString() : selectedNosocomioId,
        sucursalId: user.sucursalId ? user.sucursalId.toString() : selectedSucursalId,
      });
    } else {
      setUserForm({
        id: null,
        nombre: "",
        email: "",
        password: "",
        rol: "enfermeria",
        activo: true,
        nosocomioId: selectedNosocomioId,
        sucursalId: selectedSucursalId,
      });
    }
    setShowUserModal(true);
  };

  const handleSaveUser = async (e) => {
    e.preventDefault();
    if (!userForm.nombre || !userForm.email) return;

    try {
      if (userForm.id) {
        const updated = await updateStaffUser(userForm.id, {
          nombre: userForm.nombre,
          email: userForm.email,
          password: userForm.password,
          rol: userForm.rol,
          activo: userForm.activo,
          nosocomioId: userForm.nosocomioId ? parseInt(userForm.nosocomioId, 10) : null,
          sucursalId: userForm.sucursalId ? parseInt(userForm.sucursalId, 10) : null,
        });
        setStaffUsers((prev) => prev.map((u) => (u.id === userForm.id ? { ...u, ...updated } : u)));
        showNotification("Usuario de enfermería actualizado");
      } else {
        const created = await createStaffUser({
          nombre: userForm.nombre,
          email: userForm.email,
          password: userForm.password || "123456",
          rol: userForm.rol,
          nosocomioId: userForm.nosocomioId ? parseInt(userForm.nosocomioId, 10) : null,
          sucursalId: userForm.sucursalId ? parseInt(userForm.sucursalId, 10) : null,
        });
        setStaffUsers((prev) => [...prev, created]);
        showNotification("Usuario de enfermería creado con éxito");
      }
      setShowUserModal(false);
    } catch (err) {
      showNotification(err.message, "error");
    }
  };

  const handleToggleUserStatus = async (user) => {
    try {
      const updated = await updateStaffUser(user.id, {
        ...user,
        activo: !user.activo,
      });
      setStaffUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, ...updated } : u)));
      showNotification(`Usuario ${updated.activo ? "activado" : "desactivado"}`);
    } catch (err) {
      showNotification(err.message, "error");
    }
  };

  const handleDeleteUser = async (userId) => {
    if (!window.confirm("¿Está seguro de eliminar este usuario del personal hospitalario?")) return;
    try {
      await deleteStaffUser(userId);
      setStaffUsers((prev) => prev.filter((u) => u.id !== userId));
      showNotification("Usuario del personal eliminado correctamente");
    } catch (err) {
      showNotification(err.message, "error");
    }
  };

  return (
    <div className="superadmin-container">
      {/* Top Banner Notice */}
      <header className="superadmin-header">
        <div className="superadmin-brand">
          <FaHospital className="superadmin-icon" />
          <div>
            <h1>Panel de Desarrollador BedTrack</h1>
            <p>Configuración integral de Nosocomios, Establecimientos, Habitaciones y Camas</p>
          </div>
        </div>

        <div className="superadmin-actions">
          <button
            className="btn-primary-add"
            style={{ background: "linear-gradient(135deg, #10B981 0%, #059669 100%)", boxShadow: "0 4px 12px rgba(16, 185, 129, 0.3)" }}
            onClick={() => setShowFullHospitalModal(true)}
          >
            <FaPlus /> Crear Hospital Completo
          </button>
          <span className="superadmin-badge">Modo Desarrollador</span>
          {onLogout && (
            <button className="superadmin-logout-btn" onClick={onLogout}>
              Cerrar Sesión
            </button>
          )}
        </div>
      </header>

      {message && (
        <div className={`superadmin-toast ${message.type}`}>
          {message.type === "success" ? <FaCheckCircle /> : <FaExclamationTriangle />}
          <span>{message.text}</span>
        </div>
      )}

      {maintenanceMode && (
        <div style={{ background: "#FEF2F2", border: "1px solid #FCA5A5", borderRadius: "10px", padding: "12px 16px", marginBottom: "16px", display: "flex", alignItems: "center", gap: "12px", color: "#991B1B" }}>
          <FaExclamationTriangle style={{ fontSize: "1.3rem", flexShrink: 0 }} />
          <div>
            <strong>Bloqueo de Seguridad de Infraestructura ACTIVO:</strong> Las acciones de agregar, editar y eliminar pisos, habitaciones y camas se encuentran bloqueadas temporalmente para evitar modificaciones accidentales.
          </div>
        </div>
      )}

      {/* Grid Controls: Nosocomio & Establecimiento Selection */}
      <div className="superadmin-grid">
        <section className="superadmin-card">
          <div className="superadmin-card-header">
            <h3><FaBuilding /> Nosocomio y Establecimiento Activo</h3>
          </div>
          <div className="superadmin-selectors">
            <div className="selector-group">
              <label>Nosocomio:</label>
              <select
                value={selectedNosocomioId}
                onChange={handleNosocomioChange}
                disabled={!nosocomios.length}
              >
                {nosocomios.length === 0 ? (
                  <option value="">Sin nosocomios registrados</option>
                ) : (
                  nosocomios.map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.nombre} ({n.codigo || `ID: ${n.id}`})
                    </option>
                  ))
                )}
              </select>
              <button
                className="btn-secondary-sm"
                onClick={() => setShowNosocomioModal(true)}
                title="Registrar Nuevo Nosocomio"
              >
                <FaPlus /> Nuevo
              </button>
              <button
                className="btn-secondary-sm"
                onClick={handleOpenEditNosocomioModal}
                disabled={!selectedNosocomioId}
                title="Editar Nosocomio Activo"
              >
                <FaEdit /> Editar
              </button>
              <button
                className="btn-secondary-sm"
                style={{ color: currentNosocomio?.activo !== false ? "#059669" : "#DC2626" }}
                onClick={handleToggleNosocomioStatus}
                disabled={!selectedNosocomioId}
                title={currentNosocomio?.activo !== false ? "Desactivar Nosocomio (Borrado Lógico)" : "Activar Nosocomio"}
              >
                {currentNosocomio?.activo !== false ? <FaToggleOn size={16} /> : <FaToggleOff size={16} />}
              </button>
              <button
                className="btn-secondary-sm"
                onClick={() => exportHospitalAuditHistoryCSV(selectedNosocomioId, selectedSucursalId, currentNosocomio?.nombre)}
                disabled={!selectedNosocomioId}
                title="Descargar Historial de Actividad (CSV)"
              >
                <FaHistory /> Exportar CSV
              </button>
              <button
                className="btn-secondary-sm"
                style={{ color: "#DC2626", borderColor: "#FCA5A5" }}
                onClick={() => setShowDeleteNosocomioModal(true)}
                disabled={!selectedNosocomioId}
                title="Eliminar Nosocomio de la Base de Datos"
              >
                <FaTrash /> Eliminar
              </button>
            </div>

            <div className="selector-group">
              <label>Establecimiento:</label>
              <select
                value={selectedSucursalId}
                onChange={handleSucursalChange}
                disabled={!sucursalesList.length}
              >
                {sucursalesList.length === 0 ? (
                  <option value="">Sin establecimientos registrados</option>
                ) : (
                  sucursalesList.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nombre} - {s.direccion}
                    </option>
                  ))
                )}
              </select>
              <button
                className="btn-secondary-sm"
                onClick={() => setShowSucursalModal(true)}
                disabled={!selectedNosocomioId}
                title="Registrar Nuevo Establecimiento"
              >
                <FaPlus /> Nuevo
              </button>
              <button
                className="btn-secondary-sm"
                onClick={handleOpenEditSucursalModal}
                disabled={!selectedSucursalId}
                title="Editar Establecimiento Activo"
              >
                <FaEdit /> Editar
              </button>
            </div>

            {currentNosocomio && (
              <div
                style={{
                  marginTop: "12px",
                  padding: "12px",
                  background: "#F8FAFC",
                  border: "1px solid #E2E8F0",
                  borderRadius: "8px",
                  fontSize: "0.8rem",
                  display: "flex",
                  flexDirection: "column",
                  gap: "10px",
                }}
              >
                <div style={{ fontWeight: "600", color: "#334155", display: "flex", alignItems: "center", gap: "6px" }}>
                  <FaLink style={{ color: "#2563EB" }} /> Enlaces de Acceso Dedicados por Establecimiento:
                </div>
                {sucursalesList.length === 0 ? (
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                    <input
                      type="text"
                      readOnly
                      value={`${window.location.origin}/h/${currentNosocomio.codigo}`}
                      style={{
                        flex: 1,
                        minWidth: "180px",
                        padding: "6px 10px",
                        fontSize: "0.75rem",
                        border: "1px solid #CBD5E1",
                        borderRadius: "6px",
                        background: "#FFFFFF",
                        color: "#1E293B",
                      }}
                    />
                    <button
                      className="btn-secondary-sm"
                      style={{ margin: 0, padding: "6px 12px", fontSize: "0.75rem", display: "flex", alignItems: "center", gap: "4px" }}
                      onClick={() => {
                        const url = `${window.location.origin}/h/${currentNosocomio.codigo}`;
                        navigator.clipboard.writeText(url);
                        showNotification(`URL copiada al portapapeles: ${url}`);
                      }}
                    >
                      <FaCopy /> Copiar URL
                    </button>
                    <a
                      href={`/h/${currentNosocomio.codigo}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn-secondary-sm"
                      style={{ margin: 0, padding: "6px 12px", fontSize: "0.75rem", display: "flex", alignItems: "center", gap: "4px", textDecoration: "none" }}
                      title="Abrir panel de usuario para este hospital"
                    >
                      <FaLink /> Abrir Enlace
                    </a>
                  </div>
                ) : (
                  sucursalesList.map((s) => {
                    const sucursalUrl = `${window.location.origin}/h/${currentNosocomio.codigo}/${s.id}`;
                    const relativeUrl = `/h/${currentNosocomio.codigo}/${s.id}`;
                    const isSelected = s.id.toString() === selectedSucursalId;
                    return (
                      <div
                        key={s.id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                          flexWrap: "wrap",
                          padding: "8px 10px",
                          background: isSelected ? "#EFF6FF" : "#FFFFFF",
                          border: isSelected ? "1px solid #93C5FD" : "1px solid #CBD5E1",
                          borderRadius: "6px",
                        }}
                      >
                        <span style={{ fontWeight: "600", color: isSelected ? "#1D4ED8" : "#475569", minWidth: "150px", fontSize: "0.78rem" }}>
                          {s.nombre}:
                        </span>
                        <input
                          type="text"
                          readOnly
                          value={sucursalUrl}
                          style={{
                            flex: 1,
                            minWidth: "180px",
                            padding: "5px 8px",
                            fontSize: "0.75rem",
                            border: "1px solid #CBD5E1",
                            borderRadius: "4px",
                            background: "#FFFFFF",
                            color: "#1E293B",
                          }}
                        />
                        <button
                          className="btn-secondary-sm"
                          style={{ margin: 0, padding: "5px 10px", fontSize: "0.75rem", display: "flex", alignItems: "center", gap: "4px" }}
                          onClick={() => {
                            navigator.clipboard.writeText(sucursalUrl);
                            showNotification(`URL para ${s.nombre} copiada al portapapeles: ${sucursalUrl}`);
                          }}
                        >
                          <FaCopy /> Copiar URL
                        </button>
                        <a
                          href={relativeUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn-secondary-sm"
                          style={{ margin: 0, padding: "5px 10px", fontSize: "0.75rem", display: "flex", alignItems: "center", gap: "4px", textDecoration: "none" }}
                          title={`Abrir panel de usuario dedicado para ${s.nombre}`}
                        >
                          <FaLink /> Abrir Enlace
                        </a>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>
        </section>

        {/* Global Settings & Utilities */}
        <section className="superadmin-card">
          <div className="superadmin-card-header">
            <h3><FaCogs /> Configuración de Funciones Existentes</h3>
          </div>
          <div className="superadmin-config-options">
            <label className="toggle-label">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
              />
              Sincronización en tiempo real activa
            </label>

            <label className="toggle-label">
              <input
                type="checkbox"
                checked={maintenanceMode}
                onChange={(e) => setMaintenanceMode(e.target.checked)}
              />
              Bloqueo de Seguridad de Edición (Evitar Cambios Accidentales)
            </label>

            <button
              className="btn-action-refresh"
              onClick={() => {
                setLoading(true);
                loadInitialData();
              }}
            >
              <FaExchangeAlt /> Recargar Datos de Servidor
            </button>
          </div>
        </section>
      </div>

      {/* --- SECCIÓN: GESTIÓN DE USUARIOS / PERSONAL DE ENFERMERÍA --- */}
      <section className="superadmin-main-section" style={{ marginBottom: "24px" }}>
        <div className="section-toolbar">
          <h2><FaUserNurse style={{ color: "#2563EB" }} /> Gestión de Perfiles de Personal (Enfermeros y Encargados)</h2>
          <button className="btn-primary-add" onClick={() => handleOpenUserModal()}>
            <FaUserPlus /> Crear Usuario de Personal
          </button>
        </div>

        <div style={{ background: "var(--card-bg, #FFFFFF)", padding: "16px", borderRadius: "12px", border: "1px solid var(--border, #E2E8F0)" }}>
          {(() => {
            const filteredStaffUsers = staffUsers.filter((u) => {
              if (!selectedNosocomioId) return true;
              return !u.nosocomioId || u.nosocomioId.toString() === selectedNosocomioId.toString();
            });

            if (filteredStaffUsers.length === 0) {
              return <p style={{ fontSize: "0.875rem", color: "#64748B" }}>No hay usuarios de enfermería registrados para este establecimiento.</p>;
            }

            return (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
                  <thead>
                    <tr style={{ borderBottom: "2px solid #E2E8F0", textAlign: "left" }}>
                      <th style={{ padding: "10px" }}>Nombre del Personal</th>
                      <th style={{ padding: "10px" }}>Correo Electrónico</th>
                      <th style={{ padding: "10px" }}>Rol</th>
                      <th style={{ padding: "10px" }}>Hospital Asignado</th>
                      <th style={{ padding: "10px" }}>Estado</th>
                      <th style={{ padding: "10px", textAlign: "right" }}>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredStaffUsers.map((u) => (
                    <tr key={u.id} style={{ borderBottom: "1px solid #F1F5F9" }}>
                      <td style={{ padding: "10px", fontWeight: "600" }}>{u.nombre}</td>
                      <td style={{ padding: "10px" }}>{u.email}</td>
                      <td style={{ padding: "10px" }}>
                        <span style={{ background: u.rol === "admin" ? "#FEF3C7" : "#DBEAFE", color: u.rol === "admin" ? "#D97706" : "#2563EB", padding: "4px 8px", borderRadius: "6px", fontSize: "0.75rem", fontWeight: "600" }}>
                          {normalizeRole(u.rol) === "enfermeria" ? "Enfermería" : normalizeRole(u.rol) === "encargado" ? "Encargado" : u.rol}
                        </span>
                      </td>
                      <td style={{ padding: "10px", color: "#64748B" }}>{u.hospitalNombre || "Global"}</td>
                      <td style={{ padding: "10px" }}>
                        <span style={{ color: u.activo !== false ? "#059669" : "#DC2626", fontWeight: "600" }}>
                          {u.activo !== false ? "Activo" : "Inactivo"}
                        </span>
                      </td>
                      <td style={{ padding: "10px", textAlign: "right" }}>
                        <button
                          className="icon-btn edit-sm"
                          style={{ marginRight: "8px" }}
                          onClick={() => handleOpenUserModal(u)}
                          title="Editar Perfil"
                        >
                          <FaEdit />
                        </button>
                        <button
                          className="icon-btn"
                          style={{ color: u.activo !== false ? "#DC2626" : "#059669", marginRight: "8px" }}
                          onClick={() => handleToggleUserStatus(u)}
                          title={u.activo !== false ? "Desactivar Usuario" : "Activar Usuario"}
                        >
                          {u.activo !== false ? <FaToggleOn size={18} /> : <FaToggleOff size={18} />}
                        </button>
                        <button
                          className="icon-btn delete-sm"
                          onClick={() => handleDeleteUser(u.id)}
                          title="Eliminar Perfil de Usuario"
                        >
                          <FaTrash />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })()}
        </div>
      </section>

      {/* --- SECCIÓN: HISTORIAL DE AUDITORÍA GLOBAL DE CAMAS --- */}
      <section className="superadmin-main-section" style={{ marginBottom: "24px" }}>
        <div className="section-toolbar">
          <h2><FaHistory style={{ color: "#8B5CF6" }} /> Historial de Auditoría (Registro de Cambios en Camas)</h2>
        </div>

        <div style={{ background: "var(--card-bg, #FFFFFF)", padding: "16px", borderRadius: "12px", border: "1px solid var(--border, #E2E8F0)" }}>
          <div style={{ display: "flex", gap: "12px", marginBottom: "16px", flexWrap: "wrap", alignItems: "center" }}>
            <input
              type="text"
              placeholder="🔍 Buscar por nombre, email o acción del operador..."
              value={auditUserFilter}
              onChange={(e) => setAuditUserFilter(e.target.value)}
              style={{ padding: "8px 12px", borderRadius: "8px", border: "1px solid #CBD5E1", fontSize: "0.85rem", flex: "1 1 200px", minWidth: "0" }}
            />
            <select
              value={auditRoleFilter}
              onChange={(e) => setAuditRoleFilter(e.target.value)}
              style={{ padding: "8px 12px", borderRadius: "8px", border: "1px solid #CBD5E1", fontSize: "0.85rem", textTransform: "capitalize" }}
            >
              <option value="todos">Todos los Roles</option>
              <option value="enfermeria">Enfermería</option>
              <option value="encargado">Encargado</option>
              <option value="administrador">Administrador</option>
              <option value="developer">Desarrollador</option>
              <option value="superadmin">SuperAdmin</option>
            </select>
          </div>

          {(() => {
            const filteredLogs = auditLogs.filter((log) => {
              const rLog = (log.usuarioRol || "").toLowerCase();
              const isNurseRole = !rLog || rLog.includes("enferm") || rLog === "enfermeria" || rLog === "enfermero" || rLog === "enfermera";
              if (!isNurseRole) return false;

              const query = auditUserFilter.toLowerCase();
              const matchesUser = !auditUserFilter ||
                (log.usuarioNombre && log.usuarioNombre.toLowerCase().includes(query)) ||
                (log.usuarioEmail && log.usuarioEmail.toLowerCase().includes(query)) ||
                (log.accion && log.accion.toLowerCase().includes(query));

              const matchesRole = auditRoleFilter === "todos" ||
                (log.usuarioRol && log.usuarioRol.toLowerCase() === auditRoleFilter.toLowerCase());

              return matchesUser && matchesRole;
            });

            if (filteredLogs.length === 0) {
              return <p style={{ fontSize: "0.875rem", color: "#64748B" }}>No se encontraron registros de auditoría para los filtros aplicados.</p>;
            }

            return (
              <div style={{ overflowX: "auto", maxHeight: "360px", overflowY: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.825rem" }}>
                  <thead>
                    <tr style={{ borderBottom: "2px solid #E2E8F0", textAlign: "left", sticky: "top", background: "#F8FAFC" }}>
                      <th style={{ padding: "8px" }}>Fecha / Hora</th>
                      <th style={{ padding: "8px" }}>Operador / Usuario</th>
                      <th style={{ padding: "8px" }}>Rol</th>
                      <th style={{ padding: "8px" }}>Ubicación</th>
                      <th style={{ padding: "8px" }}>Acción Realizada</th>
                      <th style={{ padding: "8px" }}>Transición</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLogs.map((log) => (
                      <tr key={log.id} style={{ borderBottom: "1px solid #F1F5F9" }}>
                        <td style={{ padding: "8px", whiteSpace: "nowrap", color: "#64748B" }}>{log.fechaHora}</td>
                        <td style={{ padding: "8px" }}>
                          <strong>{log.usuarioNombre}</strong>
                          <div style={{ fontSize: "0.7rem", color: "#94A3B8" }}>{log.usuarioEmail}</div>
                        </td>
                        <td style={{ padding: "8px" }}>
                          <span style={{ background: "#F1F5F9", color: "#475569", padding: "2px 6px", borderRadius: "4px", fontSize: "0.7rem", fontWeight: "600" }}>
                            {log.usuarioRol || "enfermeria"}
                          </span>
                        </td>
                        <td style={{ padding: "8px", whiteSpace: "nowrap" }}>
                          Hab #{log.habitacionNumero} - Cama #{log.camaNumero}
                        </td>
                        <td style={{ padding: "8px" }}>{log.accion}</td>
                        <td style={{ padding: "8px", whiteSpace: "nowrap" }}>
                          <span style={{ fontSize: "0.7rem", padding: "2px 6px", borderRadius: "4px", background: "#E2E8F0" }}>
                            {log.estadoAnterior} → <strong>{log.estadoNuevo}</strong>
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })()}
        </div>
      </section>

      {/* Section: Infrastructure Management */}
      <section className="superadmin-main-section">
        <div className="section-toolbar">
          <h2>Gestión de Pisos, Habitaciones y Camas</h2>
          <div className="toolbar-btns">
            <button
              className="btn-primary-add"
              style={{ background: "#8B5CF6", opacity: maintenanceMode ? 0.5 : 1, cursor: maintenanceMode ? "not-allowed" : "pointer" }}
              onClick={() => handleOpenFloorModal()}
              disabled={maintenanceMode}
              title={maintenanceMode ? "Bloqueado por Modo Mantenimiento" : "Agregar Piso"}
            >
              <FaLayerGroup /> Agregar Piso
            </button>
            <button
              className="btn-primary-add"
              style={{ opacity: maintenanceMode ? 0.5 : 1, cursor: maintenanceMode ? "not-allowed" : "pointer" }}
              onClick={() => handleOpenRoomModal()}
              disabled={maintenanceMode}
              title={maintenanceMode ? "Bloqueado por Modo Mantenimiento" : "Agregar Habitación"}
            >
              <FaDoorOpen /> Agregar Habitación
            </button>
            <button
              className="btn-primary-add"
              style={{ opacity: maintenanceMode ? 0.5 : 1, cursor: maintenanceMode ? "not-allowed" : "pointer" }}
              onClick={() => handleOpenBedModal()}
              disabled={maintenanceMode}
              title={maintenanceMode ? "Bloqueado por Modo Mantenimiento" : "Agregar Cama"}
            >
              <FaBed /> Agregar Cama
            </button>
          </div>
        </div>

        {loading ? (
          <div className="superadmin-loading">Cargando infraestructura...</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
            {floors.length === 0 ? (
              <div className="rooms-matrix-grid">
                {rooms.map((room) => (
                  <div key={room.id} className="room-admin-card">
                    <div className="room-admin-header">
                      <div>
                        <h4>Habitación #{room.number}</h4>
                        <span className="room-floor-tag">
                          {room.floor || `Piso ID: ${room.floorId}`}
                        </span>
                      </div>
                      <div className="room-actions">
                        <button
                          className="icon-btn edit"
                          title="Editar Habitación"
                          onClick={() => handleOpenRoomModal(room)}
                        >
                          <FaEdit />
                        </button>
                        <button
                          className="icon-btn delete"
                          title="Eliminar Habitación"
                          onClick={() => handleDeleteRoom(room.id)}
                        >
                          <FaTrash />
                        </button>
                      </div>
                    </div>

                    <div className="beds-list-admin">
                      <div className="beds-header-sub">
                        <span>Camas ({room.beds?.length || 0})</span>
                        <button
                          className="btn-xs-add"
                          onClick={() => handleOpenBedModal(null, room.id)}
                        >
                          + Cama
                        </button>
                      </div>

                      {room.beds?.map((bed, bedIdx) => (
                        <div key={bed.id} className="bed-admin-item">
                          <div className="bed-info">
                            <FaBed className={`bed-status-icon ${bed.status}`} />
                            <span>Cama #{bed.number ?? bed.numero ?? (bedIdx + 1)}</span>
                            <span className={`status-badge ${bed.status}`}>
                              {bed.status}
                            </span>
                          </div>
                          <div className="bed-actions">
                            <button
                              className="icon-btn edit-sm"
                              onClick={() => handleOpenBedModal(bed, room.id)}
                            >
                              <FaEdit />
                            </button>
                            <button
                              className="icon-btn delete-sm"
                              onClick={() => handleDeleteBed(bed.id)}
                            >
                              <FaTrash />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              floors.map((floor) => {
                const floorRooms = rooms.filter(
                  (r) => r.floorId === floor.id || r.floor === floor.nombre
                );
                return (
                  <div
                    key={floor.id}
                    style={{
                      background: "var(--card-bg, #FFFFFF)",
                      borderRadius: "12px",
                      border: "1px solid var(--border, #E2E8F0)",
                      padding: "16px",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        flexWrap: "wrap",
                        gap: "12px",
                        borderBottom: "2px solid #F1F5F9",
                        paddingBottom: "12px",
                        marginBottom: "16px",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        <FaLayerGroup style={{ color: "#8B5CF6", fontSize: "1.2rem" }} />
                        <div>
                          <h3 style={{ margin: 0, fontSize: "1.05rem" }}>{floor.nombre}</h3>
                          <span
                            style={{
                              fontSize: "0.75rem",
                              background: "#F3E8FF",
                              color: "#7C3AED",
                              padding: "2px 8px",
                              borderRadius: "4px",
                              fontWeight: "600",
                            }}
                          >
                            {floor.tipo || "General"} ({floorRooms.length} habitaciones/salas)
                          </span>
                        </div>
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                        <button
                          className="btn-xs-add"
                          onClick={() => {
                            setRoomForm({ id: null, numero: "", pisoId: floor.id, bedsCount: 1 });
                            setShowRoomModal(true);
                          }}
                        >
                          + Habitación en este Piso
                        </button>
                        <button
                          className="icon-btn edit"
                          title="Editar Piso"
                          onClick={() => handleOpenFloorModal(floor)}
                        >
                          <FaEdit />
                        </button>
                        <button
                          className="icon-btn delete"
                          title="Eliminar Piso"
                          onClick={() => handleDeleteFloor(floor.id)}
                        >
                          <FaTrash />
                        </button>
                      </div>
                    </div>

                    {floorRooms.length === 0 ? (
                      <p style={{ fontSize: "0.85rem", color: "#94A3B8", margin: 0 }}>
                        No hay habitaciones ni salas agregadas en este piso todavía.
                      </p>
                    ) : (
                      <div className="rooms-matrix-grid">
                        {floorRooms.map((room) => (
                          <div key={room.id} className="room-admin-card">
                            <div className="room-admin-header">
                              <div>
                                <h4>Habitación #{room.number}</h4>
                                <span className="room-floor-tag">
                                  {room.floor || `Piso ID: ${room.floorId}`}
                                </span>
                              </div>
                              <div className="room-actions">
                                <button
                                  className="icon-btn edit"
                                  title="Editar Habitación"
                                  onClick={() => handleOpenRoomModal(room)}
                                >
                                  <FaEdit />
                                </button>
                                <button
                                  className="icon-btn delete"
                                  title="Eliminar Habitación"
                                  onClick={() => handleDeleteRoom(room.id)}
                                >
                                  <FaTrash />
                                </button>
                              </div>
                            </div>

                            <div className="beds-list-admin">
                              <div className="beds-header-sub">
                                <span>Camas ({room.beds?.length || 0})</span>
                                <button
                                  className="btn-xs-add"
                                  onClick={() => handleOpenBedModal(null, room.id)}
                                >
                                  + Cama
                                </button>
                              </div>

                              {room.beds?.map((bed, bedIdx) => (
                                <div key={bed.id} className="bed-admin-item">
                                  <div className="bed-info">
                                    <FaBed className={`bed-status-icon ${bed.status}`} />
                                    <span>Cama #{bed.number ?? bed.numero ?? (bedIdx + 1)}</span>
                                    <span className={`status-badge ${bed.status}`}>
                                      {bed.status}
                                    </span>
                                  </div>
                                  <div className="bed-actions">
                                    <button
                                      className="icon-btn edit-sm"
                                      onClick={() => handleOpenBedModal(bed, room.id)}
                                    >
                                      <FaEdit />
                                    </button>
                                    <button
                                      className="icon-btn delete-sm"
                                      onClick={() => handleDeleteBed(bed.id)}
                                    >
                                      <FaTrash />
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}
      </section>

      {/* --- MODAL NOSOCOMIO --- */}
      {showNosocomioModal && (
        <div className="modal-backdrop">
          <div className="modal-content">
            <h3>Registrar Nuevo Nosocomio</h3>
            <form onSubmit={handleCreateNosocomio}>
              <div className="form-group">
                <label>Nombre del Hospital / Nosocomio:</label>
                <input
                  type="text"
                  placeholder="Ej: Hospital San Martín"
                  value={newNosocomio.nombre}
                  onChange={(e) => setNewNosocomio({ ...newNosocomio, nombre: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label>Dirección:</label>
                <input
                  type="text"
                  placeholder="Ej: Calle Principal 500"
                  value={newNosocomio.direccion}
                  onChange={(e) => setNewNosocomio({ ...newNosocomio, direccion: e.target.value })}
                />
              </div>
              <div className="modal-actions">
                <button type="button" className="btn-cancel" onClick={() => setShowNosocomioModal(false)}>
                  Cancelar
                </button>
                <button type="submit" className="btn-confirm">
                  Guardar Nosocomio
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- MODAL ESTABLECIMIENTO --- */}
      {showSucursalModal && (
        <div className="modal-backdrop">
          <div className="modal-content">
            <h3>Registrar Nuevo Establecimiento</h3>
            <form onSubmit={handleCreateSucursal}>
              <div className="form-group">
                <label>Nombre del Establecimiento:</label>
                <input
                  type="text"
                  placeholder="Ej: Establecimiento Central / Anexo Norte"
                  value={newSucursal.nombre}
                  onChange={(e) => setNewSucursal({ ...newSucursal, nombre: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label>Dirección:</label>
                <input
                  type="text"
                  placeholder="Ej: Av. Córdoba 789"
                  value={newSucursal.direccion}
                  onChange={(e) => setNewSucursal({ ...newSucursal, direccion: e.target.value })}
                />
              </div>
              <div className="modal-actions">
                <button type="button" className="btn-cancel" onClick={() => setShowSucursalModal(false)}>
                  Cancelar
                </button>
                <button type="submit" className="btn-confirm">
                  Guardar Establecimiento
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- MODAL HABITACION --- */}
      {showRoomModal && (
        <div className="modal-backdrop">
          <div className="modal-content">
            <h3>{roomForm.id ? "Editar Habitación" : "Agregar Habitación"}</h3>
            <form onSubmit={handleSaveRoom}>
              <div className="form-group">
                <label>Número de Habitación:</label>
                <input
                  type="number"
                  placeholder="Ej: 101"
                  value={roomForm.numero}
                  onChange={(e) => setRoomForm({ ...roomForm, numero: e.target.value })}
                  required
                />
              </div>

              <div className="form-group">
                <label>Piso Hospitalario:</label>
                <select
                  value={roomForm.pisoId}
                  onChange={(e) => setRoomForm({ ...roomForm, pisoId: e.target.value })}
                  required
                >
                  {floors.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.nombre} ({f.tipo})
                    </option>
                  ))}
                </select>
              </div>

              {!roomForm.id && (
                <div className="form-group">
                  <label>Cantidad de camas iniciales:</label>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    value={roomForm.bedsCount}
                    onChange={(e) => setRoomForm({ ...roomForm, bedsCount: e.target.value })}
                  />
                </div>
              )}

              <div className="modal-actions">
                <button type="button" className="btn-cancel" onClick={() => setShowRoomModal(false)}>
                  Cancelar
                </button>
                <button type="submit" className="btn-confirm">
                  {roomForm.id ? "Actualizar" : "Crear Habitación"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- MODAL CAMA --- */}
      {showBedModal && (
        <div className="modal-backdrop">
          <div className="modal-content">
            <h3>{bedForm.id ? "Editar Cama" : "Agregar Cama"}</h3>
            <form onSubmit={handleSaveBed}>
              <div className="form-group">
                <label>Número de Cama:</label>
                <input
                  type="number"
                  placeholder="Ej: 1"
                  value={bedForm.numero}
                  onChange={(e) => setBedForm({ ...bedForm, numero: e.target.value })}
                  required
                />
              </div>

              <div className="form-group">
                <label>Habitación de Destino:</label>
                <select
                  value={bedForm.habitacionId}
                  onChange={(e) => setBedForm({ ...bedForm, habitacionId: e.target.value })}
                  required
                >
                  {rooms.map((r) => (
                    <option key={r.id} value={r.id}>
                      Habitación #{r.number} ({r.floor})
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>Estado Inicial:</label>
                <select
                  value={bedForm.status}
                  onChange={(e) => setBedForm({ ...bedForm, status: e.target.value })}
                >
                  <option value="disponible">Disponible</option>
                  <option value="ocupada">Ocupada</option>
                  <option value="enlimpieza">En Limpieza</option>
                </select>
              </div>

              <div className="modal-actions">
                <button type="button" className="btn-cancel" onClick={() => setShowBedModal(false)}>
                  Cancelar
                </button>
                <button type="submit" className="btn-confirm">
                  {bedForm.id ? "Actualizar Cama" : "Crear Cama"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- MODAL ASISTENTE HOSPITAL COMPLETO --- */}
      {showFullHospitalModal && (
        <div className="modal-backdrop">
          <div className="modal-content" style={{ maxWidth: "540px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <FaHospital style={{ fontSize: "24px", color: "#10B981" }} />
              <div>
                <h3 style={{ margin: 0 }}>Crear Hospital Completo (Asistente 1-Clic)</h3>
                <p style={{ margin: "2px 0 0", fontSize: "0.75rem", color: "#64748B" }}>
                  Genera la institución, establecimiento, pisos, habitaciones y camas totalmente funcionales de forma automática.
                </p>
              </div>
            </div>

            <form onSubmit={handleCreateFullHospital}>
              <div className="form-group">
                <label>Nombre del Hospital / Nosocomio:</label>
                <input
                  type="text"
                  placeholder="Ej: Hospital Privado Córdoba"
                  value={fullHospitalForm.nombreNosocomio}
                  onChange={(e) => setFullHospitalForm({ ...fullHospitalForm, nombreNosocomio: e.target.value })}
                  required
                />
              </div>

              <div className="form-group">
                <label>Nombre del Establecimiento Inicial:</label>
                <input
                  type="text"
                  placeholder="Ej: Establecimiento Central"
                  value={fullHospitalForm.nombreSucursal}
                  onChange={(e) => setFullHospitalForm({ ...fullHospitalForm, nombreSucursal: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label>Dirección:</label>
                <input
                  type="text"
                  placeholder="Ej: Av. Naciones Unidas 345"
                  value={fullHospitalForm.direccionNosocomio}
                  onChange={(e) => setFullHospitalForm({ ...fullHospitalForm, direccionNosocomio: e.target.value, direccionSucursal: e.target.value })}
                />
              </div>

              <div className="hospital-wizard-grid" style={{ background: "#F8FAFC", padding: "12px", borderRadius: "10px", border: "1px solid #E2E8F0" }}>
                <div className="form-group">
                  <label style={{ fontSize: "0.75rem" }}>Cantidad de Pisos:</label>
                  <input
                    type="number"
                    min="1"
                    max="20"
                    value={fullHospitalForm.cantidadPisos}
                    onChange={(e) => setFullHospitalForm({ ...fullHospitalForm, cantidadPisos: e.target.value })}
                    required
                  />
                </div>
                <div className="form-group">
                  <label style={{ fontSize: "0.75rem" }}>Habs. por Piso (0 = Camas Directas):</label>
                  <input
                    type="number"
                    min="0"
                    max="30"
                    value={fullHospitalForm.habitacionesPorPiso}
                    onChange={(e) => setFullHospitalForm({ ...fullHospitalForm, habitacionesPorPiso: e.target.value })}
                    required
                  />
                </div>
                <div className="form-group">
                  <label style={{ fontSize: "0.75rem" }}>Camas por Hab./Piso:</label>
                  <input
                    type="number"
                    min="1"
                    max="15"
                    value={fullHospitalForm.camasPorHabitacion}
                    onChange={(e) => setFullHospitalForm({ ...fullHospitalForm, camasPorHabitacion: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div className="form-group" style={{ marginTop: "10px" }}>
                <label>Personal a cargo inicial (Opcional):</label>
                <select
                  value={fullHospitalForm.enfermeroAsignadoId || ""}
                  onChange={(e) => setFullHospitalForm({ ...fullHospitalForm, enfermeroAsignadoId: e.target.value })}
                >
                  <option value="">Sin personal asignado (Opcional por Nosocomio)</option>
                  {staffUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.nombre} ({u.rol === "enfermeria" ? "Enfermería" : u.rol === "encargado" ? "Encargado" : u.rol})
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ fontSize: "0.75rem", color: "#059669", background: "#ECFDF5", padding: "8px 12px", borderRadius: "6px", fontWeight: "600" }}>
                Configuración completamente adaptable: {(parseInt(fullHospitalForm.cantidadPisos, 10) || 1)} pisos y {parseInt(fullHospitalForm.habitacionesPorPiso, 10) === 0 ? "camas colocadas de forma directa por urgencias" : `${(parseInt(fullHospitalForm.cantidadPisos, 10) || 1) * (parseInt(fullHospitalForm.habitacionesPorPiso, 10) || 1)} habitaciones con camas personalizadas`}.
              </div>

              <div className="modal-actions">
                <button type="button" className="btn-cancel" onClick={() => setShowFullHospitalModal(false)}>
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn-confirm"
                  style={{ background: "linear-gradient(135deg, #10B981 0%, #059669 100%)" }}
                >
                  <FaHospital /> Generar Infraestructura de Hospital
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- MODAL CREAR / EDITAR USUARIO STAFF ENFERMERÍA --- */}
      {showUserModal && (
        <div className="modal-backdrop">
          <div className="modal-content">
            <h3>{userForm.id ? "Editar Perfil de Enfermería" : "Registrar Usuario de Enfermería"}</h3>
            <form onSubmit={handleSaveUser}>
              <div className="form-group">
                <label>Nombre Completo:</label>
                <input
                  type="text"
                  placeholder="Ej: Lic. María Elena Fernández"
                  value={userForm.nombre}
                  onChange={(e) => setUserForm({ ...userForm, nombre: e.target.value })}
                  required
                />
              </div>

              <div className="form-group">
                <label>Correo Electrónico:</label>
                <input
                  type="email"
                  placeholder="ejemplo@hospital.com"
                  value={userForm.email}
                  onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}
                  required
                />
              </div>

              <div className="form-group">
                <label>Contraseña / Clave de Acceso:</label>
                <input
                  type="password"
                  placeholder={userForm.id ? "Dejar en blanco para mantener la actual" : "Mínimo 4 caracteres"}
                  value={userForm.password}
                  onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label>Hospital Asignado:</label>
                <select
                  value={userForm.nosocomioId}
                  onChange={(e) => setUserForm({ ...userForm, nosocomioId: e.target.value, sucursalId: "" })}
                >
                  <option value="">-- Todos los Hospitales --</option>
                  {nosocomios.map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.nombre}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>Establecimiento / Sede Asignada:</label>
                <select
                  value={userForm.sucursalId || ""}
                  onChange={(e) => setUserForm({ ...userForm, sucursalId: e.target.value })}
                >
                  <option value="">Todas las sucursales del hospital (Global)</option>
                  {(() => {
                    const modalNosocomio = nosocomios.find((n) => n.id.toString() === userForm.nosocomioId?.toString());
                    const list = modalNosocomio?.sucursales || sucursalesList;
                    return list.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.nombre}
                      </option>
                    ));
                  })()}
                </select>
              </div>

              <div className="form-group">
                <label>Rol de Usuario:</label>
                <select
                  value={userForm.rol}
                  onChange={(e) => setUserForm({ ...userForm, rol: e.target.value })}
                >
                  <option value="enfermeria">Enfermería</option>
                  <option value="encargado">Encargado de Hospital</option>
                </select>
              </div>

              <div className="modal-actions">
                <button type="button" className="btn-cancel" onClick={() => setShowUserModal(false)}>
                  Cancelar
                </button>
                <button type="submit" className="btn-confirm">
                  {userForm.id ? "Actualizar Usuario" : "Guardar Perfil"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- MODAL EDITAR NOSOCOMIO --- */}
      {showEditNosocomioModal && (
        <div className="modal-backdrop">
          <div className="modal-content">
            <h3>Editar Datos del Nosocomio</h3>
            <form onSubmit={handleSaveEditNosocomio}>
              <div className="form-group">
                <label>Nombre del Hospital / Nosocomio:</label>
                <input
                  type="text"
                  value={editNosocomioForm.nombre}
                  onChange={(e) => setEditNosocomioForm({ ...editNosocomioForm, nombre: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label>Código Institucional:</label>
                <input
                  type="text"
                  value={editNosocomioForm.codigo}
                  onChange={(e) => setEditNosocomioForm({ ...editNosocomioForm, codigo: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label>Dirección Principal:</label>
                <input
                  type="text"
                  value={editNosocomioForm.direccion}
                  onChange={(e) => setEditNosocomioForm({ ...editNosocomioForm, direccion: e.target.value })}
                />
              </div>
              <div className="modal-actions">
                <button type="button" className="btn-cancel" onClick={() => setShowEditNosocomioModal(false)}>
                  Cancelar
                </button>
                <button type="submit" className="btn-confirm">
                  Actualizar Nosocomio
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- MODAL EDITAR SUCURSAL / ESTABLECIMIENTO --- */}
      {showEditSucursalModal && (
        <div className="modal-backdrop">
          <div className="modal-content">
            <h3>Editar Establecimiento / Sede</h3>
            <form onSubmit={handleSaveEditSucursal}>
              <div className="form-group">
                <label>Nombre de la Sede / Establecimiento:</label>
                <input
                  type="text"
                  value={editSucursalForm.nombre}
                  onChange={(e) => setEditSucursalForm({ ...editSucursalForm, nombre: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label>Dirección:</label>
                <input
                  type="text"
                  value={editSucursalForm.direccion}
                  onChange={(e) => setEditSucursalForm({ ...editSucursalForm, direccion: e.target.value })}
                />
              </div>
              <div className="modal-actions">
                <button type="button" className="btn-cancel" onClick={() => setShowEditSucursalModal(false)}>
                  Cancelar
                </button>
                <button type="submit" className="btn-confirm">
                  Actualizar Establecimiento
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- MODAL CREAR / EDITAR PISO --- */}
      {showFloorModal && (
        <div className="modal-backdrop">
          <div className="modal-content">
            <h3>{floorForm.id ? "Editar Piso Hospitalario" : "Registrar Nuevo Piso Hospitalario"}</h3>
            <form onSubmit={handleSaveFloor}>
              <div className="form-group">
                <label>Nombre del Piso:</label>
                <input
                  type="text"
                  placeholder="Ej: Piso 1 - Cuidados Intensivos"
                  value={floorForm.nombre}
                  onChange={(e) => setFloorForm({ ...floorForm, nombre: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label>Tipo de Piso:</label>
                <select
                  value={floorForm.tipo}
                  onChange={(e) => {
                    const val = e.target.value;
                    const key = val.toLowerCase().replace(/ /g, "");
                    setFloorForm({ ...floorForm, tipo: val, tipoKey: key });
                  }}
                >
                  <option value="General">Internación General</option>
                  <option value="Intensiva">Cuidados Intensivos (UTI)</option>
                  <option value="Guardia">Guardia & Urgencias Directas</option>
                  <option value="Privada">Sector Privado / Suite</option>
                </select>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn-cancel" onClick={() => setShowFloorModal(false)}>
                  Cancelar
                </button>
                <button type="submit" className="btn-confirm">
                  {floorForm.id ? "Actualizar Piso" : "Crear Piso"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Confirmación de Eliminación de Nosocomio con Descarga de Historial */}
      {showDeleteNosocomioModal && (
        <div className="modal-overlay" style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(15, 23, 42, 0.65)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1200, padding: "16px" }}>
          <div style={{ background: "#FFFFFF", borderRadius: "16px", padding: "24px", maxWidth: "520px", width: "100%", boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1)", border: "1px solid #E2E8F0" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "16px", color: "#DC2626" }}>
              <FaExclamationTriangle style={{ fontSize: "24px" }} />
              <h3 style={{ margin: 0, fontSize: "1.2rem", fontWeight: "700" }}>
                ¿Eliminar Nosocomio Definitivamente?
              </h3>
            </div>
            <p style={{ color: "#334155", fontSize: "0.9rem", lineHeight: "1.5", marginBottom: "16px" }}>
              Estás a punto de eliminar <strong>{currentNosocomio?.nombre}</strong> de la base de datos.
              <br />
              <span style={{ color: "#991B1B", fontWeight: "600", display: "block", marginTop: "6px" }}>
                ⚠️ Se borrarán físicamente todas sus sedes, pisos, habitaciones, camas, usuarios de staff y URLs asociadas. Esta acción no se puede deshacer.
              </span>
            </p>

            <div style={{ background: "#EFF6FF", border: "1px solid #BFDBFE", borderRadius: "10px", padding: "12px 16px", marginBottom: "20px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
              <div style={{ fontSize: "0.85rem", color: "#1E40AF" }}>
                💡 Podés descargar un respaldo del historial de actividad antes de continuar.
              </div>
              <button
                type="button"
                onClick={() => exportHospitalAuditHistoryCSV(selectedNosocomioId, selectedSucursalId, currentNosocomio?.nombre)}
                style={{ background: "#2563EB", color: "#FFFFFF", border: "none", borderRadius: "8px", padding: "8px 14px", fontSize: "0.8rem", fontWeight: "600", cursor: "pointer", display: "flex", alignItems: "center", gap: "6px", flexShrink: 0 }}
              >
                📥 Descargar CSV
              </button>
            </div>

            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={() => setShowDeleteNosocomioModal(false)}
                style={{ padding: "8px 16px", borderRadius: "8px", border: "1px solid #CBD5E1", background: "#FFFFFF", cursor: "pointer", fontSize: "0.85rem", fontWeight: "600", color: "#475569" }}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleDeleteNosocomioConfirm}
                style={{ padding: "8px 16px", borderRadius: "8px", border: "none", background: "#DC2626", color: "#FFFFFF", cursor: "pointer", fontSize: "0.85rem", fontWeight: "700", display: "flex", alignItems: "center", gap: "6px" }}
              >
                <FaTrash /> Confirmar y Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
