# Local stand-in for Azure Database for PostgreSQL Flexible Server, which ships
# both PostGIS and pgvector as allow-listed extensions. Based on the multi-arch
# pgvector image (postgis/postgis has no arm64 build) with PostGIS added.
FROM pgvector/pgvector:pg16
RUN apt-get update \
 && apt-get install -y --no-install-recommends postgresql-16-postgis-3 \
 && rm -rf /var/lib/apt/lists/*
