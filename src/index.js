import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import swaggerUi from 'swagger-ui-express';
import prisma, { testConnection } from './config/db/index.js';
import swaggerDocument from './config/swagger.js';
import routes from './routes/index.js';

dotenv.config();

const app = express();
const port = process.env.PORT || 4000;
const isProduction = process.env.NODE_ENV === 'production';

// Cookie refresh token chỉ được gửi kèm khi CORS cho phép credentials,
// mà bật credentials thì origin phải liệt kê cụ thể, không dùng '*' được.
const allowedOrigins = (process.env.CORS_ORIGINS || 'http://localhost:3000,http://localhost:5173')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

app.use(
    cors({
        origin: (origin, callback) => {
            if (!origin) return callback(null, true);
            if (!isProduction && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
                return callback(null, true);
            }

            if (allowedOrigins.includes(origin)) {
                return callback(null, true);
            }

            return callback(null, false);
        },
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
    })
);

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(cookieParser());

if (isProduction) {
    app.set('trust proxy', 1);
}

routes(app);

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument, {
    explorer: true,
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: 'Attendance System API Documentation'
}));

// Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'OK',
        message: 'Attendance System API is running',
        timestamp: new Date().toISOString()
    });
});

// Database connection test endpoint
app.get('/db-test', async (req, res) => {
    try {
        const rows = await prisma.$queryRaw`SELECT 1 AS test`;

        res.status(200).json({
            status: 'success',
            message: 'Database connection successful',
            data: rows[0]
        });
    } catch (error) {
        console.error('Database connection failed:', error);
        res.status(500).json({
            status: 'error',
            message: 'Database connection failed',
            // Chi tiết lỗi DB (host, user, tên bảng) không được lộ ra ngoài khi chạy thật.
            ...(isProduction ? {} : { error: error.message })
        });
    }
});

// Bắt lỗi cuối cùng — không để stack trace rơi ra response.
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(err.status || 500).json({
        success: false,
        error: 'Internal server error',
        message: isProduction ? 'An unexpected error occurred' : err.message
    });
});

await testConnection();

app.listen(port, () => {
    console.log(`Attendance System API is running on port ${port}`);
    console.log(`API documentation: http://localhost:${port}/api-docs`);
    console.log(`Health check: http://localhost:${port}/health`);
    console.log(`CORS origins: ${allowedOrigins.join(', ')}`);
});
