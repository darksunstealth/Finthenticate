import React from "react";
import { Link as RouterLink } from "react-router-dom";
import {
  Box,
  Button,
  Container,
  Typography,
  Paper,
  Grid,
  CssBaseline,
  Link,
} from "@mui/material";
import { createTheme, ThemeProvider } from "@mui/material/styles";
import { Security, Speed, Devices } from "@mui/icons-material";

const theme = createTheme({
  palette: {
    primary: {
      main: "#1976d2",
    },
    secondary: {
      main: "#dc004e",
    },
    background: {
      default: "#f5f5f5",
    },
  },
  typography: {
    fontFamily: '"Roboto", "Helvetica", "Arial", sans-serif',
    h2: {
      fontWeight: 700,
      fontSize: "2.5rem",
    },
    h4: {
      fontWeight: 600,
    },
  },
});

const Feature = ({ icon, title, description }) => (
  <Paper elevation={2} sx={{ p: 3, height: "100%", borderRadius: 2 }}>
    <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
      {icon}
      <Typography variant="h5" component="h3" sx={{ my: 2 }}>
        {title}
      </Typography>
      <Typography variant="body1" color="text.secondary">
        {description}
      </Typography>
    </Box>
  </Paper>
);

export default function Home() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box
        sx={{
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Hero Section */}
        <Box
          sx={{
            py: 8,
            backgroundColor: "primary.main",
            color: "white",
          }}
        >
          <Container maxWidth="lg">
            <Grid container spacing={4} alignItems="center">
              <Grid item xs={12} md={7}>
                <Typography variant="h2" component="h1" gutterBottom>
                  Secure Authentication System
                </Typography>
                <Typography variant="h5" paragraph>
                  A distributed login pipeline with advanced security features for enterprise applications.
                </Typography>
                <Box sx={{ mt: 4 }}>
                  <Button
                    component={RouterLink}
                    to="/login"
                    variant="contained"
                    color="secondary"
                    size="large"
                    sx={{ mr: 2, mb: 2, px: 4 }}
                  >
                    Login
                  </Button>
                  <Button
                    component={RouterLink}
                    to="/register"
                    variant="outlined"
                    color="inherit"
                    size="large"
                    sx={{ mb: 2, px: 4 }}
                  >
                    Register
                  </Button>
                </Box>
              </Grid>
              <Grid item xs={12} md={5}>
                <Box
                  sx={{
                    bgcolor: "background.paper",
                    p: 3,
                    borderRadius: 2,
                    boxShadow: 5,
                    textAlign: "center",
                    color: "text.primary",
                  }}
                >
                  <Security sx={{ fontSize: 80, color: "primary.main" }} />
                  <Typography variant="h4" sx={{ mt: 2 }}>
                    Enterprise-Grade Security
                  </Typography>
                </Box>
              </Grid>
            </Grid>
          </Container>
        </Box>

        {/* Features Section */}
        <Container sx={{ py: 8 }} maxWidth="lg">
          <Typography
            variant="h4"
            component="h2"
            align="center"
            gutterBottom
            sx={{ mb: 6 }}
          >
            Key Features
          </Typography>

          <Grid container spacing={4}>
            <Grid item xs={12} md={4}>
              <Feature
                icon={<Security sx={{ fontSize: 60, color: "primary.main" }} />}
                title="Advanced Security"
                description="Multi-factor authentication, device recognition, and real-time threat detection to protect your accounts."
              />
            </Grid>
            <Grid item xs={12} md={4}>
              <Feature
                icon={<Speed sx={{ fontSize: 60, color: "primary.main" }} />}
                title="High Performance"
                description="Distributed architecture with WebSockets and Redis for lightning-fast authentication processes."
              />
            </Grid>
            <Grid item xs={12} md={4}>
              <Feature
                icon={<Devices sx={{ fontSize: 60, color: "primary.main" }} />}
                title="Device Management"
                description="Intelligent device recognition and management to provide secure access across all your devices."
              />
            </Grid>
          </Grid>
        </Container>

        {/* Footer */}
        <Box
          component="footer"
          sx={{
            py: 3,
            mt: "auto",
            backgroundColor: "grey.200",
          }}
        >
          <Container maxWidth="lg">
            <Typography variant="body2" color="text.secondary" align="center">
              © {new Date().getFullYear()} Secure Authentication System
              {" | "}
              <Link component={RouterLink} to="/login" color="inherit">
                Login
              </Link>
              {" | "}
              <Link component={RouterLink} to="/register" color="inherit">
                Register
              </Link>
            </Typography>
          </Container>
        </Box>
      </Box>
    </ThemeProvider>
  );
}