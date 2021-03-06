# Function Reference:
# 	https://www.gnu.org/software/make/manual/html_node/Text-Functions.html
#  	https://www.gnu.org/software/make/manual/html_node/File-Name-Functions.html
# Variable Reference:
# 	https://www.gnu.org/software/make/manual/html_node/Automatic-Variables.html

# Makefile's own config
ifeq ($(OS),Windows_NT)
WINDOWS=1
endif

ifdef WINDOWS
SHELL  = cmd
JEKYLL = bundle.bat exec jekyll
MKDIRP = mkdir
CAT    = type
LS     = ls
else
SHELL  = sh
JEKYLL = bundle exec jekyll
MKDIRP = mkdir -p
CAT    = cat
LS     = ls
endif

# constants
EMPTY =
SPACE = $(EMPTY) $(EMPTY)
COMMA = ,

VERSION_VAR_NAME = latest_docs_version

# paths and files
BIN_DIR      = tools/bin
NODE_BIN_DIR = ./node_modules/.bin

SRC_DIR    = www
DEV_DIR    = build-dev
PROD_DIR   = build-prod
CONFIG_DIR = conf

DOCS_DIR         = $(SRC_DIR)/docs
DATA_DIR         = $(SRC_DIR)/_data
TOC_DIR          = $(DATA_DIR)/toc
STATIC_DIR       = $(SRC_DIR)/static
CSS_SRC_DIR      = $(STATIC_DIR)/css-src
CSS_DEST_DIR     = $(STATIC_DIR)/css
PLUGINS_SRC_DIR  = $(STATIC_DIR)/plugins
PLUGINS_DEST_DIR = $(STATIC_DIR)/js

# executables
NODE       = node
GULP       = $(NODE_BIN_DIR)/gulp
LESSC      = $(NODE_BIN_DIR)/lessc
SASSC      = $(NODE_BIN_DIR)/node-sass
BROWSERIFY = $(NODE_BIN_DIR)/browserify
UGLIFY     = $(NODE_BIN_DIR)/uglifyjs

# replace slashes in executables on Windows
ifdef WINDOWS
GULP       := $(subst /,\,$(GULP))
LESSC      := $(subst /,\,$(LESSC))
SASSC      := $(subst /,\,$(SASSC))
BROWSERIFY := $(subst /,\,$(BROWSERIFY))
UGLIFY     := $(subst /,\,$(UGLIFY))
endif

# existing files
MAIN_CONFIG         = $(CONFIG_DIR)/_config.yml
DEV_CONFIG          = $(CONFIG_DIR)/_dev.yml
PROD_CONFIG         = $(CONFIG_DIR)/_prod.yml
DOCS_EXCLUDE_CONFIG = $(CONFIG_DIR)/_nodocs.yml
FETCH_CONFIG        = $(DATA_DIR)/fetched-files.yml
PLUGINS_SRC         = $(PLUGINS_SRC_DIR)/app.js
VERSION_FILE        = VERSION
FETCH_SCRIPT        = $(BIN_DIR)/fetch_docs.js

# NOTE:
#      the .scss files are separate because they combine into MAIN_STYLE_FILE,
#      which includes them on its own, and the SCSS compiler takes care of them;
#      because of this, there is also no .scss -> .css pattern rule
ifdef WINDOWS
SCSS_SRC   = $(shell cd $(CSS_SRC_DIR) && dir *.scss /S /B)
STYLES_SRC = $(shell cd $(CSS_SRC_DIR) && dir *.less *.css /S /B)
else
SCSS_SRC   = $(shell find $(CSS_SRC_DIR) -name "*.scss")
STYLES_SRC = $(shell find $(CSS_SRC_DIR) -name "*.less" -or -name "*.css")
endif

LANGUAGES = $(shell $(LS) $(DOCS_DIR))

LATEST_DOCS_VERSION = $(shell $(CAT) $(VERSION_FILE))
NEXT_DOCS_VERSION   = $(shell $(NODE) $(BIN_DIR)/nextversion.js $(LATEST_DOCS_VERSION))

LATEST_DOCS_VERSION_SLUG = $(subst .,-,$(LATEST_DOCS_VERSION))
NEXT_DOCS_VERSION_SLUG   = $(subst .,-,$(NEXT_DOCS_VERSION))

DEV_DOCS      = $(addprefix $(DOCS_DIR)/,$(addsuffix /dev,$(LANGUAGES)))
DEV_DOCS_TOCS = $(addprefix $(TOC_DIR)/,$(addsuffix -dev-manual.yml, $(LANGUAGES)))

