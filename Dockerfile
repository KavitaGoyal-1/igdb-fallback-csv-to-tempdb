FROM node:20-alpine
WORKDIR /app
COPY . .
RUN npm i -g pm2
RUN npm i
EXPOSE 3002
#CMD [ "node", "index2.js" ]
CMD [ "pm2-runtime", "index2.js" ] 
