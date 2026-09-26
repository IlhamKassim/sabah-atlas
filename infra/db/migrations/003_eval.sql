-- Analyst evaluation reports (kept in the database so containers can serve them).
CREATE TABLE analyst_eval (
    id       bigserial PRIMARY KEY,
    run_at   timestamptz NOT NULL DEFAULT now(),
    model    text NOT NULL,
    report   jsonb NOT NULL
);
