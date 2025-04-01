#!/bin/bash

set -e

IMAGES=(
  samirsauma121/login-consumer
  samirsauma121/login-producer
  samirsauma121/register-producer
  samirsauma121/register-consumer
  samirsauma121/finthenticate
  samirsauma121/websocket-server
)

PATHS=(
  ./app/consumers/login
  ./app/producers/login
  ./app/producers/register
  ./app/consumers/register
  ./finthenticate
  ./wss-server
)

echo "🔨 [1/5] Building & Pushing Docker images..."
for i in "${!IMAGES[@]}"; do
  echo "📦 Building ${IMAGES[$i]}..."
  docker build -t ${IMAGES[$i]}:latest "${PATHS[$i]}"
  echo "🚀 Pushing ${IMAGES[$i]}..."
  docker push ${IMAGES[$i]}:latest
done

echo "🧹 [2/5] Deleting old pods (safe)..."
kubectl delete pod -l app=finthenticate --ignore-not-found
kubectl delete pod -l app=login-consumer --ignore-not-found
kubectl delete pod -l app=login-producer --ignore-not-found
kubectl delete pod -l app=register-consumer --ignore-not-found
kubectl delete pod -l app=register-producer --ignore-not-found
kubectl delete pod -l app=websocket-server --ignore-not-found

echo "📦 [3/5] Applying Kubernetes manifests..."
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

echo "🔁 [4/5] Forçando rollout dos deployments..."
kubectl rollout restart deployment login-consumer
kubectl rollout restart deployment login-producer
kubectl rollout restart deployment register-consumer
kubectl rollout restart deployment register-producer
kubectl rollout restart deployment finthenticate
kubectl rollout restart deployment websocket-server
kubectl rollout restart deployment nginx-load-balancer || true

echo "✅ [5/5] Setup finalizado com sucesso!"
