FROM node:18-alpine

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy remaining source code
COPY . .

# Expose port if needed (adjust PORT if app.js uses another port)
EXPOSE 3000

# Run the app.js file
CMD ["node", "app.js"]