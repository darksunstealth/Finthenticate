# 🔐 Finthenticate — Real-Time, Distributed Login Engine for Modern SaaS

![Build](https://img.shields.io/badge/build-passing-brightgreen)
![Redis](https://img.shields.io/badge/cache-redis-red)
![RabbitMQ](https://img.shields.io/badge/queue-rabbitmq-orange)
![WebSocket](https://img.shields.io/badge/websocket-enabled-blue)
![License](https://img.shields.io/badge/license-MIT-lightgrey)
![Platform](https://img.shields.io/badge/platform-nodejs-yellow)

> Realtime login. Session-aware. Ultra-performant. Built for SaaS, fintechs, and platforms that care about user state, speed, and microservice architecture.

---

## 🚀 Project Vision

Finthenticate bridges two powerful paradigms:  
- **Secure and structured** API & WebSocket requests.  
- **Fast and distributed** internal communication via Redis pub/sub and RabbitMQ.

With this platform, you unlock **real-time client interaction** across your system.  
Track sessions, observe user behavior, and control interactions — all without compromising performance.

> You get complete control over what happens with your user, in real time.

This is a next-gen solution for collecting session data, user status, and dynamic events — perfect for:
- Behavioral tracking
- User state monitoring
- Smart onboarding
- Marketing intelligence

---

## ⚙️ How It Works

Finthenticate uses a **producer/consumer** event architecture, powered by queues and real-time WebSockets.

### ✅ Flow Summary:
1. User accesses frontend → automatic WebSocket handshake in the background.
2. System listens for events like:
   - `2fa_required`, `login_success`, `new_device_detected`
   - `device_verified`, `login_failure`, `device_verification_failed`
3. Upon login, data (`connectionId`, `email`, `password`) is sent to a backend **producer**.
4. Producer processes the payload via **buffers**, **batching**, and **Redis pipelines**.
5. Message is published to **AMQP (RabbitMQ)**.
6. A **consumer** receives it in batch, validates it, and performs:
   - 2FA check
   - Device verification
   - Token generation (JWT)
7. If valid → token is returned via WebSocket (by `connectionId`).  
   If invalid → an event is dispatched to frontend using **Redis pub/sub → WebSocket server**.

---

## 🎯 Who Is This For?

- Developers who need **real-time session tracking** and **live event validation**
- SaaS builders focused on **microservices, queues, concurrency, and scale**
- Teams that want to **monitor sessions**, **collect client-side data**, or **track cookies**
- Anyone seeking deep control over **authentication UX** and **client activity**

---

## 🧠 Technical Stack

- **Node.js + Fastify** (ultra-fast HTTP layer)
- **WebSocket** for bidirectional real-time communication
- **Redis** for pipelined memory operations and pub/sub
- **RabbitMQ** for async job dispatching and queueing
- **React** frontend with full session state awareness
- **Winston Logger** for custom log control
- Ready for **Docker** and **Kubernetes (HPA scaling)**

---

## 💬 Want to Talk to Your User in Real Time?

Now you can.  
Log them in, track their session, watch the flow, and react — **all in milliseconds**.

No overload. No wait. Just data and results.

---

## ⚙️ How To Run (Quick Start)

1. Replace `<your docker user>` in `setup.sh`
2. Make it executable: `chmod +x ./setup.sh`
3. Run: `./setup.sh`
4. Access: `http://localhost:8080/`

---

## 🧪 Run Manually (Local Dev)

Create a `docker-compose.local.yml`:

```yaml
version: '3.8'

services:
  redis:
    image: redis:6.2
    ports:
      - "6379:6379"

  rabbitmq:
    image: rabbitmq:3-management
    ports:
      - "5672:5672"
      - "15672:15672"
    environment:
      RABBITMQ_DEFAULT_USER: guest
      RABBITMQ_DEFAULT_PASS: guest
```

Start services and run each microservice:

```bash
docker compose -f docker-compose.local.yml up

cd app/producers/register && node app.js
cd app/consumers/register && node app.js
cd app/producers/login && node app.js
cd app/consumers/login && node app.js
cd wss-server && node wss-server.js
```

---

## 🐳 Docker + Kubernetes

```bash
# Build
docker build -t <user>/login-consumer:latest ./app/consumers/login
docker build -t <user>/login-producer ./app/producers/login
docker build -t <user>/register-consumer ./app/consumers/register
docker build -t <user>/register-producer ./app/producers/register
docker build -t <user>/websocket-server ./wss-server
docker build -t <user>/finthenticate ./finthenticate

# Push
docker push <user>/login-consumer:latest
docker push <user>/login-producer:latest
docker push <user>/register-consumer:latest
docker push <user>/register-producer:latest
docker push <user>/websocket-server
docker push <user>/finthenticate
```

Deploy on Kubernetes:

```bash
kubectl apply -f k8s/app/consumer/login/Login.yaml
kubectl apply -f k8s/app/producer/login/Login.yaml
kubectl apply -f k8s/app/producer/register/Register.yaml
kubectl apply -f k8s/app/consumer/register/Register.yaml
kubectl apply -f k8s/frontend/Finthenticate.yaml
kubectl apply -f k8s/frontend/Finthenticate-lb.yaml
kubectl apply -f k8s/services/ws/Ws.yaml
kubectl apply -f k8s/services/ws/Hpa.yaml
kubectl apply -f k8s/services/amqp/Amqp.yaml
kubectl apply -f k8s/services/nginx/Nginx.yaml
kubectl apply -f k8s/services/redis/Redis.yaml
```

To delete pods:
```bash
kubectl delete pods -l app=${image-name}
```

---

## 📜 License

MIT — Free to use, modify, scale. Don’t be slow. Or dishonest.

---

## ⭐ Final Words

> Built by one, to be used by many.  
> Not made by a squad with Jira, but by a mind that never stops.
