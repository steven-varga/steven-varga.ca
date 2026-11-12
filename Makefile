PYTHON=python3
VENV=.venv
ACTIVATE=$(VENV)/bin/activate
REQ=requirements.txt

BLOG_DIR=docs/blog/posts
SOCIAL_DIR=docs/assets/social
BASE_URL=http://127.0.0.1:9000/blog

# Default target
all: serve

# Create virtual environment if missing
$(VENV)/bin/activate: $(REQ)
	@test -d $(VENV) || $(PYTHON) -m venv $(VENV)
	@. $(ACTIVATE); pip install --upgrade pip
	@. $(ACTIVATE); pip install -r $(REQ)

venv: $(VENV)/bin/activate

# Start mkdocs dev server (after ensuring venv)
serve: venv
	@echo "Starting mkdocs server at $(BASE_URL)"
	@. $(ACTIVATE); mkdocs serve --livereload --dev-addr=127.0.0.1:9000

# Start Vite live dev server for Sigma AI slides on port 5173
slides-dev:
	@echo "Starting Sigma AI slides live server on http://0.0.0.0:5173"
	npx vite docs/slides/sigma-ai --host 0.0.0.0 --port 5173

# Build the site once
build: venv
	@. $(ACTIVATE); mkdocs build

# Generate social cards (needs Node.js + Puppeteer)
social:
	@echo "Generating OG social cards..."
	cd .og-generator && npm install --no-fund --no-audit
	node .og-generator/generate-all-social-cards.mjs $(BLOG_DIR) $(SOCIAL_DIR) $(BASE_URL)

# Force regenerate all social cards
social-force:
	@echo "Forcing full rebuild of OG social cards..."
	cd .og-generator && npm install --no-fund --no-audit
	node .og-generator/generate-all-social-cards.mjs $(BLOG_DIR) $(SOCIAL_DIR) $(BASE_URL) --force

# Clean
clean:
	rm -rf $(VENV) site docs/assets/social/*.png
