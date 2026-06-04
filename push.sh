#!/bin/bash

echo "🚀 Simple Git Push Script - LuxQuant"
echo "File yang akan di-commit: frontend-react/src/components/SignalsPage.jsx"

# Stage file yang dimodifikasi
git add frontend-react/src/components/SignalsPage.jsx

# Minta commit message
read -p "Masukkan commit message: " msg

# Jika kosong, pakai default
if [ -z "$msg" ]; then
  msg="Update SignalsPage.jsx"
fi

git commit -m "$msg"

# Push ke main
git push origin main

echo "✅ Berhasil! Perubahan sudah di-push ke GitHub."
