-- Core atlas schema. Every published value carries source_id + period (vintage).
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE release (
    version       text PRIMARY KEY,
    created_at    timestamptz NOT NULL DEFAULT now(),
    content_hash  text NOT NULL,
    manifest      jsonb NOT NULL
);

CREATE TABLE district (
    id            text PRIMARY KEY,
    slug          text NOT NULL UNIQUE,
    name          text NOT NULL,
    display_name  text NOT NULL,
    state         text NOT NULL,
    state_code    text NOT NULL,
    division      text,
    kind          text NOT NULL CHECK (kind IN ('district', 'successor', 'supra')),
    parent_id     text REFERENCES district(id),
    first_period  text,
    note          text,
    area_km2      double precision,
    lon           double precision,
    lat           double precision,
    geom          geometry(MultiPolygon, 4326)
);
CREATE INDEX district_geom_idx ON district USING gist (geom);
CREATE INDEX district_state_idx ON district (state);

CREATE TABLE district_alias (
    state        text NOT NULL,
    alias        text NOT NULL,
    district_id  text NOT NULL REFERENCES district(id),
    PRIMARY KEY (state, alias)
);

CREATE TABLE source (
    id             text PRIMARY KEY,
    publisher      text NOT NULL,
    dataset_id     text NOT NULL,
    title          text NOT NULL,
    url            text NOT NULL,
    download_url   text,
    licence        text NOT NULL,
    last_updated   text,
    data_as_of     text,
    retrieved_at   timestamptz,
    checksum       text,
    caveat         text,
    publisher_meta jsonb
);

CREATE TABLE indicator (
    code         text PRIMARY KEY,
    label        text NOT NULL,
    short        text NOT NULL,
    unit         text NOT NULL,
    format       text NOT NULL,
    direction    text NOT NULL CHECK (direction IN ('up', 'down', 'neutral')),
    category     text NOT NULL,
    jalur        text,
    source       text NOT NULL,
    description  text NOT NULL
);

CREATE TABLE observation (
    district_id     text NOT NULL REFERENCES district(id),
    indicator_code  text NOT NULL REFERENCES indicator(code),
    period          int  NOT NULL,
    value           double precision NOT NULL,
    source_id       text NOT NULL,
    is_modelled     boolean NOT NULL DEFAULT false,
    quality_flag    text,
    rank_sabah      int,
    n_sabah         int,
    pct_sabah       double precision,
    pct_national    double precision,
    PRIMARY KEY (district_id, indicator_code, period)
);
CREATE INDEX observation_indicator_idx ON observation (indicator_code, period);

CREATE TABLE gdp_sector (
    district_id  text NOT NULL REFERENCES district(id),
    period       int  NOT NULL,
    sector       text NOT NULL,
    value        double precision,  -- NULL = suppressed by DOSM (< RM5 mil), not zero
    PRIMARY KEY (district_id, period, sector)
);

-- Analytics outputs (written by atlas_ml, loaded per release).
CREATE TABLE analytics (
    district_id  text NOT NULL REFERENCES district(id),
    kind         text NOT NULL,   -- scorecard | shift_share | typology | drivers | forecast
    payload      jsonb NOT NULL,
    model_version text NOT NULL,
    PRIMARY KEY (district_id, kind)
);

CREATE TABLE model_card (
    model_version text PRIMARY KEY,
    task          text NOT NULL,
    card          jsonb NOT NULL
);
