BEGIN;

ALTER TABLE "admission_classes" ADD COLUMN "section" VARCHAR(20) NOT NULL DEFAULT 'A';

ALTER TABLE "admission_classes"
    ADD CONSTRAINT "admission_classes_section_not_blank_chk"
        CHECK (length(btrim("section")) > 0);

DROP INDEX "admission_classes_name_key";

CREATE UNIQUE INDEX "admission_classes_name_section_key"
    ON "admission_classes" (lower("name"), lower("section"));

COMMIT;
