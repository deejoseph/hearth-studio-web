import { useState } from "react";
import { NavLink } from "react-router-dom";
import "./Header.css";
import { useAuth } from "../context/AuthContext";

export default function Header() {
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  const displayName = user?.display_name || user?.name || "User";
  const avatarUrl = user?.avatar_url || "";
  const avatarFallback = (displayName || "U").charAt(0).toUpperCase();

  const closeMenu = () => setMenuOpen(false);

  return (
    <header className="header">
      <div className="header-inner">
        <button
          className="nav-toggle"
          type="button"
          onClick={() => setMenuOpen((prev) => !prev)}
          aria-label="Toggle navigation menu"
          aria-expanded={menuOpen}
        >
          {menuOpen ? "Close" : "Menu"}
        </button>

        <nav className={`nav ${menuOpen ? "open" : ""}`}>
          <NavLink to="/" className="nav-link" onClick={closeMenu}>
            Home
          </NavLink>

          <NavLink to="/story" className="nav-link" onClick={closeMenu}>
            Story
          </NavLink>

          <NavLink to="/collection" className="nav-link" onClick={closeMenu}>
            Collection
          </NavLink>

          <NavLink to="/customize" className="nav-link" onClick={closeMenu}>
            Customize
          </NavLink>

          {user ? (
            <>
              <NavLink to="/profile" className="nav-user nav-link" onClick={closeMenu}>
                {avatarUrl ? (
                  <img src={avatarUrl} alt={displayName} className="nav-avatar" />
                ) : (
                  <span className="nav-avatar nav-avatar-fallback">{avatarFallback}</span>
                )}
                <span>Hi, {displayName}</span>
              </NavLink>
              <button
                onClick={() => {
                  logout();
                  closeMenu();
                }}
                className="nav-link logout-btn"
              >
                Logout
              </button>
            </>
          ) : (
            <NavLink to="/login" className="nav-link" onClick={closeMenu}>
              Login
            </NavLink>
          )}
        </nav>
      </div>
    </header>
  );
}
