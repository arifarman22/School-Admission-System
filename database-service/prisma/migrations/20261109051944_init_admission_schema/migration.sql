-- CreateEnum
CREATE TYPE "admission_status" AS ENUM ('HELD', 'CONFIRMED', 'EXPIRED', 'CANCELLED');

-- CreateTable
CREATE TABLE "admission_classes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(100) NOT NULL,
    "total_seats" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admission_classes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admission_holds" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "class_id" UUID NOT NULL,
    "student_id" VARCHAR(17) NOT NULL,
    "status" "admission_status" NOT NULL DEFAULT 'HELD',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "confirmed_at" TIMESTAMPTZ(3),

    CONSTRAINT "admission_holds_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "admission_classes_name_key" ON "admission_classes"("name");

-- CreateIndex
CREATE INDEX "admission_holds_class_id_status_expires_at_idx" ON "admission_holds"("class_id", "status", "expires_at");

-- CreateIndex
CREATE INDEX "admission_holds_student_id_idx" ON "admission_holds"("student_id");

-- CreateIndex
CREATE INDEX "admission_holds_status_expires_at_idx" ON "admission_holds"("status", "expires_at");

-- AddForeignKey
ALTER TABLE "admission_holds" ADD CONSTRAINT "admission_holds_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "admission_classes"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
