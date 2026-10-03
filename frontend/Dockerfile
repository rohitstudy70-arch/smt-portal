# Lightweight Nginx image using pre-built dist
FROM nginx:alpine

# Copy pre-compiled frontend assets
COPY dist /usr/share/nginx/html

# Copy Nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]
