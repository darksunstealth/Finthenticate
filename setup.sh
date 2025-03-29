#!/bin/bash

set -e

IMAGES=(
  samirsauma121/login-consumer:latest
  samirsauma121/login-producer:latest
  samirsauma121/register-producer:latest
  samirsauma121/register-consumer:latest
  samirsauma121/finthenticate:latest
  samirsauma121/websocket-server:latest
)

echo "🗑️ [0/5] Removing old Docker images..."
for image in "${IMAGES[@]}"; do
  if docker images "$image" | grep -q "$image"; then
    docker rmi -f "$image"
    echo "🧼 Removed: $image"
  else
    echo "ℹ️ Image not found (skipped): $image"
  fi
done

echo "🔨 [1/5] Building Docker images..."
docker build -t samirsauma121/login-consumer ./app/consumers/login
docker build -t samirsauma121/login-producer ./
docker build -t samirsauma121/register-producer ./app/producers/register
docker build -t samirsauma121/register-consumer ./app/consumers/register
docker build -t samirsauma121/finthenticate ./finthenticate
docker build -t samirsauma121/websocket-server ./services/wss

echo "🚀 [2/5] Pushing images to Docker Hub..."
for image in "${IMAGES[@]}"; do
  docker push "$image"
done

echo "🧹 [3/5] Deleting existing pods (for fresh rollout)..."
kubectl delete pods --all

echo "📦 [4/5] Applying Kubernetes manifests..."
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

echo "✅ [5/5] Setup finalizado com sucesso!"