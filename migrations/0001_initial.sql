CREATE TABLE IF NOT EXISTS company_research (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        requested_name TEXT NOT NULL,
        company_name TEXT NOT NULL,
        report TEXT NOT NULL CHECK(json_valid(report)),
        model TEXT NOT NULL,
        usage TEXT,
        annotations TEXT,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS research_runs (
        id TEXT PRIMARY KEY,
        company_name TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'running',
        report_id INTEGER REFERENCES company_research(id),
        error TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS research_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id TEXT NOT NULL REFERENCES research_runs(id),
        stage TEXT NOT NULL,
        level TEXT NOT NULL,
        message TEXT NOT NULL,
        details TEXT,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS research_logs_run_id ON research_logs(run_id, id);
      CREATE TABLE IF NOT EXISTS company_visualizations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        research_id INTEGER NOT NULL REFERENCES company_research(id),
        run_id TEXT NOT NULL REFERENCES research_runs(id),
        report TEXT NOT NULL CHECK(json_valid(report)),
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS visualizations_research_id ON company_visualizations(research_id, id);
      CREATE TABLE IF NOT EXISTS video_pitches (
        id TEXT PRIMARY KEY, company_id INTEGER NOT NULL REFERENCES company_research(id),
        visualization_id INTEGER NOT NULL REFERENCES company_visualizations(id),
        status TEXT NOT NULL, script_text TEXT, script_references TEXT, validation_result TEXT,
        sentence_citations TEXT, coverage TEXT, approved_at TEXT, approved_script_digest TEXT, declined_at TEXT,
        sources TEXT NOT NULL, openrouter_job_id TEXT, polling_url TEXT, estimated_cost REAL,
        confirmed_cost REAL, video_file_path TEXT, error TEXT, lease_until INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS video_company ON video_pitches(company_id, created_at);
      CREATE TABLE IF NOT EXISTS video_webhook_events (id TEXT PRIMARY KEY, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS notes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        body TEXT NOT NULL CHECK(length(body) BETWEEN 1 AND 1000),
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );
