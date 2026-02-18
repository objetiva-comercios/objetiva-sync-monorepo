# Quick Start - Deployment en Servidor Remoto

Esta es una guía rápida con los comandos esenciales. Para más detalles, consulta [DEPLOYMENT.md](../DEPLOYMENT.md).

## Comandos Esenciales

### 1. Copiar configuración Nginx

```bash
sudo cp nginx/sync-gateway.conf /etc/nginx/sites-available/
sudo ln -s /etc/nginx/sites-available/sync-gateway.conf /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 2. Obtener certificado SSL

```bash
sudo mkdir -p /var/www/certbot
sudo certbot certonly --webroot \
  -w /var/www/certbot \
  -d sync-gateway.sanchezrepuestos.com.ar \
  --email tu-email@ejemplo.com \
  --agree-tos
```

### 3. Recargar Nginx con SSL

```bash
sudo systemctl reload nginx
```

### 4. Verificar que funciona

```bash
curl https://sync-gateway.sanchezrepuestos.com.ar/health
```

Debe responder:
```json
{"status":"ok","timestamp":"..."}
```

## URLs

- Gateway: https://sync-gateway.sanchezrepuestos.com.ar
- Setup: https://sync-gateway.sanchezrepuestos.com.ar/setup
- Health: https://sync-gateway.sanchezrepuestos.com.ar/health

## Troubleshooting Rápido

```bash
# Ver logs del gateway
pm2 logs sync-gateway

# Ver logs de nginx
sudo tail -f /var/log/nginx/sync-gateway.error.log

# Reiniciar gateway
pm2 restart sync-gateway

# Reiniciar nginx
sudo systemctl restart nginx

# Verificar certificado SSL
sudo certbot certificates
```
