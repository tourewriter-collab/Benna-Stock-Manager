import sqlite3, json

conn = sqlite3.connect('database.sqlite')
rows = conn.execute("SELECT name, sql FROM sqlite_master WHERE type='trigger'").fetchall()
for name, sql in rows:
    print('=== TRIGGER:', name, '===')
    print(sql[:500])
    print()
