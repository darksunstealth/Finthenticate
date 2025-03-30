
# 🔐 Finthenticate — Distributed Login System (SaaS-Ready)

![Build](https://img.shields.io/badge/build-passing-brightgreen)
![Redis](https://img.shields.io/badge/cache-redis-red)
![RabbitMQ](https://img.shields.io/badge/queue-rabbitmq-orange)
![WebSocket](https://img.shields.io/badge/websocket-enabled-blue)
![License](https://img.shields.io/badge/license-MIT-lightgrey)
![Platform](https://img.shields.io/badge/platform-nodejs-yellow)

> Realtime login. Session-aware. Ultra-performatic. For SaaS, fintechs or scalable products — this is the authentication system you wish you had built.

---

## 🚨 What is Finthenticate?

A **distributed**, asynchronous login system built with **Fastify**, **Redis**, **RabbitMQ**, and **WebSocket**, made for modern SaaS apps. Authentication via queue. Response via WebSocket. Session awareness via `connectionId`. All buffered and batch-processed with Redis pipelines.

---

## 🧠 Architecture Overview

```
User
 ↓ WebSocket
Frontend (React) 
 ↓
WebSocket Server <--> wss-manager
 ↓
Producers (login/register)
 ↓
RabbitMQ
 ↓
Consumers (login/register)
 ↓
Redis (pipeline + batch)
 ↓
WebSocket Response (JWT, status, feedback)
```

---

## 🗂 Project Structure

```
login-auth/
├── app.js                  # Entry point
├── app/
│   ├── producers/          # Microservices (login, register)
│   └── consumers/          # Queue handlers
├── services/
│   ├── wss/                # WebSocket logic
│   ├── loginService/       # Auth engine
│   ├── redis/              # Pipeline, batch, cache
│   ├── mail/               # Email service
│   └── amqp/               # Queue handler
├── logger/                 # Custom Winston-based logger
├── routes/                 # Optional REST API
├── finthenticate/          # React frontend
```

---

## 🛰 Login Workflow

1. User accesses the page → WebSocket connects.
2. `connectionId` is generated and tied to the session.
3. Frontend sends login/register payload.
4. Payload is sent to a `Producer` (buffered).
5. Producer publishes to RabbitMQ.
6. Consumer validates, authenticates, generates JWT.
7. JWT is returned to frontend via WebSocket using the `connectionId`.

---

## 🧪 Technical Features

- 🔗 Login via WebSocket (REST optional)
- 🧵 Session tracking with `connectionId`
- 🧬 JWT via WebSocket
- ⚡ Redis pipeline + batch
- 🛠 Microservice architecture
- 💌 Email service via RabbitMQ
- 🧱 Horizontal scaling ready (HPA)

---

## ⚙️ Running the Project

```bash
git clone https://github.com/your-user/login-auth.git
cd login-auth
chmod +x setup.sh
./setup.sh
```

Run Redis and RabbitMQ via Docker or on your preferred infra. K8s-ready.

---

## 📈 DOT Graph

```dot
digraph G {
    rankdir=LR;
    Frontend -> WebSocket;
    WebSocket -> WSS-Manager;
    WSS-Manager -> LoginProducer;
    WSS-Manager -> RegisterProducer;
    LoginProducer -> AMQP;
    RegisterProducer -> AMQP;
    AMQP -> LoginConsumer;
    AMQP -> RegisterConsumer;
    LoginConsumer -> LoginService;
    LoginService -> Redis;
    RegisterConsumer -> Redis;
    RegisterConsumer -> EmailService;
    EmailService -> EmailQueue;
    Logger -> FileSystem;
}
```

---

## 🧰 Stack

- Fastify + Node.js
- React (frontend)
- Redis (pipelined)
- RabbitMQ
- WebSocket (wss-server)
- Winston Logger
- Docker & K8s

---

## 💡 Use Cases

- Blazing fast login with realtime response
- Realtime user tracking and session awareness
- Multi-client management and message routing
- Fraud detection and prevention (WIP)

---

## 📜 License

MIT — Free to use, modify, scale. Don’t be slow. Or dishonest.

---

## ⭐ Final Words

> Built by one, to be used by many.  
> Not made by a squad with Jira, but by a mind that never stops.

If you liked it, drop a ⭐ and share it.
