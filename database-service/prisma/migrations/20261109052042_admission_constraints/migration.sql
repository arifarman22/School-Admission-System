-- Hand-written migration: PostgreSQL rules that Prisma's schema language cannot express.
-- Table/column names below match the SQL generated in 20261109051944_init_admission_schema
-- (snake_case via @@map / @map).

-- ---------------------------------------------------------------------------
-- 1. CHECK constraints
-- ---------------------------------------------------------------------------

ALTER TABLE "admission_classes"
    ADD CONSTRAINT "admission_classes_total_seats_positive_chk"
        CHECK ("total_seats" > 0),
    ADD CONSTRAINT "admission_classes_name_not_blank_chk"
        CHECK (length(btrim("name")) > 0);

ALTER TABLE "admission_holds"
    -- Exactly 17 ASCII digits (no spaces, signs or other characters).
    ADD CONSTRAINT "admission_holds_student_id_format_chk"
        CHECK ("student_id" ~ '^[0-9]{17}$'),
    ADD CONSTRAINT "admission_holds_expires_after_created_chk"
        CHECK ("expires_at" > "created_at"),
    -- A CONFIRMED hold must record when it was confirmed.
    ADD CONSTRAINT "admission_holds_confirmed_at_required_chk"
        CHECK ("status" <> 'CONFIRMED' OR "confirmed_at" IS NOT NULL),
    ADD CONSTRAINT "admission_holds_confirmed_at_after_created_chk"
        CHECK ("confirmed_at" IS NULL OR "confirmed_at" >= "created_at");

-- ---------------------------------------------------------------------------
-- 2. One active (HELD or CONFIRMED) record per student per class.
--    EXPIRED / CANCELLED rows are history and do not block a new hold.
--    Note: a HELD row past expires_at still blocks until it is marked EXPIRED
--    (an index predicate cannot use now()); the hold workflow must expire stale
--    holds before inserting a new one.
-- ---------------------------------------------------------------------------

CREATE UNIQUE INDEX "admission_holds_active_class_student_key"
    ON "admission_holds" ("class_id", "student_id")
    WHERE "status" IN ('HELD', 'CONFIRMED');

-- ---------------------------------------------------------------------------
-- 3. Keep historical records
--    - Rows in admission_holds can never be deleted (status changes instead).
--    - Identity columns of a hold are immutable once written.
--    (admission_classes is protected by the ON DELETE RESTRICT foreign key.)
-- ---------------------------------------------------------------------------

CREATE FUNCTION "admission_holds_prevent_delete"() RETURNS trigger
    LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'admission_holds rows are historical records and cannot be deleted (id=%)', OLD."id"
        USING ERRCODE = 'restrict_violation';
END;
$$;

CREATE TRIGGER "admission_holds_no_delete"
    BEFORE DELETE ON "admission_holds"
    FOR EACH ROW EXECUTE FUNCTION "admission_holds_prevent_delete"();

CREATE FUNCTION "admission_holds_prevent_identity_change"() RETURNS trigger
    LANGUAGE plpgsql AS $$
BEGIN
    IF NEW."id" IS DISTINCT FROM OLD."id"
        OR NEW."class_id" IS DISTINCT FROM OLD."class_id"
        OR NEW."student_id" IS DISTINCT FROM OLD."student_id"
        OR NEW."created_at" IS DISTINCT FROM OLD."created_at" THEN
        RAISE EXCEPTION 'id, class_id, student_id and created_at of admission_holds are immutable (id=%)', OLD."id"
            USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER "admission_holds_immutable_identity"
    BEFORE UPDATE ON "admission_holds"
    FOR EACH ROW EXECUTE FUNCTION "admission_holds_prevent_identity_change"();

-- ---------------------------------------------------------------------------
-- 4. Derived capacity — never stored. Evaluated against the database clock
--    (now() = start of the current transaction), so every caller agrees.
--      held_seats      = HELD rows with expires_at in the future
--      confirmed_seats = CONFIRMED rows
--      available_seats = total_seats - held_seats - confirmed_seats
-- ---------------------------------------------------------------------------

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
