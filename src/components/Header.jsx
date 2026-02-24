import { NavLink } from "react-router-dom";
import "./Header.css";

export default function Header() {
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

        <NavLink to="/login" className="nav-link">
          Login
        </NavLink>
      </nav>
    </header>
  );
}