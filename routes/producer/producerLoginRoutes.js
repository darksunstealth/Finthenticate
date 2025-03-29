

import { loginHandler, verifyTwoFactorHandler, logoutHandler, verifyDeviceHandler } from "../../services/loginService/loginService.js";

export default function registerLoginRoutes(fastify) {
// Instead of binding everything in a class, we just define routes

fastify.post("/api/v1/auth/login", async (req, res) => {
 return loginHandler(req, res);
});

fastify.post("/api/v1/verify-2fa", async (req, res) => {
 return verifyTwoFactorHandler(req, res);
});

fastify.post("/api/v1/logout", async (req, res) => {
 return logoutHandler(req, res);
});

fastify.post("/api/v1/verify-device", async (req, res) => {
 return verifyDeviceHandler(req, res);
});
}