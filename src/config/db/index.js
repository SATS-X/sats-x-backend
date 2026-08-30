import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

dotenv.config();

const isProduction = process.env.NODE_ENV === 'production';

if (!process.env.DATABASE_URL) {
    throw new Error('Missing DATABASE_URL in .env');
}

// Prisma 7 kết nối qua driver adapter; pool của node-postgres nằm ở đây.
const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL,
    max: 10
});

const prisma = new PrismaClient({
    adapter,
    log: isProduction ? ['error'] : ['warn', 'error']
});

export async function testConnection() {
    try {
        await prisma.$queryRaw`SELECT 1`;
        console.log('Database connected successfully!');
        return true;
    } catch (error) {
        console.error('Database connection failed:', error.message);
        console.error('Check DATABASE_URL in .env');
        return false;
    }
}

// Đóng pool gọn gàng khi process dừng, tránh treo connection lúc nodemon reload.
const shutdown = async () => {
    await prisma.$disconnect();
    process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

export default prisma;
