#!/bin/bash

# Script para generar valores aleatorios seguros para .env
# Uso: bash scripts/generate-env-secrets.sh

echo "🔐 Generando secretos para .env..."
echo ""

# Generar JWT_SECRET de 64 caracteres
JWT_SECRET=$(openssl rand -base64 48 | tr -d '\n' | sed 's/[^a-zA-Z0-9]//g' | cut -c1-64)
echo "JWT_SECRET=$JWT_SECRET"

echo ""
echo "📝 Copia estos valores a tu archivo .env:"
echo "JWT_SECRET=\"$JWT_SECRET\""
echo ""
echo "Luego completa:"
echo "  - DATABASE_URL con tu connection string de Supabase"
echo "  - GROQ_API_KEY con tu clave de Groq"
echo "  - SUPABASE_* con tus credenciales de Supabase (opcional)"
