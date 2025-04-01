import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";

export default function Dashboard() {
  const [userInfo, setUserInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    // Check if user is authenticated
    const token = localStorage.getItem("token");
    if (!token) {
      navigate("/login");
      return;
    }

    // Fetch user info
    async function fetchUserInfo() {
      try {
        // This would be your actual API call
        // const response = await fetch('/api/user', {
        //   headers: { Authorization: `Bearer ${token}` }
        // });
        // const data = await response.json();
        
        // For now, we'll mock some user data
        const mockData = {
          name: "Test User",
          email: "user@example.com",
          lastLogin: new Date().toLocaleString()
        };
        
        setUserInfo(mockData);
      } catch (error) {
        console.error("Error fetching user data:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchUserInfo();
  }, [navigate]);

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("refreshToken");
    navigate("/login");
  };

  if (loading) {
    return <div className="dashboard-loading">Loading dashboard...</div>;
  }

  return (
    <div className="dashboard-container">
      <header className="dashboard-header">
        <h1>Welcome to Your Dashboard</h1>
        <button onClick={handleLogout} className="logout-button">Logout</button>
      </header>

      <main className="dashboard-content">
        {userInfo && (
          <div className="user-info-card">
            <h2>User Information</h2>
            <p><strong>Name:</strong> {userInfo.name}</p>
            <p><strong>Email:</strong> {userInfo.email}</p>
            <p><strong>Last Login:</strong> {userInfo.lastLogin}</p>
          </div>
        )}

        <div className="dashboard-actions">
          <h2>Quick Actions</h2>
          <div className="action-buttons">
            <button className="action-button">View Profile</button>
            <button className="action-button">Security Settings</button>
            <button className="action-button">Account Options</button>
          </div>
        </div>
      </main>
    </div>
  );
}