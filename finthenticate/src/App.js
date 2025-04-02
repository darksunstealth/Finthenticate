import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ThemeProvider, CssBaseline } from "@mui/material";
import Login from "./components/auth/login/Login";
import Verification from "./components/auth/pages/Verify";
import Dashboard from "./components/auth/dashboard/Dashboard";
import Register from "./components/auth/register/Register";
import Home from "./components/auth/pages/Home";
import theme from "./theme"; // Crie este arquivo com seu tema personalizado

function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="/verify" element={<Verification />} />
          <Route path="/register" element={<Register />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  );
}

export default App;