# Use uma imagem base do Node.js
FROM node:18-alpine

# Defina o diretório de trabalho dentro do contêiner
WORKDIR /usr/src/app

# Copie os arquivos package.json e package-lock.json para o contêiner
COPY package*.json ./

# Instale as dependências do projeto
RUN npm install --production

# Copie o restante do código da aplicação para o contêiner
COPY . .

# Exponha a porta que o app utiliza
EXPOSE 3001

# Defina a variável de ambiente para produção
ENV NODE_ENV=production

# Comando para iniciar o aplicativo
CMD ["node", "app.js"]