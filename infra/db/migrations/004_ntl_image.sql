-- Sabah at night, one picture per year (NASA Black Marble VNP46A4), for the web map.
-- Replaced by `atlas load` whenever the night-lights step has produced pictures.
CREATE TABLE ntl_image (
    year   int PRIMARY KEY,
    png    bytea NOT NULL,
    west   double precision NOT NULL,
    south  double precision NOT NULL,
    east   double precision NOT NULL,
    north  double precision NOT NULL
);
