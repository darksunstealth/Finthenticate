FROM node:18-alpine

WORKDIR /usr/src/app

# Install netcat for the health check
RUN apk add --no-cache netcat-openbsd

COPY package*.json ./
RUN npm install

COPY . .

# Add wait-for script
COPY wait-for.sh /wait-for.sh
RUN chmod +x /wait-for.sh

# Use wait-for script before starting the application
CMD ["/bin/sh", "-c", "/wait-for.sh amqp:5672 -- node consumer.js"]