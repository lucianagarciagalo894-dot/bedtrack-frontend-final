import { NavLink } from "react-router-dom";
import {
  FaHospitalAlt,
  FaChartLine,
  FaBed,
  FaDoorOpen,
  FaUserInjured,
  FaHistory,
  FaSignOutAlt,
  FaTimes,
} from "react-icons/fa";

const navLinkClass = ({ isActive }) =>
  `nav-item${isActive ? " active" : ""}`;

export default function Sidebar({ role, hospitalInfo, onLogout, isOpen, onClose }) {
  const isEnfermeria = role === "enfermeria";
  const userName = isEnfermeria ? "Enfermero/a" : "Encargado";
  const userInitial = isEnfermeria ? "E" : "E";

  return (
    <aside
      className={`sidebar${isOpen ? " open" : ""}`}
      role="navigation"
      aria-label="Navegación principal"
    >
      {/* Brand */}
      <div className="sidebar-brand">
        <div className="sidebar-brand-icon" aria-hidden="true">
          <FaHospitalAlt />
        </div>
        <span className="sidebar-brand-text">
          Bed<span>Track</span>
        </span>
        <button
          className="sidebar-close-btn"
          onClick={onClose}
          aria-label="Cerrar menú"
        >
          <FaTimes />
        </button>
      </div>

      {/* Navigation */}
      <nav className="sidebar-nav" aria-label="Menú principal">
        <span className="nav-section-label">Principal</span>

        <NavLink to="/dashboard" className={navLinkClass} onClick={onClose}>
          <span className="nav-item-icon" aria-hidden="true">
            <FaChartLine />
          </span>
          Dashboard
        </NavLink>

        <NavLink to="/camas" className={navLinkClass} onClick={onClose}>
          <span className="nav-item-icon" aria-hidden="true">
            <FaBed />
          </span>
          Camas
        </NavLink>

        <NavLink to="/habitaciones" className={navLinkClass} onClick={onClose}>
          <span className="nav-item-icon" aria-hidden="true">
            <FaDoorOpen />
          </span>
          Habitaciones
        </NavLink>

        <NavLink to="/pacientes" className={navLinkClass} onClick={onClose}>
          <span className="nav-item-icon" aria-hidden="true">
            <FaUserInjured />
          </span>
          Pacientes
        </NavLink>

        <NavLink to="/historial" className={navLinkClass} onClick={onClose}>
          <span className="nav-item-icon" aria-hidden="true">
            <FaHistory />
          </span>
          Historial de Actividad
        </NavLink>
      </nav>

      {/* User / Logout */}
      <div className="sidebar-footer">
        <div className="sidebar-user">
          <div className="sidebar-avatar" aria-hidden="true">
            {userInitial}
          </div>
          <div className="sidebar-user-info">
            <div className="sidebar-user-name">{userName}</div>
            <div className="sidebar-user-role" style={{ fontSize: "0.7rem" }}>
              {role} {hospitalInfo ? `• ${hospitalInfo.hospital}` : ""}
            </div>
          </div>
          <button
            className="sidebar-logout-btn"
            onClick={onLogout}
            title="Cerrar sesión"
            aria-label="Cerrar sesión"
          >
            <FaSignOutAlt />
          </button>
        </div>
      </div>
    </aside>
  );
}
