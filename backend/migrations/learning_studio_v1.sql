BEGIN;

CREATE TABLE IF NOT EXISTS learning_courses (
  id SERIAL PRIMARY KEY,
  slug VARCHAR(180) NOT NULL UNIQUE,
  title VARCHAR(240) NOT NULL,
  short_title VARCHAR(100),
  summary TEXT,
  description TEXT,
  category VARCHAR(60) NOT NULL DEFAULT 'LuxQuant',
  level VARCHAR(20) NOT NULL DEFAULT 'beginner',
  access_tier VARCHAR(20) NOT NULL DEFAULT 'free',
  status VARCHAR(20) NOT NULL DEFAULT 'draft',
  is_featured BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  estimated_minutes INTEGER NOT NULL DEFAULT 0,
  cover_image VARCHAR(1000),
  skills_json TEXT NOT NULL DEFAULT '[]',
  outcomes_json TEXT NOT NULL DEFAULT '[]',
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS learning_modules (
  id SERIAL PRIMARY KEY,
  course_id INTEGER NOT NULL REFERENCES learning_courses(id) ON DELETE CASCADE,
  slug VARCHAR(180) NOT NULL,
  title VARCHAR(240) NOT NULL,
  summary TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  estimated_minutes INTEGER NOT NULL DEFAULT 0,
  is_preview BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_learning_module_course_slug UNIQUE(course_id, slug)
);

CREATE TABLE IF NOT EXISTS learning_lessons (
  id SERIAL PRIMARY KEY,
  module_id INTEGER NOT NULL REFERENCES learning_modules(id) ON DELETE CASCADE,
  slug VARCHAR(180) NOT NULL,
  title VARCHAR(300) NOT NULL,
  summary TEXT,
  lesson_type VARCHAR(24) NOT NULL DEFAULT 'slides',
  level VARCHAR(20) NOT NULL DEFAULT 'beginner',
  access_tier VARCHAR(20) NOT NULL DEFAULT 'inherit',
  status VARCHAR(20) NOT NULL DEFAULT 'draft',
  sort_order INTEGER NOT NULL DEFAULT 0,
  estimated_minutes INTEGER NOT NULL DEFAULT 4,
  content_json TEXT NOT NULL DEFAULT '[]',
  transcript TEXT,
  youtube_url VARCHAR(1000),
  source_url VARCHAR(1000),
  version INTEGER NOT NULL DEFAULT 1,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_at TIMESTAMPTZ,
  CONSTRAINT uq_learning_lesson_module_slug UNIQUE(module_id, slug)
);

CREATE TABLE IF NOT EXISTS learning_progress (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lesson_id INTEGER NOT NULL REFERENCES learning_lessons(id) ON DELETE CASCADE,
  progress_pct INTEGER NOT NULL DEFAULT 0,
  score DOUBLE PRECISION,
  last_position VARCHAR(120),
  state_json TEXT NOT NULL DEFAULT '{}',
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_learning_progress_user_lesson UNIQUE(user_id, lesson_id)
);

CREATE TABLE IF NOT EXISTS learning_notes (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lesson_id INTEGER NOT NULL REFERENCES learning_lessons(id) ON DELETE CASCADE,
  anchor VARCHAR(120),
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_learning_courses_status ON learning_courses(status);
CREATE INDEX IF NOT EXISTS ix_learning_modules_course_id ON learning_modules(course_id);
CREATE INDEX IF NOT EXISTS ix_learning_lessons_module_id ON learning_lessons(module_id);
CREATE INDEX IF NOT EXISTS ix_learning_lessons_slug ON learning_lessons(slug);
CREATE INDEX IF NOT EXISTS ix_learning_progress_user_id ON learning_progress(user_id);
CREATE INDEX IF NOT EXISTS ix_learning_notes_user_id ON learning_notes(user_id);

COMMIT;
