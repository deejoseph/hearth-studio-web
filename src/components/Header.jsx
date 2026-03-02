import { NavLink } from "react-router-dom";
import "./Header.css";
import { useAuth } from "../context/AuthContext";

export default function Header() {
  const { user, logout } = useAuth();

  return (
    <header className="header">
      <nav className="nav">
        <NavLink to="/" end className="nav-link">
          Home
        </NavLink>

        <NavLink to="/Collection" className="nav-link">
          Collection
        </NavLink>

        <NavLink to="/customize" className="nav-link">
          Customize
        </NavLink>

        {user ? (
  <>
    <span className="nav-link">Hi, {user.name}</span>
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