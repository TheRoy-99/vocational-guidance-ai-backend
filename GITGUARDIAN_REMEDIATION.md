# 🔐 Remediación de Secretos Detectados por GitGuardian

## ✅ Cambios Realizados

### 1. **docker-compose.yml**
- ❌ Eliminadas credenciales hardcodeadas de PostgreSQL
- ✅ Reemplazadas con variables de entorno usando `${VAR_NAME}`
- ✅ Añadidos valores por defecto seguros donde aplique

### 2. **.env.docker** (NUEVO)
Archivo con variables de entorno para `docker-compose`. Contiene:
```
POSTGRES_PASSWORD=change_me_in_production_to_a_secure_password
JWT_SECRET=your_jwt_secret...
GROQ_API_KEY=your_groq_api_key_here
```

### 3. **.dockerignore**
Actualizado para asegurar que `.env*` nunca se incluye en la imagen Docker

### 4. **.gitignore**
Ya excluye `.env` correctamente

---

## 🚨 Pasos para Limpiar el Historial Git

GitGuardian detectó el secreto en el commit `a4ed488`. Aunque ya lo hemos removido de los archivos, sigue en el historial. Necesitas limpiar el historial git:

### **Opción A: Usar BFG (Recomendado - más seguro)**

```bash
# 1. Instalar BFG (si no lo tienes)
brew install bfg  # macOS
# o
apt-get install bfg  # Linux

# 2. Crear un backup de tu repo
cd /Users/eriko/Proyecto\ de\ Grado
git clone --mirror vocational-guidance-ai-backend vocational-guidance-ai-backend.git.bak

# 3. Limpiar las credenciales del historial
cd vocational-guidance-ai-backend
bfg --replace-text <(echo "postgres") --replace-text <(echo "orienta_db")

# 4. Refpack y limpiar
git reflog expire --expire=now --all
git gc --prune=now --aggressive

# 5. Force push al repo remoto
git push origin --force-with-lease
```

### **Opción B: Usar git filter-repo (Alternativa moderna)**

```bash
# 1. Instalar git-filter-repo
pip install git-filter-repo

# 2. Limpiar
cd /Users/eriko/Proyecto\ de\ Grado/vocational-guidance-ai-backend
git filter-repo --replace-text <(echo "postgres\n==>REDACTED")

# 3. Force push
git push origin --force-with-lease
```

### **Opción C: Manual (si solo necesitas limpiar pocos commits)**

```bash
# 1. Identificar dónde apareció el secreto
git log --oneline | head -20

# 2. Rebase interactivo hasta ese commit
git rebase -i <commit_anterior_al_secreto>

# 3. Marcar los commits como "edit"
# 4. Hacer los cambios necesarios
# 5. Continuar rebase
git add .
git rebase --continue

# 6. Force push
git push origin --force-with-lease
```

---

## 📋 Checklist de Remediación

- [ ] Credenciales removidas de `docker-compose.yml` ✅ HECHO
- [ ] Variables de entorno añadidas a `.env.docker` ✅ HECHO
- [ ] `.dockerignore` actualizado ✅ HECHO
- [ ] `.gitignore` verifica `.env` ✅ HECHO
- [ ] Historial git limpiado (ejecutar uno de los pasos arriba)
- [ ] Cambios pusheados a `develop` con `--force-with-lease`
- [ ] PR fusionado después de limpiar

---

## 🔑 Cómo Usar docker-compose Ahora

```bash
# Copiar el archivo de variables de entorno
cp .env.docker .env.docker.local  # Para desarrollo local

# Editar con tus valores reales
nano .env.docker

# Ejecutar docker-compose
docker-compose --env-file .env.docker up -d
```

---

## 🛡️ Para el Futuro: Prevenir Fugas de Secretos

### **Instalar pre-commit hook**

```bash
# 1. Instalar pre-commit
brew install pre-commit

# 2. Crear .pre-commit-config.yaml en la raíz del repo
cat > .pre-commit-config.yaml << 'EOF'
repos:
  - repo: https://github.com/Yelp/detect-secrets
    rev: v1.4.0
    hooks:
      - id: detect-secrets
        args: ['--baseline', '.secrets.baseline']
        
  - repo: https://github.com/gitguardian/ggshield
    rev: v1.25.0
    hooks:
      - id: ggshield
        language: python
        entry: ggshield secret scan pre-commit
EOF

# 3. Inicializar el hook
pre-commit install

# 4. De ahora en adelante, los secrets se detectarán antes de commit
```

---

## ✨ Resultado Final

Después de estos pasos:
✅ No hay credenciales hardcodeadas en el código
✅ GitGuardian no detectará nuevos secretos
✅ El historial git está limpio
✅ El equipo sigue un flujo seguro de gestión de secretos
