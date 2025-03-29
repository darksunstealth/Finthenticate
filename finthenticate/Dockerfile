# Build stage
FROM node:16-alpine as build

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install --omit=dev

# Copy application code
COPY . .

# Create .env file at build time with environment variables
RUN echo "REACT_APP_API_BASE_URL=${REACT_APP_API_BASE_URL:-/api}" > .env
RUN echo "REACT_APP_WS_URL=${REACT_APP_WS_URL:-ws://localhost/ws}" >> .env

# Build the React app
RUN npm run build

# Production stage using Nginx to serve static files
FROM nginx:alpine

# Copy built files to nginx html directory
COPY --from=build /app/build /usr/share/nginx/html

# ✅ Fix: Copy the nginx.conf to the correct path
COPY nginx.conf /etc/nginx/nginx.conf

# Expose port 80
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