# generated files
VERSION_CONFIG    = $(CONFIG_DIR)/_version.yml
DEFAULTS_CONFIG   = $(CONFIG_DIR)/_defaults.yml
DOCS_VERSION_DATA = $(DATA_DIR)/docs-versions.yml
PLUGINS_APP       = $(PLUGINS_DEST_DIR)/plugins.js
MAIN_STYLE_FILE   = $(CSS_DEST_DIR)/main.css

STYLES = $(MAIN_STYLE_FILE) $(addsuffix .css,$(basename $(subst $(CSS_SRC_DIR),$(CSS_DEST_DIR),$(STYLES_SRC))))

# NOTE:
#      docs slugs are lang/version pairs, with "/" and "." replaced by "-"
DOCS_VERSION_DIRS  = $(filter-out %.md,$(wildcard $(DOCS_DIR)/**/*))
DOCS_VERSION_SLUGS = $(subst /,-,$(subst .,-,$(subst $(DOCS_DIR)/,,$(DOCS_VERSION_DIRS))))
TOC_FILES          = $(addprefix $(TOC_DIR)/,$(addsuffix -generated.yml,$(DOCS_VERSION_SLUGS)))

FETCH_FLAGS   = --config $(FETCH_CONFIG) --docsRoot $(DOCS_DIR)
FETCHED_FILES = $(shell $(NODE) $(FETCH_SCRIPT) $(FETCH_FLAGS) --dump)

LATEST_DOCS      = $(addprefix $(DOCS_DIR)/,$(addsuffix /$(LATEST_DOCS_VERSION),$(LANGUAGES)))
LATEST_DOCS_TOCS = $(addprefix $(TOC_DIR)/,$(addsuffix -$(LATEST_DOCS_VERSION_SLUG)-manual.yml, $(LANGUAGES)))

NEXT_DOCS      = $(addprefix $(DOCS_DIR)/,$(addsuffix /$(NEXT_DOCS_VERSION),$(LANGUAGES)))
NEXT_DOCS_TOCS = $(addprefix $(TOC_DIR)/,$(addsuffix -$(NEXT_DOCS_VERSION_SLUG)-manual.yml, $(LANGUAGES)))

# other variables
# NOTE:
#      the order of config files matters to Jekyll
JEKYLL_CONFIGS = $(MAIN_CONFIG) $(DEFAULTS_CONFIG) $(VERSION_CONFIG)
JEKYLL_FLAGS   =

# convenience targets
help usage default:
	@echo ""
	@echo "Usage:"
	@echo ""
	@echo "    make build:   build site with dev config"
	@echo "    make install: install dependencies"
	@echo ""
	@echo "    make data:    generate data files (Generated ToCs, $(DOCS_VERSION_DATA))"
	@echo "    make configs: generate Jekyll configs ($(DEFAULTS_CONFIG), $(VERSION_CONFIG))"
	@echo "    make styles:  generate CSS"
	@echo "    make plugins: generate plugins app ($(PLUGINS_APP))"
	@echo ""
	@echo "    make clean:   remove all generated output"
	@echo "    make nuke:    run 'make clean' and remove all dependencies"
	@echo ""
	@echo "Arguments:"
	@echo ""
	@echo "    NODOCS: (defined or undefined) - excludes docs from build"
	@echo "    PROD:   (defined or undefined) - uses production config instead of dev config"
	@echo ""

data: $(TOC_FILES) $(DOCS_VERSION_DATA)
configs: $(DEFAULTS_CONFIG) $(VERSION_CONFIG)
styles: $(STYLES)
plugins: $(PLUGINS_APP)
toc: $(TOC_FILES)

ifdef PROD

JEKYLL_CONFIGS += $(PROD_CONFIG)
ifdef NODOCS
$(error Cannot ignore docs during a production build)
endif

else

JEKYLL_CONFIGS += $(DEV_CONFIG)
JEKYLL_FLAGS += --trace
ifdef NODOCS
JEKYLL_CONFIGS += $(DOCS_EXCLUDE_CONFIG)
endif

endif

build: JEKYLL_FLAGS += --config $(subst $(SPACE),$(COMMA),$(strip $(JEKYLL_CONFIGS)))
build: $(JEKYLL_CONFIGS) fetch data styles plugins
	$(JEKYLL) build $(JEKYLL_FLAGS)

install:
	bundle install
	npm install

serve:
	cd $(DEV_DIR) && python -m SimpleHTTPServer 8000

fetch: $(FETCHED_FILES)

snap: fetch $(LATEST_DOCS) $(LATEST_DOCS_TOCS)

