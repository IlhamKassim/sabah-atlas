-- AI Analyst: document corpus (hybrid full-text + vector retrieval), briefs, logs.
-- The corpus and briefs are NOT release tables: they survive `atlas load`.

CREATE TABLE doc (
    id          text PRIMARY KEY,
    title       text NOT NULL,
    publisher   text NOT NULL,
    published   text,
    url         text NOT NULL,
    kind        text NOT NULL,
    language    text NOT NULL DEFAULT 'en',
    licence     text,
    topics      text[] NOT NULL DEFAULT '{}',
    pages       int,
    sha256      text,
    retrieved_at timestamptz
);

CREATE TABLE doc_chunk (
    id        text PRIMARY KEY,          -- <doc_id>:p<page>:<n>
    doc_id    text NOT NULL REFERENCES doc(id) ON DELETE CASCADE,
    page      int,
    text      text NOT NULL,
    tsv       tsvector GENERATED ALWAYS AS (to_tsvector('simple', text)) STORED,
    embedding vector(1536),
    metadata  jsonb NOT NULL DEFAULT '{}'
);
CREATE INDEX doc_chunk_tsv_idx ON doc_chunk USING gin (tsv);
CREATE INDEX doc_chunk_doc_idx ON doc_chunk (doc_id);

CREATE TABLE insight (
    id            text PRIMARY KEY,       -- brief:<district_id>:<release>
    district_id   text NOT NULL,
    kind          text NOT NULL CHECK (kind IN ('brief', 'flag')),
    body_md       text NOT NULL,
    citations     jsonb NOT NULL,
    validation    jsonb NOT NULL,
    status        text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'reviewed', 'rejected')),
    reviewer      text,
    review_note   text,
    reviewed_at   timestamptz,
    model_version text NOT NULL,
    release       text,
    created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX insight_district_idx ON insight (district_id, kind);

CREATE TABLE ask_log (
    id          bigserial PRIMARY KEY,
    asked_at    timestamptz NOT NULL DEFAULT now(),
    client_hash text,                     -- salted hash of IP, for rate limiting only
    district_id text,
    question    text NOT NULL,
    model       text,
    tokens_in   int,
    tokens_out  int,
    latency_ms  int,
    validity    double precision,
    refused     boolean NOT NULL DEFAULT false
);
