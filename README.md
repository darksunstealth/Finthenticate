# distributed login pipeline fastify ws redis
Secure, scalable login system built with Fastify, Redis, RabbitMQ, and WebSocket. Handles authentication via message queues, processes login asynchronously, and responds to clients in real-time using WebSocket. Ideal for SaaS, fintechs, or high-availability systems.

# 🔐 Distributed Login System with Fastify + Redis + AMQP + WebSocket

A secure, asynchronous login architecture built with **Fastify**, **Redis**, **RabbitMQ**, and **WebSocket**, ideal for SaaS and fintech applications. The system is fully decoupled and real-time ready, processing authentication via message queues and responding to clients using WebSocket.

---

## 📊 Architecture Overview

```
Client → LoginController → Redis + AMQP (login_queue)
                            ↓
                   LoginWorker consumes batch
                            ↓
      Verifies device & session → Redis
                            ↓
              Generates JWT & Refresh Token
                            ↓
            Responds via WebSocket (connectionId)
```

![Login Flow Diagram](./login_flow_diagram.png)

---

## ⚙️ Tech Stack

| Tool        | Usage                               |
|-------------|-------------------------------------|
| Fastify     | HTTP Server                         |
| Redis       | Cache, Sessions, Login Attempts     |
| RabbitMQ    | AMQP queue (login_queue)            |
| WebSocket   | Real-time login response            |
| Argon2id    | Password hashing                    |
| Speakeasy   | 2FA (Two-Factor Authentication)     |
| JSON Web Token | Session & Auth Token management |

---

## 🚀 Features

✅ Distributed login with retry-safe worker  
✅ Session management in Redis  
✅ Token + Refresh token issuance  
✅ Device verification + temporary token  
✅ Secure password hashing (argon2id)  
✅ Real-time feedback using WebSocket  
✅ 2FA Support using TOTP

---

## 🧪 How to Run Locally

```bash
git clone https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
cd YOUR_REPO_NAME
docker-compose up --build
```

Then access:
- Fastify API: http://localhost:3001
- WebSocket Server: ws://localhost:8080
- RabbitMQ UI: http://localhost:15672 (user/pass: guest)

---

## 📂 Project Structure

```
backend/
├── app/
│   └── workers/login/         # LoginWorker + AMQP consumer
│   └── producers/login/       # LoginController (API layer)
├── services/
│   ├── redis/                 # Redis manager
│   ├── wss/                   # WebSocket server + manager
├── logger/                    # Winston-based logger
├── models/                    # Sequelize or Redis model mappings
└── server.js                  # Fastify entry point
```

---

## 🔒 Security Considerations
- Strong password enforcement (min length, complexity, entropy)
- Login rate limiting via Redis ZSET
- Token TTL and refresh control via Redis
- Detection of suspicious input patterns (XSS, SQLi, etc.)

---

## ✨ Use Cases
- SaaS login infrastructure
- Crypto exchanges & OTC desks
- Microservices auth module
- Projects needing real-time response without polling

---

## 🧠 Why this architecture?
> "Authentication is not just verifying a password — it's about control, scalability, and timing."

This system separates concerns:
- **LoginController** handles validation
- **Redis** stores only what's needed
- **AMQP** decouples heavy logic from request/response
- **LoginWorker** handles processing in batch
- **WebSocket** gives real-time feedback with zero wait

---

## 📌 Tags
#NodeJS #Fastify #Redis #RabbitMQ #WebSocket #Authentication #AMQP #LoginSystem #JWT

---

## 🧑‍💻 Author
**Samir Sauma** – solo dev behind a complete distributed crypto exchange stack. Passionate about real-time systems, async design, and resilient architecture.

> If you like this project, give it a ⭐ and share it!

---

## 📝 License
MIT
