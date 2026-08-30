# 🎓 Attendance System — Backend API Core

[![Node.js](https://img.shields.io/badge/Node.js-v18%2B-339933?style=flat-square&logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![Express.js](https://img.shields.io/badge/Express.js-4.x-000000?style=flat-square&logo=express&logoColor=white)](https://expressjs.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15%2B-4169E1?style=flat-square&logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Prisma ORM](https://img.shields.io/badge/Prisma-ORM-2D3748?style=flat-square&logo=prisma&logoColor=white)](https://www.prisma.io/)
[![JWT Auth](https://img.shields.io/badge/Auth-Dual--Token%20JWT-FF6C37?style=flat-square&logo=jsonwebtokens&logoColor=white)](https://jwt.io/)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?style=flat-square&logo=docker&logoColor=white)](https://www.docker.com/)

> **Centralized Business Logic, Authentication, and Relational Persistence Layer** for the IoT-based Smart Facial Attendance and Anti-Spoofing Verification System.

The **Attendance System Backend** serves as the authoritative core for academic data management, teacher/admin authentication, schedule orchestrations, and automated attendance record auditing. It seamlessly interfaces with the React web client via RESTful endpoints and securely processes machine-to-machine attendance logging dispatched by AWS Lambda functions on behalf of edge IoT devices.

---

## 📑 Table of Contents

- [System Architecture](#-system-architecture)
- [Database Schema & ERD](#-database-schema--erd)
- [Security & Authentication Model](#-security--authentication-model)
  - [Dual-Token JWT Strategy](#dual-token-jwt-strategy)
  - [Machine-to-Machine IoT Service Token](#machine-to-machine-iot-service-token)
  - [Defense-in-Depth Measures](#defense-in-depth-measures)
- [REST API Specification](#-rest-api-specification)
  - [Authentication Endpoints (`/api/auth`)](#1-authentication-endpoints-apiauth)
  - [Academic & Administrative Endpoints](#2-academic--administrative-endpoints)
  - [Edge IoT Device Webhooks (`/api/device`)](#3-edge-iot-device-webhooks-apidevice)
- [Local Development & Quickstart](#-local-development--quickstart)
- [Production Deployment (AWS EC2 & Docker)](#-production-deployment-aws-ec2--docker)
- [Environment Configuration Reference](#-environment-configuration-reference)
- [Part of the Ecosystem](#-part-of-the-ecosystem)

---

## 🏛 System Architecture

The backend operates on an event-driven and RESTful middleware architecture built with Express.js and Prisma ORM, interfacing with PostgreSQL:

```mermaid
flowchart TD
    subgraph Clients["Clients & Edge Callers"]
        FE["Teacher Dashboard (React SPA)"]
        L_ATT["AWS Lambda (Attendance Handler)"]
        L_SCH["AWS Lambda (Schedule Handler)"]
    end

    subgraph SecurityLayer["Security & Middleware Pipeline"]
        CORS["CORS & Helmet Policy"]
        RL["IP Rate Limiter (brute-force defense)"]
        JWT_MW["JWT Auth Middleware (Bearer Token)"]
        SVC_MW["Service Token Middleware (Constant-Time)"]
    end

    subgraph ControllerLayer["Controllers & Business Routing"]
        AUTH_CTRL["AuthController"]
        STU_CTRL["StudentController"]
        CLS_CTRL["ClassController"]
        SUB_CTRL["SubjectController"]
        SCH_CTRL["ScheduleController"]
        ATT_CTRL["AttendanceController"]
        DEV_CTRL["DeviceController"]
    end

    subgraph DataAccessLayer["Persistence & Storage"]
        PRISMA["Prisma Client ORM"]
        DB[(PostgreSQL 15+ Database)]
        S3[("AWS S3 Bucket (Attendance Photo References)")]
    end

    FE -->|HTTP Bearer JWT / Cookie| CORS
    L_ATT -->|HTTP Service Token Header| CORS
    L_SCH -->|HTTP Service Token Header| CORS

    CORS --> RL
    RL --> JWT_MW
    RL --> SVC_MW

    JWT_MW --> AUTH_CTRL
    JWT_MW --> STU_CTRL
    JWT_MW --> CLS_CTRL
    JWT_MW --> SUB_CTRL
    JWT_MW --> SCH_CTRL
    JWT_MW --> ATT_CTRL

    SVC_MW --> DEV_CTRL

    AUTH_CTRL --> PRISMA
    STU_CTRL --> PRISMA
    CLS_CTRL --> PRISMA
    SUB_CTRL --> PRISMA
    SCH_CTRL --> PRISMA
    ATT_CTRL --> PRISMA
    DEV_CTRL --> PRISMA

    PRISMA --> DB
    ATT_CTRL -.->|Image Key Link| S3
```

---

## 🗄 Database Schema & ERD

The relational data model is managed via Prisma ORM (`prisma/schema.prisma`) targeting PostgreSQL. All business relations, composite primary keys, cascade rules, and optimized index constraints are depicted below:

```mermaid
erDiagram
    Teacher ||--o{ RefreshToken : "owns"
    Teacher ||--o{ Subject : "instructs"
    Teacher ||--o{ Schedule : "assigned_to"

    Student ||--o{ ClassStudent : "enrolled_in"
    Class ||--o{ ClassStudent : "contains"

    Student ||--o{ SubjectStudent : "attends"
    Subject ||--o{ SubjectStudent : "includes"

    Class ||--o{ SubjectClass : "associated_with"
    Subject ||--o{ SubjectClass : "taught_in"

    Subject ||--o{ Schedule : "timetabled_in"

    Student ||--o{ Attendance : "records"
    Subject ||--o{ Attendance : "logs"

    Teacher {
        varchar(64) teacher_id PK "Institutional Teacher ID (e.g., GV001)"
        varchar(255) full_name
        varchar(255) email UK
        varchar(20) phone_number
        varchar(60) password_hash
        enum role "teacher | admin"
        boolean is_active
        date birthdate
        varchar(100) position
        varchar(100) department
        timestamp created_at
        timestamp updated_at
    }

    RefreshToken {
        bigint id PK
        varchar(64) teacher_id FK
        char(64) token_hash UK "SHA-256 Digest of Token"
        timestamp expires_at
        timestamp revoked_at
        varchar(255) user_agent
        timestamp created_at
    }

    Student {
        varchar(32) student_id PK "Student Code (e.g., B22DCCN001)"
        varchar(255) full_name
        varchar(255) email
        varchar(20) phone_number
        varchar(20) status "active | inactive"
        timestamp created_at
        timestamp updated_at
    }

    Class {
        varchar(32) class_id PK "Academic Class (e.g., D22CQCI01-N)"
        varchar(255) name
        integer number_of_students
        varchar(20) status
        timestamp created_at
        timestamp updated_at
    }

    Subject {
        varchar(32) subject_id PK "Course Code (e.g., INT1434)"
        varchar(255) name
        varchar(64) teacher_id FK
        timestamp created_at
        timestamp updated_at
    }

    Schedule {
        int id PK
        varchar(32) subject_id FK
        varchar(64) teacher_id FK
        int day
        int month
        int year
        varchar(16) day_of_week
        varchar(64) room
        varchar(5) start_time "HH:MM"
        varchar(5) end_time "HH:MM"
        varchar(20) status
    }

    Attendance {
        int id PK
        varchar(32) student_id FK
        varchar(32) subject_id FK
        varchar(5) time "HH:MM"
        int day
        int month
        int year
        varchar(16) day_of_week
        int status "1: Present, 0: Absent"
        varchar(32) remark "On Time | Late | Absent"
        varchar(255) image_key "S3 Audit Snapshot Path"
        timestamp created_at
    }

    ClassStudent {
        varchar(32) class_id PK,FK
        varchar(32) student_id PK,FK
    }

    SubjectStudent {
        varchar(32) subject_id PK,FK
        varchar(32) student_id PK,FK
    }

    SubjectClass {
        varchar(32) subject_id PK,FK
        varchar(32) class_id PK,FK
    }
```

---

## 🔐 Security & Authentication Model

### Dual-Token JWT Strategy

The system enforces strict stateless authorization while providing seamless session continuity:

| Token Type | Lifespan | Delivery & Storage | Scope & Protection |
|:---|:---|:---|:---|
| **Access Token** | **15 minutes** | Transmitted via `Authorization: Bearer <token>` in memory | Authenticates all protected REST endpoints. Never persisted to `localStorage` to prevent XSS exfiltration. |
| **Refresh Token** | **7 days** | Set via encrypted `httpOnly`, `SameSite=Lax`, `Secure` Cookie | Restricted to `/api/auth/refresh` and `/api/auth/logout`. Inaccessible to browser JavaScript. |

#### Automatic Token Rotation & Reuse Detection
1. When `/api/auth/refresh` is invoked, the presented refresh token is immediately revoked and replaced with a newly generated token pair.
2. The database stores the **SHA-256 cryptographic digest** of refresh tokens rather than raw strings.
3. If a revoked token is replayed (indicating a compromised token), **the security subsystem immediately invalidates all active sessions** for that user account, forcing re-authentication.

```mermaid
sequenceDiagram
    autonumber
    actor Client as React Client (Frontend)
    participant Auth as Express Auth Middleware
    participant DB as PostgreSQL Database

    Note over Client, DB: Regular API Request with Access Token
    Client->>Auth: GET /api/attendance (Bearer AccessToken)
    alt Access Token Valid
        Auth->>Client: 200 OK + Attendance Dataset
    else Access Token Expired (15 min)
        Auth-->>Client: 401 Unauthorized (TokenExpired)
        Note over Client: Silently intercept & request fresh token
        Client->>Auth: POST /api/auth/refresh (httpOnly Cookie)
        Auth->>DB: Verify & Revoke Old Token Hash
        alt Token Valid & Unused
            Auth->>DB: Store New Token SHA-256 Hash
            Auth-->>Client: 200 OK + New Access Token + New Refresh Cookie
            Client->>Auth: Re-execute GET /api/attendance (New AccessToken)
            Auth-->>Client: 200 OK + Attendance Dataset
        else Token Replayed / Stolen (Reuse Detected)
            Auth->>DB: REVOKE ALL SESSIONS for Teacher ID
            Auth-->>Client: 403 Forbidden (Session Hijack Alert)
            Note over Client: Redirect to /login
        end
    end
```

### Machine-to-Machine IoT Service Token

When edge devices interact with the backend via AWS Lambda handlers (`schedule`, `attendance`), they do not possess teacher credentials. Instead, requests authenticate using a high-entropy `SERVICE_TOKEN`:
- Header: `Authorization: Bearer <BACKEND_SERVICE_TOKEN>`
- Verified using **`crypto.timingSafeEqual`** in `requireServiceToken` middleware to eliminate side-channel timing attack vectors.
- Must match the `backend_service_token` variable configured in Terraform.

### Defense-in-Depth Measures
- **Password Security**: Passwords hashed using `bcrypt` with cost factor 12.
- **Timing Attack Mitigation**: Login verification always executes `bcrypt.compare()` against a dummy hash even if the email does not exist, guaranteeing constant response times.
- **Brute-Force Rate Limiting**: Max 10 consecutive failed login attempts per 15-minute window per client IP.
- **Admin Isolation**: Teacher account registration (`POST /api/auth/register`) is strictly locked to users holding the `admin` role.

---

## 📡 REST API Specification

### 1. Authentication Endpoints (`/api/auth`)

| Method | Endpoint | Access Level | Description |
|:---|:---|:---|:---|
| `POST` | `/api/auth/login` | Public | Authenticate teacher credentials, returns `accessToken` + sets `httpOnly` cookie |
| `POST` | `/api/auth/activate` | Public | Initial password setup for pre-enrolled faculty members |
| `POST` | `/api/auth/refresh` | Cookie Auth | Rotate refresh token and grant a new 15-minute access token |
| `POST` | `/api/auth/logout` | Cookie Auth | Invalidate current session and clear refresh cookie |
| `GET` | `/api/auth/me` | Authenticated | Retrieve authenticated user profile and institutional role |
| `PUT` | `/api/auth/me` | Authenticated | Update faculty profile attributes (department, position, phone) |
| `POST` | `/api/auth/change-password`| Authenticated | Update password and invalidate all other active sessions |
| `POST` | `/api/auth/register` | **Admin Only** | Provision new faculty account |

### 2. Academic & Administrative Endpoints

All endpoints below require a valid `Authorization: Bearer <accessToken>` header. Pagination is supported via optional `?page=1&limit=20` query parameters.

| Method | Endpoint | Query / Path Params | Description |
|:---|:---|:---|:---|
| `GET` | `/api/student` | `?page=&limit=` | Paginated student registry |
| `GET` | `/api/student/class/:class_id` | `:class_id` | Students enrolled in a specific class |
| `GET` | `/api/student/subject/:subject_id` | `:subject_id` | Students enrolled in a specific course |
| `POST` | `/api/student` | Body (`studentId`, `fullName`, `email`, `classId`) | Register new student record |
| `PUT` | `/api/student/:student_id` | `:student_id`, Body | Update student personal details |
| `DELETE` | `/api/student/:student_id` | `:student_id` | Remove student (cascades to attendance logs) |
| `GET` | `/api/class` | `?page=&limit=` | Retrieve all class sections |
| `GET` | `/api/class/:class_id` | `:class_id` | Retrieve single class metadata |
| `POST` | `/api/class` | Body (`classId`, `name`) | Create new class section |
| `PUT` | `/api/class/:class_id` | `:class_id`, Body (`name`, `status`) | Modify class status/title |
| `DELETE` | `/api/class/:class_id` | `:class_id` | Delete class record |
| `GET` | `/api/subject/teacher/:teacher_id` | `:teacher_id` | Subjects taught by teacher (Admin can view all) |
| `GET` | `/api/subject/:subject_id` | `:subject_id` | Subject details with enrolled classes |
| `GET` | `/api/schedule` | `?day=&month=&year=` | Filter global timetable schedules |
| `GET` | `/api/schedule/teacher/:teacher_id` | `:teacher_id` | Filter teacher-specific timetable |
| `GET` | `/api/attendance` | `?page=&limit=` | Global attendance audit logs |
| `GET` | `/api/attendance/class/:class_id` | `:class_id` | Class-specific attendance history |
| `GET` | `/api/attendance/subject/:subject_id` | `:subject_id` | Attendance statistics per student in subject |
| `GET` | `/api/attendance/student/:student_id` | `:student_id` | Individual student attendance log & rate |

### 3. Edge IoT Device Webhooks (`/api/device`)

Authenticated strictly via `Authorization: Bearer <SERVICE_TOKEN>`.

| Method | Endpoint | Parameters / Body | Description |
|:---|:---|:---|:---|
| `GET` | `/api/device/schedule` | `?day=DD&month=MM&year=YYYY` | Returns daily class timetable formatted specifically for ESP32 firmware parsing |
| `POST` | `/api/device/attendance` | Body: `{ student_id, class_id, subject_id, day, month, year, time, image_key }` | Records verified attendance. Automatically computes **"On Time"** vs **"Late"** (15-min threshold) and rejects duplicate check-ins |

---

## 💻 Local Development & Quickstart

### Prerequisites
- **Node.js**: v18.0.0 or later
- **Docker & Docker Compose**: For running containerized PostgreSQL

### Step-by-Step Setup

1. **Clone and Install Dependencies**:
   ```bash
   cd backend
   npm install
   ```

2. **Environment Configuration**:
   ```bash
   cp .env.example .env
   ```
   Generate cryptographic secrets for JWT and Service authentication:
   ```bash
   node -e "console.log('JWT_ACCESS_SECRET=' + require('crypto').randomBytes(48).toString('hex'))"
   node -e "console.log('JWT_REFRESH_SECRET=' + require('crypto').randomBytes(48).toString('hex'))"
   node -e "console.log('SERVICE_TOKEN=' + require('crypto').randomBytes(48).toString('hex'))"
   ```
   Paste the generated keys into your `.env` file.

3. **Start Database Container**:
   ```bash
   npm run db:up
   ```

4. **Execute Migrations and Seed Sample Data**:
   ```bash
   npm run db:migrate
   npm run db:seed
   ```

5. **Start Local Development Server**:
   ```bash
   npm run dev
   ```

### Verification Endpoints
- **REST API Root**: `http://localhost:4000`
- **Swagger Interactive Documentation**: `http://localhost:4000/api-docs`
- **Health Check Probe**: `http://localhost:4000/health`
- **Prisma Visual Studio**: `npm run db:studio` (Opens at `http://localhost:5555`)

### Seeded Credentials

| Email | Password | Role | Description |
|:---|:---|:---|:---|
| `instructor@satsx.dev` | `MatKhau123` | Teacher (`GV002`) | Pre-activated faculty account |
| `invited@satsx.dev` | *Unset* | Teacher (`GV003`) | Demonstrates `/api/auth/activate` flow |

To create an initial administrative account:
```bash
npm run create-admin -- GV001 "System Administrator" admin@satsx.dev "SecureAdminPass123!"
```

---

## 🚀 Production Deployment (AWS EC2 & Docker)

The backend is fully containerized with a production multi-stage `Dockerfile` and orchestrated via `docker-compose.prod.yml` on an AWS EC2 instance (`t3.micro` provisioned via `infrastructure`):

```mermaid
flowchart LR
    subgraph Host["AWS EC2 (Ubuntu 22.04 LTS)"]
        subgraph DockerNet["Isolated Docker Network (attendance_backend_net)"]
            APP["App Container (Express API :4000)"]
            POSTGRES[("Postgres Container :5432\n(Internal Only - No Host Binding)")]
        end
        NGINX["Nginx Container (:80 / :443)\nReverse Proxy + Static SPA Host"]
    end

    INTERNET((Public Internet)) -->|HTTP / HTTPS| NGINX
    NGINX -->|/api/* Proxy Pass| APP
    APP -->|Internal DB Connection| POSTGRES
```

### Deployment Steps on EC2

1. **Obtain SSH Access**:
   ```bash
   # From the infrastructure repository
   terraform output -raw backend_ssh_key > backend-key.pem && chmod 400 backend-key.pem
   ssh -i backend-key.pem ubuntu@<BACKEND_PUBLIC_IP>
   ```

2. **Clone & Setup Environment**:
   ```bash
   git clone <REPO_URL>/backend.git
   cd backend
   cp .env.prod.example .env
   # Edit .env with production DB password, JWT secrets, SERVICE_TOKEN, and CORS_ORIGINS
   ```

3. **Launch Production Containers**:
   ```bash
   docker compose -f docker-compose.prod.yml up -d --build
   ```
   *Note: The app container automatically executes `prisma migrate deploy` before binding the server port.*

4. **Seed Initial Production Data (Optional)**:
   ```bash
   docker compose -f docker-compose.prod.yml exec app node prisma/seed.js
   ```

---

## ⚙️ Environment Configuration Reference

| Variable | Type | Default / Example | Purpose |
|:---|:---|:---|:---|
| `PORT` | `number` | `4000` | Port on which the Express server listens |
| `NODE_ENV` | `string` | `development` / `production` | Runtime mode selector |
| `DATABASE_URL` | `string` | `postgresql://user:pass@localhost:5432/attendance_db` | PostgreSQL connection string with pooling |
| `JWT_ACCESS_SECRET` | `string` | `96-char hex` | Secret signing key for 15-minute Access JWTs |
| `JWT_REFRESH_SECRET` | `string` | `96-char hex` | Secret signing key for 7-day Refresh JWTs |
| `JWT_ACCESS_EXPIRES_IN`| `string` | `15m` | Access token time-to-live |
| `JWT_REFRESH_EXPIRES_IN`| `string`| `7d` | Refresh token time-to-live |
| `SERVICE_TOKEN` | `string` | `96-char hex` | Shared secret for AWS Lambda webhook verification |
| `CORS_ORIGINS` | `string` | `http://localhost:3000,https://app.satsx.dev` | Comma-delimited list of allowed CORS origins |

---

## 🧩 Part of the Ecosystem

This backend repository is an essential component of the multi-tier Smart Attendance System:

| Repository | Primary Technology | Responsibility |
|:---|:---|:---|
| **`backend`** *(This repo)* | Express, PostgreSQL, Prisma | Core REST API, Auth, Database ORM, IoT Webhooks |
| [**`frontend`**](../frontend) | React 18, Vite, Tailwind CSS | Teacher Web Dashboard, Live Attendance Monitor |
| [**`infrastructure`**](../infrastructure) | Terraform, AWS Lambda, S3, IoT Core | Serverless AWS Cloud Infrastructure & Pipelines |
| [**`iot`**](../iot) | PlatformIO, ESP32, ESP32-CAM | Edge Hardware: Face Capture, LCD UI, Distance Trigger |
| [**`liveness`**](../liveness) | FastAPI, TensorFlow, WebSockets | Real-time Deep Learning Anti-Spoofing Microservice |