newversion: $(NEXT_DOCS) $(NEXT_DOCS_TOCS)
	echo $(NEXT_DOCS_VERSION) > $(VERSION_FILE)

# real targets
$(FETCHED_FILES): $(FETCH_CONFIG) $(FETCH_SCRIPT)
	$(NODE) $(FETCH_SCRIPT) $(FETCH_FLAGS)

# NOTE:
#      the ">>" operator appends to a file in both CMD and SH
$(PLUGINS_APP): $(PLUGINS_SRC)
	echo ---> $@
	echo --->> $@
	$(BROWSERIFY) -t reactify -t envify $< | $(UGLIFY) >> $@

$(DOCS_VERSION_DATA): $(BIN_DIR)/gen_versions.js $(DOCS_DIR)
	$(NODE) $(BIN_DIR)/gen_versions.js $(DOCS_DIR) > $@

$(DEFAULTS_CONFIG): $(BIN_DIR)/gen_defaults.js $(VERSION_FILE) $(DOCS_DIR)
	$(NODE) $(BIN_DIR)/gen_defaults.js $(DOCS_DIR) "$(LATEST_DOCS_VERSION)" > $@

$(VERSION_CONFIG): $(VERSION_FILE)
	sed -e "s/^/$(VERSION_VAR_NAME): /" < $< > $@

$(TOC_FILES): $(BIN_DIR)/toc.js $(DOCS_DIR)
	$(NODE) $(BIN_DIR)/toc.js $(DOCS_DIR) $(DATA_DIR)

$(MAIN_STYLE_FILE): $(SCSS_SRC)

# pattern rules
$(DOCS_DIR)/%/$(LATEST_DOCS_VERSION): $(DOCS_DIR)/%/dev
	$(RM) -r $@
ifdef WINDOWS
	xcopy "$^" "$@" /E /I
else
	cp -r $^ $@
endif
ifndef WINDOWS
	touch $(DOCS_DIR)
endif

$(DOCS_DIR)/%/$(NEXT_DOCS_VERSION): $(DOCS_DIR)/%/dev
ifdef WINDOWS
	xcopy "$^" "$@" /E /I
else
	cp -r $^ $@
endif
ifndef WINDOWS
	touch $(DOCS_DIR)
endif

$(TOC_DIR)/%-$(LATEST_DOCS_VERSION_SLUG)-manual.yml: $(TOC_DIR)/%-dev-manual.yml $(DOCS_DIR)
ifdef WINDOWS
	copy $(subst /,\,"$<") $(subst /,\,"$@")
else
	cp $< $@
endif

$(TOC_DIR)/%-$(NEXT_DOCS_VERSION_SLUG)-manual.yml: $(TOC_DIR)/%-dev-manual.yml $(DOCS_DIR)
ifdef WINDOWS
	copy $(subst /,\,"$<") $(subst /,\,"$@")
else
	cp $< $@
endif

# NODE:
#      $(@D) means "directory part of target"
$(CSS_DEST_DIR)/%.css: $(CSS_SRC_DIR)/%.less
ifdef WINDOWS
	-$(MKDIRP) $(subst /,\,$(@D))
else
	$(MKDIRP) $(@D)
endif
	echo ---> $@
	echo --->> $@
	$(LESSC) $< >> $@

$(CSS_DEST_DIR)/%.css: $(CSS_SRC_DIR)/%.scss
ifdef WINDOWS
	-$(MKDIRP) $(subst /,\,$(@D))
else
	$(MKDIRP) $(@D)
endif
	echo ---> $@
	echo --->> $@
	$(SASSC) $< >> $@

$(CSS_DEST_DIR)/%.css: $(CSS_SRC_DIR)/%.css
ifdef WINDOWS
	-$(MKDIRP) $(subst /,\,$(@D))
else
	$(MKDIRP) $(@D)
endif
	echo ---> $@
	echo --->> $@
	cat $< >> $@

# maintenance
clean:

	$(RM) -r $(PROD_DIR) $(DEV_DIR)
	$(RM) $(VERSION_CONFIG)
	$(RM) $(DEFAULTS_CONFIG)
	$(RM) $(TOC_FILES)
	$(RM) $(DOCS_VERSION_DATA)
	$(RM) $(PLUGINS_APP)
	$(RM) -r $(CSS_DEST_DIR)
	$(RM) $(FETCHED_FILES)

nuke: clean
	$(RM) -r node_modules
	$(RM) Gemfile.lock

.PHONY: clean usage help default build $(DEV_DOCS)
