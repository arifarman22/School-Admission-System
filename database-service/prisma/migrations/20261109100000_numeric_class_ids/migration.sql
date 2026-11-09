BEGIN;

DROP VIEW "admission_class_availability";

ALTER TABLE "admission_holds" DROP CONSTRAINT "admission_holds_class_id_fkey";
DROP INDEX "admission_holds_active_class_student_key";
DROP INDEX "admission_holds_class_id_status_expires_at_idx";

ALTER TABLE "admission_classes" ADD COLUMN "numeric_id" INTEGER;
UPDATE "admission_classes" c
SET "numeric_id" = r."n"
FROM (
    SELECT "id", (row_number() OVER (ORDER BY "created_at", "id"))::INTEGER AS "n"
    FROM "admission_classes"
) r
WHERE c."id" = r."id";

ALTER TABLE "admission_holds" ADD COLUMN "numeric_class_id" INTEGER;
UPDATE "admission_holds" h
SET "numeric_class_id" = c."numeric_id"
FROM "admission_classes" c
WHERE c."id" = h."class_id";

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM "admission_holds" WHERE "numeric_class_id" IS NULL) THEN
        RAISE EXCEPTION 'numeric class id migration: unmapped admission_holds rows';
    END IF;
END;
$$;

ALTER TABLE "admission_holds" DROP COLUMN "class_id";
ALTER TABLE "admission_holds" RENAME COLUMN "numeric_class_id" TO "class_id";
ALTER TABLE "admission_holds" ALTER COLUMN "class_id" SET NOT NULL;

ALTER TABLE "admission_classes" DROP CONSTRAINT "admission_classes_pkey";
ALTER TABLE "admission_classes" DROP COLUMN "id";
ALTER TABLE "admission_classes" RENAME COLUMN "numeric_id" TO "id";
ALTER TABLE "admission_classes" ALTER COLUMN "id" SET NOT NULL;
ALTER TABLE "admission_classes" ADD CONSTRAINT "admission_classes_pkey" PRIMARY KEY ("id");

CREATE SEQUENCE "admission_classes_id_seq" AS INTEGER OWNED BY "admission_classes"."id";
ALTER TABLE "admission_classes" ALTER COLUMN "id" SET DEFAULT nextval('"admission_classes_id_seq"');
SELECT setval('"admission_classes_id_seq"', COALESCE((SELECT max("id") FROM "admission_classes"), 0) + 1, false);

ALTER TABLE "admission_holds" ADD CONSTRAINT "admission_holds_class_id_fkey"
    FOREIGN KEY ("class_id") REFERENCES "admission_classes"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

CREATE INDEX "admission_holds_class_id_status_expires_at_idx"
    ON "admission_holds"("class_id", "status", "expires_at");

CREATE UNIQUE INDEX "admission_holds_active_class_student_key"
    ON "admission_holds" ("class_id", "student_id")
    WHERE "status" IN ('HELD', 'CONFIRMED');

CREATE VIEW "admission_class_availability" AS
SELECT
    c."id"          AS "class_id",
    c."name"        AS "name",
    c."total_seats" AS "total_seats",
    s."held_seats",
    s."confirmed_seats",
    c."total_seats" - s."held_seats" - s."confirmed_seats" AS "available_seats"
FROM "admission_classes" c
CROSS JOIN LATERAL (
    SELECT
        count(*) FILTER (WHERE h."status" = 'HELD' AND h."expires_at" > now())::int AS "held_seats",
        count(*) FILTER (WHERE h."status" = 'CONFIRMED')::int                       AS "confirmed_seats"
    FROM "admission_holds" h
    WHERE h."class_id" = c."id"
) s;

COMMIT;
