"""Create the mess_management database if it does not exist."""
import psycopg

ADMIN = dict(host="localhost", port=5432, user="postgres", password="Khanali", dbname="postgres", autocommit=True)
TARGET = "mess_management"

with psycopg.connect(**ADMIN) as conn:
    with conn.cursor() as cur:
        cur.execute("SELECT 1 FROM pg_database WHERE datname = %s", (TARGET,))
        if cur.fetchone() is None:
            cur.execute(f'CREATE DATABASE "{TARGET}"')
            print(f"Database {TARGET} created")
        else:
            print(f"Database {TARGET} already exists")