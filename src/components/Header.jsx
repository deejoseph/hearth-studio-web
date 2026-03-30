import { NavLink } from "react-router-dom";
import "./Header.css";
import { useAuth } from "../context/AuthContext";

export default function Header() {
  const { user, logout } = useAuth();
  const displayName = user?.display_name || user?.name || "User";
  const avatarUrl = user?.avatar_url || "";
  const avatarFallback = (displayName || "U").charAt(0).toUpperCase();

  return (
    <header className="header">
      <nav className="nav">
        <NavLink to="/" className="nav-link">
          Home
        </NavLink>

        <NavLink to="/story" className="nav-link">
          Story
        </NavLink>

        <NavLink to="/collection" className="nav-link">
          Collection
        </NavLink>

        <NavLink to="/customize" className="nav-link">
          Customize
        </NavLink>

        {user ? (
          <>
            <NavLink to="/profile" className="nav-user nav-link">
              {avatarUrl ? (
                <img src={avatarUrl} alt={displayName} className="nav-avatar" />
              ) : (
                <span className="nav-avatar nav-avatar-fallback">{avatarFallback}</span>
              )}
              <span>Hi, {displayName}</span>
            </NavLink>
            <button onClick={logout} className="nav-link logout-btn">
              Logout
            </button>
          </>
        ) : (
          <NavLink to="/login" className="nav-link">
            Login
          </NavLink>
        )}
      </nav>
    </header>
  );
}
