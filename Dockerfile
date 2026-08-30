FROM node:20-slim

# openssl cần cho Prisma query engine lúc chạy (không phải lúc build).
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
# Cài cả devDependencies vì Prisma CLI (không phải chỉ @prisma/client) cần có
# để chạy `prisma generate` lúc build và `prisma migrate deploy` lúc khởi động.
RUN npm ci

# prisma.config.ts BẮT BUỘC phải có — Prisma 7 đọc datasource.url từ đây, thiếu
# file này thì `migrate deploy` báo lỗi "datasource.url property is required"
# dù DATABASE_URL đã set đúng trong biến môi trường.
COPY prisma.config.ts ./
COPY prisma ./prisma
RUN npx prisma generate

COPY src ./src
COPY scripts ./scripts

EXPOSE 4000

# migrate deploy chỉ áp dụng migration chưa chạy — an toàn để chạy lại mỗi lần
# container khởi động, không cần bước CI/CD riêng cho một dự án quy mô nhỏ.
CMD ["sh", "-c", "npx prisma migrate deploy && node src/index.js"]
