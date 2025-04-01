import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Login from "./components/auth/login/Login";
import Verification from "./components/auth/pages/Verify";
import Dashboard from "./components/auth/dashboard/Dashboard";
import Register from "./components/auth/register/Register"; 
function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/verify" element={<Verification />} />
        <Route path="/register" element={<Register />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;