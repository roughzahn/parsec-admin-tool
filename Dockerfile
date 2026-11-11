FROM node:24-alpine
ENV NODE_ENV=production PARSEC_ADMIN_PORT=3000 TZ=Europe/Berlin
WORKDIR /app
COPY server.mjs /app/server.mjs
COPY public /app/public
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "server.mjs"]