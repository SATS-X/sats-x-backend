-- CreateEnum
CREATE TYPE "Role" AS ENUM ('teacher', 'admin');

-- CreateTable
CREATE TABLE "teacher" (
    "teacher_id" VARCHAR(64) NOT NULL,
    "full_name" VARCHAR(255) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "phone_number" VARCHAR(20),
    "password_hash" VARCHAR(60),
    "role" "Role" NOT NULL DEFAULT 'teacher',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_login_at" TIMESTAMP(3),
    "birthdate" DATE,
    "address" VARCHAR(255),
    "position" VARCHAR(100),
    "department" VARCHAR(100),
    "experience" VARCHAR(255),
    "education" VARCHAR(255),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "teacher_pkey" PRIMARY KEY ("teacher_id")
);

-- CreateTable
CREATE TABLE "refresh_token" (
    "id" BIGSERIAL NOT NULL,
    "teacher_id" VARCHAR(64) NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "user_agent" VARCHAR(255),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_token_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student" (
    "student_id" VARCHAR(32) NOT NULL,
    "full_name" VARCHAR(255) NOT NULL,
    "email" VARCHAR(255),
    "phone_number" VARCHAR(20),
    "status" VARCHAR(20) NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "student_pkey" PRIMARY KEY ("student_id")
);

-- CreateTable
CREATE TABLE "class" (
    "class_id" VARCHAR(32) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "number_of_students" INTEGER NOT NULL DEFAULT 0,
    "status" VARCHAR(20) NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "class_pkey" PRIMARY KEY ("class_id")
);

-- CreateTable
CREATE TABLE "subject" (
    "subject_id" VARCHAR(32) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "teacher_id" VARCHAR(64),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subject_pkey" PRIMARY KEY ("subject_id")
);

-- CreateTable
CREATE TABLE "schedule" (
    "id" SERIAL NOT NULL,
    "subject_id" VARCHAR(32) NOT NULL,
    "teacher_id" VARCHAR(64),
    "day" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "day_of_week" VARCHAR(16) NOT NULL,
    "room" VARCHAR(64) NOT NULL,
    "start_time" VARCHAR(5) NOT NULL,
    "end_time" VARCHAR(5) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'scheduled',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "schedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance" (
    "id" SERIAL NOT NULL,
    "student_id" VARCHAR(32) NOT NULL,
    "subject_id" VARCHAR(32) NOT NULL,
    "time" VARCHAR(5) NOT NULL,
    "day" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "day_of_week" VARCHAR(16) NOT NULL,
    "status" INTEGER NOT NULL DEFAULT 0,
    "remark" VARCHAR(32) NOT NULL DEFAULT 'Absent',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "class_student" (
    "class_id" VARCHAR(32) NOT NULL,
    "student_id" VARCHAR(32) NOT NULL,

    CONSTRAINT "class_student_pkey" PRIMARY KEY ("class_id","student_id")
);

-- CreateTable
CREATE TABLE "subject_student" (
    "subject_id" VARCHAR(32) NOT NULL,
    "student_id" VARCHAR(32) NOT NULL,

    CONSTRAINT "subject_student_pkey" PRIMARY KEY ("subject_id","student_id")
);

-- CreateTable
CREATE TABLE "subject_class" (
    "subject_id" VARCHAR(32) NOT NULL,
    "class_id" VARCHAR(32) NOT NULL,

    CONSTRAINT "subject_class_pkey" PRIMARY KEY ("subject_id","class_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "teacher_email_key" ON "teacher"("email");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_token_token_hash_key" ON "refresh_token"("token_hash");

-- CreateIndex
CREATE INDEX "refresh_token_teacher_id_idx" ON "refresh_token"("teacher_id");

-- CreateIndex
CREATE INDEX "refresh_token_expires_at_idx" ON "refresh_token"("expires_at");

-- CreateIndex
CREATE INDEX "student_full_name_idx" ON "student"("full_name");

-- CreateIndex
CREATE INDEX "subject_teacher_id_idx" ON "subject"("teacher_id");

-- CreateIndex
CREATE INDEX "schedule_teacher_id_idx" ON "schedule"("teacher_id");

-- CreateIndex
CREATE INDEX "schedule_year_month_day_idx" ON "schedule"("year", "month", "day");

-- CreateIndex
CREATE INDEX "attendance_year_month_day_idx" ON "attendance"("year" DESC, "month" DESC, "day" DESC);

-- CreateIndex
CREATE INDEX "attendance_student_id_idx" ON "attendance"("student_id");

-- CreateIndex
CREATE INDEX "attendance_subject_id_idx" ON "attendance"("subject_id");

-- CreateIndex
CREATE INDEX "class_student_student_id_idx" ON "class_student"("student_id");

-- CreateIndex
CREATE INDEX "subject_student_student_id_idx" ON "subject_student"("student_id");

-- CreateIndex
CREATE INDEX "subject_class_class_id_idx" ON "subject_class"("class_id");

-- AddForeignKey
ALTER TABLE "refresh_token" ADD CONSTRAINT "refresh_token_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "teacher"("teacher_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subject" ADD CONSTRAINT "subject_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "teacher"("teacher_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule" ADD CONSTRAINT "schedule_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subject"("subject_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule" ADD CONSTRAINT "schedule_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "teacher"("teacher_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "student"("student_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subject"("subject_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_student" ADD CONSTRAINT "class_student_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "class"("class_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_student" ADD CONSTRAINT "class_student_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "student"("student_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subject_student" ADD CONSTRAINT "subject_student_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subject"("subject_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subject_student" ADD CONSTRAINT "subject_student_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "student"("student_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subject_class" ADD CONSTRAINT "subject_class_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subject"("subject_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subject_class" ADD CONSTRAINT "subject_class_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "class"("class_id") ON DELETE CASCADE ON UPDATE CASCADE;
