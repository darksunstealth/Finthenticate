FROM node:16

WORKDIR /app

# Copia apenas o package.json e instala as dependências via npm
COPY package.json ./
RUN npm install

# Copia o restante do código da aplicação
COPY . .

EXPOSE 8080

CMD ["node", "wss-server.js"]
