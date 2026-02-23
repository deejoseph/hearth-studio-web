import { Outlet, useNavigate } from "react-router-dom";
import "../styles/Auth.css";

export default function AuthLayout() {
  const navigate = useNavigate();

  return (
    <div className="auth-wrapper">
      <div className="auth-container">

        <button 
          className="auth-back"
          onClick={() => navigate(-1)}
        >
          ← Back
        </button>

        <div className="auth-card">
          <Outlet />
        </div>

      </div>
    </div>
  );
}