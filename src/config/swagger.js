// Tài liệu API. Phần path nghiệp vụ trước đây mô tả các endpoint không tồn tại
// (POST /subject, /attendance/{week_day}/{class_id}); ở đây viết lại đúng theo
// router thực tế sau khi chuyển sang JWT + Prisma.

const json = (schema) => ({ 'application/json': { schema } });

const okResponse = (description) => ({
    200: { description, content: json({ type: 'object' }) }
});

const authResponses = {
    401: { description: 'Missing or invalid access token' },
    403: { description: 'Insufficient permissions' }
};

const pathParam = (name, description) => ({
    name,
    in: 'path',
    required: true,
    schema: { type: 'string' },
    description
});

const paginationParams = [
    { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1 }, description: 'Page number, starting at 1' },
    {
        name: 'limit',
        in: 'query',
        schema: { type: 'integer', minimum: 1, maximum: 200 },
        description: 'Records per page. Omit to return all records.'
    }
];

const protectedGet = (tag, summary, { params = [], query = [] } = {}) => ({
    get: {
        summary,
        tags: [tag],
        security: [{ bearerAuth: [] }],
        parameters: [...params, ...query],
        responses: { ...okResponse(summary), ...authResponses }
    }
});

const swaggerDocument = {
    openapi: '3.0.0',
    info: {
        title: 'Attendance System API',
        version: '2.0.0',
        description:
            'Face-recognition attendance API. Version 2.0 uses ' +
            'internal JWT authentication and PostgreSQL through Prisma.\n\n' +
            '**Usage:** call `POST /api/auth/login` to obtain `accessToken`, then include ' +
            'header `Authorization: Bearer <accessToken>` with every protected endpoint. ' +
            'The refresh token is stored in an httpOnly cookie; call `POST /api/auth/refresh` to renew the session.',
        contact: { name: 'Tran Dai Vi' }
    },
    servers: [{ url: 'http://localhost:4000', description: 'Development server' }],
    components: {
        securitySchemes: {
            bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }
        }
    },
    tags: [
        { name: 'Auth', description: 'Authentication, sessions, and teacher profiles' },
        { name: 'Students', description: 'Students' },
        { name: 'Classes', description: 'Classes' },
        { name: 'Subjects', description: 'Subjects' },
        { name: 'Schedule', description: 'Schedules' },
        { name: 'Attendance', description: 'Attendance records' }
    ],
    paths: {
        // ---------------- Auth ----------------
        '/api/auth/login': {
            post: {
                summary: 'Sign in, return an access token, and set the refresh-token cookie',
                tags: ['Auth'],
                requestBody: {
                    required: true,
                    content: json({
                        type: 'object',
                        required: ['email', 'password'],
                        properties: {
                            email: { type: 'string', example: 'instructor@satsx.dev' },
                            password: { type: 'string', example: 'MatKhau123' }
                        }
                    })
                },
                responses: {
                    200: { description: 'Signed in successfully' },
                    401: { description: 'Incorrect email or password' },
                    429: { description: 'Too many attempts (10 failures per 15 minutes per IP)' }
                }
            }
        },
        '/api/auth/activate': {
            post: {
                summary: 'Set the initial password for a pre-provisioned teacher',
                description:
                    'Only succeeds when the teacher already exists and has no password. ' +
                    'It does not create accounts and can therefore remain public.',
                tags: ['Auth'],
                requestBody: {
                    required: true,
                    content: json({
                        type: 'object',
                        required: ['email', 'password'],
                        properties: {
                            email: { type: 'string' },
                            password: { type: 'string', description: 'At least 8 characters with letters and numbers' }
                        }
                    })
                },
                responses: {
                    200: { description: 'Activated successfully' },
                    400: { description: 'Activation failed' }
                }
            }
        },
        '/api/auth/refresh': {
            post: {
                summary: 'Issue a new access token using the refresh-token cookie',
                description:
                    'Refresh tokens rotate; the previous token is invalidated immediately. ' +
                    'Reusing a revoked token invalidates all account sessions.',
                tags: ['Auth'],
                responses: { 200: { description: 'New access token' }, 401: { description: 'Invalid token' } }
            }
        },
        '/api/auth/logout': {
            post: {
                summary: 'Revoke the current refresh token and clear the cookie',
                tags: ['Auth'],
                responses: { 200: { description: 'Signed out successfully' } }
            }
        },
        '/api/auth/me': {
            get: {
                summary: 'Current teacher profile',
                tags: ['Auth'],
                security: [{ bearerAuth: [] }],
                responses: { ...okResponse('Teacher profile'), ...authResponses }
            },
            put: {
                summary: 'Update the teacher profile',
                tags: ['Auth'],
                security: [{ bearerAuth: [] }],
                requestBody: {
                    required: true,
                    content: json({
                        type: 'object',
                        properties: {
                            full_name: { type: 'string' },
                            phone_number: { type: 'string' },
                            birthdate: { type: 'string', format: 'date', example: '1985-03-12' },
                            address: { type: 'string' },
                            position: { type: 'string' },
                            department: { type: 'string' },
                            experience: { type: 'string' },
                            education: { type: 'string' }
                        }
                    })
                },
                responses: { ...okResponse('Updated successfully'), ...authResponses }
            }
        },
        '/api/auth/change-password': {
            post: {
                summary: 'Change password and revoke all active sessions',
                tags: ['Auth'],
                security: [{ bearerAuth: [] }],
                requestBody: {
                    required: true,
                    content: json({
                        type: 'object',
                        required: ['current_password', 'new_password'],
                        properties: {
                            current_password: { type: 'string' },
                            new_password: { type: 'string' }
                        }
                    })
                },
                responses: {
                    200: { description: 'Changed successfully; sign-in required' },
                    401: { description: 'Current password is incorrect' }
                }
            }
        },
        '/api/auth/register': {
            post: {
                summary: 'Create a teacher account (administrator only)',
                tags: ['Auth'],
                security: [{ bearerAuth: [] }],
                requestBody: {
                    required: true,
                    content: json({
                        type: 'object',
                        required: ['teacher_id', 'full_name', 'email', 'password'],
                        properties: {
                            teacher_id: { type: 'string', example: 'GV004' },
                            full_name: { type: 'string' },
                            email: { type: 'string' },
                            phone_number: { type: 'string' },
                            password: { type: 'string' },
                            role: { type: 'string', enum: ['teacher', 'admin'] }
                        }
                    })
                },
                responses: {
                    201: { description: 'Created successfully' },
                    409: { description: 'teacher_id or email already exists' },
                    ...authResponses
                }
            }
        },

        // ---------------- Students ----------------
        '/api/student': protectedGet('Students', 'List all students', { query: paginationParams }),
        '/api/student/class/{class_id}': protectedGet('Students', 'Students in a class', {
            params: [pathParam('class_id', 'Class ID, for example D22CQCI01-N')]
        }),
        '/api/student/subject/{subject_id}': protectedGet('Students', 'Students in a subject', {
            params: [pathParam('subject_id', 'Subject ID, for example INT1449')]
        }),

        // ---------------- Classes ----------------
        '/api/class': protectedGet('Classes', 'List classes with current enrollment'),
        '/api/class/{class_id}': protectedGet('Classes', 'Class details', {
            params: [pathParam('class_id', 'Class ID')]
        }),

        // ---------------- Subjects ----------------
        '/api/subject/teacher/{teacher_id}': protectedGet('Subjects', 'Subjects taught by a teacher', {
            params: [pathParam('teacher_id', 'Teacher ID. Non-administrators can only access their own data.')]
        }),
        '/api/subject/{subject_id}': protectedGet('Subjects', 'Subject details with assigned classes', {
            params: [pathParam('subject_id', 'Subject ID')]
        }),
        '/api/subject/{subject_id}/students': protectedGet('Subjects', 'Students enrolled in a subject', {
            params: [pathParam('subject_id', 'Subject ID')]
        }),

        // ---------------- Schedule ----------------
        '/api/schedule': protectedGet('Schedule', 'Schedules with optional date filters', {
            query: [
                { name: 'day', in: 'query', schema: { type: 'integer' } },
                { name: 'month', in: 'query', schema: { type: 'integer' } },
                { name: 'year', in: 'query', schema: { type: 'integer' } }
            ]
        }),
        '/api/schedule/teacher/{teacher_id}': protectedGet('Schedule', 'Schedules for a teacher', {
            params: [pathParam('teacher_id', 'Teacher ID. Non-administrators can only access their own data.')]
        }),

        // ---------------- Attendance ----------------
        '/api/attendance': protectedGet('Attendance', 'All attendance records', { query: paginationParams }),
        '/api/attendance/class/{class_id}': protectedGet('Attendance', 'Attendance by class', {
            params: [pathParam('class_id', 'Class ID')],
            query: paginationParams
        }),
        '/api/attendance/subject/{subject_id}': protectedGet(
            'Attendance',
            'Attendance statistics for every student in a subject',
            { params: [pathParam('subject_id', 'Subject ID')] }
        ),
        '/api/attendance/student/{student_id}': protectedGet(
            'Attendance',
            'Attendance history and statistics for a student',
            { params: [pathParam('student_id', 'Student ID')] }
        )
    }
};

export default swaggerDocument;
