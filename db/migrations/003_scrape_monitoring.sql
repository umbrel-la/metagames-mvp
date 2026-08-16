ALTER TABLE scrape_runs ADD COLUMN total_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE scrape_runs ADD COLUMN success_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE scrape_runs ADD COLUMN current_game TEXT;
ALTER TABLE scrape_runs ADD COLUMN error_message TEXT;

CREATE UNIQUE INDEX idx_one_running_scrape_global
  ON scrape_runs((1)) WHERE status = 'RUNNING';
