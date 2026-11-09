BEGIN;

DO $$
DECLARE
    offenders INTEGER;
BEGIN
    SELECT count(*) INTO offenders
    FROM (
        SELECT "student_id"
        FROM "admission_holds"
        WHERE "status" = 'CONFIRMED'
        GROUP BY "student_id"
        HAVING count(*) > 1
    ) d;
    IF offenders > 0 THEN
        RAISE EXCEPTION 'one admission per student: % student(s) already have more than one CONFIRMED admission; resolve them before migrating', offenders;
    END IF;
END;
$$;

CREATE UNIQUE INDEX "admission_holds_one_confirmed_per_student_key"
    ON "admission_holds" ("student_id")
    WHERE "status" = 'CONFIRMED';

COMMIT;
