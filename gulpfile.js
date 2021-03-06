"use strict";

// dependencies
var path          = require("path");
var fs            = require("fs");
var fse           = require("fs-extra");
var child_process = require("child_process");

var gulp        = require("gulp");
var gutil       = require("gulp-util");
var less        = require("gulp-less");
var sass        = require("gulp-sass");
var replace     = require("gulp-replace");
var header      = require("gulp-header");
var footer      = require("gulp-footer");
var rename      = require("gulp-rename");
var browsersync = require("browser-sync");
var vstream     = require("vinyl-source-stream");
var buffer      = require("vinyl-buffer");

var browserify = require("browserify");
var reactify   = require("reactify");
var uglify     = require("gulp-uglify");
var envify     = require("envify");
var htmllint   = require("gulp-htmllint");
var crawler    = require("simplecrawler");
var ncp        = require("ncp");

var nextversion = require("./tools/bin/nextversion");
var util        = require("./tools/bin/util");

// constants
var ROOT_DIR   = ".";
var CONFIG_DIR = "conf";
var SOURCE_DIR = path.join(ROOT_DIR, "www");
var DEV_DIR    = path.join(ROOT_DIR, "build-dev");
var PROD_DIR   = path.join(ROOT_DIR, "build-prod");

var DATA_DIR        = path.join(SOURCE_DIR, "_data");
var TOC_DIR         = path.join(DATA_DIR, "toc");
var DOCS_DIR        = path.join(SOURCE_DIR, "docs");
var FETCH_DIR       = path.join(DOCS_DIR, "en", "dev", "reference");
var CSS_SRC_DIR     = path.join(SOURCE_DIR, "static", "css-src");
var CSS_OUT_DIR     = path.join(SOURCE_DIR, "static", "css");
var PLUGINS_SRC_DIR = path.join(SOURCE_DIR, "static", "plugins");
var JS_DIR          = path.join(SOURCE_DIR, "static", "js");
var BIN_DIR         = path.join(ROOT_DIR, "tools", "bin");

var CONFIG_FILE          = path.join(CONFIG_DIR, "_config.yml");
var DEFAULTS_CONFIG_FILE = path.join(CONFIG_DIR, "_defaults.yml");
var VERSION_CONFIG_FILE  = path.join(CONFIG_DIR, "_version.yml");
var PROD_CONFIG_FILE     = path.join(CONFIG_DIR, "_prod.yml");
var DEV_CONFIG_FILE      = path.join(CONFIG_DIR, "_dev.yml");
var NODOCS_CONFIG_FILE   = path.join(CONFIG_DIR, "_nodocs.yml");

var VERSION_FILE      = "VERSION";
var DOCS_VERSION_FILE = path.join(DATA_DIR, "docs-versions.yml");
var PLUGINS_FILE_NAME = "plugins.js";
var PLUGINS_FILE      = path.join(JS_DIR, PLUGINS_FILE_NAME);
var PLUGINS_SRC_FILE  = path.join(PLUGINS_SRC_DIR, "app.js");
var FETCH_CONFIG      = path.join(DATA_DIR, "fetched-files.yml");

var BASE_CONFIGS = [CONFIG_FILE, DEFAULTS_CONFIG_FILE, VERSION_CONFIG_FILE];
var DEV_CONFIGS  = [DEV_CONFIG_FILE];
var PROD_CONFIGS = [PROD_CONFIG_FILE];
var DEV_FLAGS    = ["--trace"];
var PROD_FLAGS   = [];

var BASE_URL            = "";
var YAML_FRONT_MATTER   = "---\n---\n";
var WATCH_INTERVAL      = 1000; // in milliseconds
var VERSION_VAR_NAME    = "latest_docs_version";
var LATEST_DOCS_VERSION = fs.readFileSync(VERSION_FILE, 'utf-8').trim();
var NEXT_DOCS_VERSION   = nextversion.getNextVersion(LATEST_DOCS_VERSION);
var LANGUAGES           = util.listdirsSync(DOCS_DIR);

var PROD_BY_DEFAULT = false;

// compute/get/set/adjust passed options
gutil.env.prod   = gutil.env.prod || PROD_BY_DEFAULT;
gutil.env.dev    = !gutil.env.prod;
gutil.env.outDir = gutil.env.prod ? PROD_DIR : DEV_DIR;

// check for errors
if (gutil.env.prod && gutil.env.nodocs) {
    fatal("can't ignore docs when doing a production build");
}

// helpers
function fatal(message) {
    gutil.log(gutil.colors.red("ERROR") + ": " + message);
    process.exit(1);
}

function execPiped(command, args, fileName) {
    console.log(command + " " + args.join(" "));
    var task = child_process.spawn(command, args);
    return task.stdout.pipe(vstream(fileName)).pipe(buffer());
}

function exec(command, args, cb) {
    console.log(command + " " + args.join(" "));
    var task = child_process.spawn(command, args, {stdio: "inherit"});
    task.on("exit", cb);
}

function bin(name) {
    return path.join(BIN_DIR, name);
}

function remove(path) {
    console.log("removing " + path);
    fse.removeSync(path);
}

function getBundleExecutable() {
    if (process.platform === "win32") {
        return "bundle.bat";
    } else {
        return "bundle";
    }
}

function getJekyllConfigs() {
    var configs = BASE_CONFIGS;

    // add build-specific config files
    if (gutil.env.prod) {
        configs = configs.concat(PROD_CONFIGS);
    } else {
        configs = configs.concat(DEV_CONFIGS);
    }

    // add a special exclude file if "nodocs" was specified
    if (gutil.env.nodocs) {
        configs = configs.concat(NODOCS_CONFIG_FILE);
    }

    return configs;
}

function jekyllBuild(done) {
    var bundle  = getBundleExecutable();
    var configs = getJekyllConfigs();
    var flags   = gutil.env.prod ? PROD_FLAGS : DEV_FLAGS;

    flags = flags.concat(["--config", configs.join(",")]);

    exec(bundle, ["exec", "jekyll", "build"].concat(flags), done);
}

function copyDocsVersion(oldVersion, newVersion, cb) {

    // copying a folder and a ToC file for each language
    var numCopyOperations = LANGUAGES.length * 2;

    // pseudo-CV (condition variable)
    var numCopied = 0;
    function doneCopying(error) {

        if (error) {
            cb(error);
            return;
        }

        // call callback if all folders have finished copying
        numCopied += 1;
        if (numCopied === numCopyOperations) {
            cb();
        }
    }

    // create a new version for each language
    LANGUAGES.forEach(function (languageName) {

        // get files to copy
        var oldVersionDocs = path.join(DOCS_DIR, languageName, oldVersion);
        var oldVersionToc  = path.join(TOC_DIR, util.manualTocfileName(languageName, oldVersion));
        var newVersionDocs = path.join(DOCS_DIR, languageName, newVersion);
        var newVersionToc  = path.join(TOC_DIR, util.manualTocfileName(languageName, newVersion));

        var copyOptions = {
            stopOnErr: true
        };

        // copy docs
        console.log(oldVersionDocs + " -> " + newVersionDocs);
        ncp.ncp(oldVersionDocs, newVersionDocs, copyOptions, doneCopying);

        // copy ToC
        console.log(oldVersionToc + " -> " + newVersionToc);
        ncp.ncp(oldVersionToc, newVersionToc, copyOptions, doneCopying);
    });
}

// tasks
gulp.task("default", ["help"]);

gulp.task("help", function () {
    gutil.log("");
    gutil.log("Tasks:");
    gutil.log("");
    gutil.log("    build         same as configs + data + styles + plugins + jekyll");
    gutil.log("    jekyll        build with jekyll");
    gutil.log("    regen         same as jekyll + reload");
    gutil.log("    serve         build the site and open it in a browser");
    gutil.log("    reload        refresh the browser");
    gutil.log("");
    gutil.log("    plugins       build " + PLUGINS_FILE);
    gutil.log("");
    gutil.log("    configs       run all the below tasks");
    gutil.log("    defaults      create " + DEFAULTS_CONFIG_FILE);
    gutil.log("    version       create " + VERSION_CONFIG_FILE);
    gutil.log("");
    gutil.log("    data          run all the below tasks");
    gutil.log("    docs-versions create " + DOCS_VERSION_FILE);
    gutil.log("    toc           create all generated ToC files in " + TOC_DIR);
    gutil.log("    fetch         download docs specified in " + FETCH_CONFIG);
    gutil.log("");
    gutil.log("    styles        run all the below tasks");
    gutil.log("    less          compile all .less files");
    gutil.log("    sass          compile all .scss files");
    gutil.log("    css           copy over all .css files");
    gutil.log("");
    gutil.log("    watch         serve + then watch all source files and regenerate as necessary");
    gutil.log("");
    gutil.log("    link-bugs     replace CB-XXXX references with nice links");
    gutil.log("    newversion    create the next docs version from current dev version");
    gutil.log("");
    gutil.log("    help          show this text");
    gutil.log("    clean         remove all generated files and folders");
    gutil.log("");
    gutil.log("Arguments:");
    gutil.log("    --nodocs      don't generate docs");
    gutil.log("    --prod        build for production; without it, will build dev instead");
    gutil.log("");
});

gulp.task("data", ["toc", "docs-versions"])
gulp.task("configs", ["defaults", "version"]);
gulp.task("styles", ["less", "css", "sass"]);

gulp.task("watch", ["serve"], function () {
    gulp.watch(
        [
            path.join(CSS_SRC_DIR, "**", "*"),
        ],
        {interval: WATCH_INTERVAL},
        ["styles"]
    );
    gulp.watch(
        [
            path.join(PLUGINS_SRC_DIR, "**", "*.js"),
            path.join(PLUGINS_SRC_DIR, "**", "*.jsx"),
            path.join(PLUGINS_SRC_DIR, "**", "*.json"),
        ],
        {interval: WATCH_INTERVAL},
        ["plugins"]
    );
    gulp.watch(
        [
            path.join(ROOT_DIR, "**", "*.yml"),
            path.join(JS_DIR, "**", "*.js"),
            path.join(CSS_OUT_DIR, "**", "*.css"),

            // NOTE:
            //      watch all non-docs HTML, and only docs/en/dev HTML because
            //      versions other than dev usually don't change much; this is
            //      an optimization
            path.join(SOURCE_DIR, "_layouts", "*.html"),
            path.join(SOURCE_DIR, "_includes", "*.html"),
            path.join(SOURCE_DIR, "**", "*.html") + "!" + path.join(DOCS_DIR, "**"),
            path.join(SOURCE_DIR, "**", "*.md") + "!" + path.join(DOCS_DIR, "**") ,
            path.join(DOCS_DIR, "en", "dev", "**", "*.md") ,
            path.join(DOCS_DIR, "en", "dev", "**", "*.html"),
        ],
        {interval: WATCH_INTERVAL},
        ["regen"]
    );
});

gulp.task("serve", ["build"], function () {
    var route = {};

    // set site root for browsersync
    if (gutil.env.prod) {
        route[BASE_URL] = gutil.env.outDir;
    }

    browsersync({
        notify: true,
        server: {
            baseDir: gutil.env.outDir,
            routes: route
        }
    });
});

gulp.task("build", ["configs", "data", "styles", "plugins"], function (done) {
    jekyllBuild(done);
});

gulp.task("jekyll", function (done) {
    jekyllBuild(done);
});

gulp.task("regen", ["jekyll"], function () {
    browsersync.reload();
});

gulp.task("fetch", function (done) {
    if (!fs.existsSync(FETCH_DIR)) {
        exec("node", [bin("fetch_docs.js"), "--config", FETCH_CONFIG, '--docsRoot', DOCS_DIR], done);
    } else {
        gutil.log(gutil.colors.yellow(
            "Skipping fetching external docs. Run 'gulp clean' first to initiate another fetch."));
        done();
    }
});

gulp.task("reload", function () {
    browsersync.reload();
});

gulp.task("docs-versions", function () {
    return execPiped("node", [bin("gen_versions.js"), DOCS_DIR], DOCS_VERSION_FILE)
        .pipe(gulp.dest(ROOT_DIR));
});

gulp.task("version", function () {
    // this code is stupid; it's basically the line:
    //      cat VERSION | sed -e 's/^/VERSION_VAR_NAME: /' > _version.yml
    // however we're in Gulp, and we need to support Windows...
    // so we contort it into a monster
    return gulp
        .src(VERSION_FILE)
        .pipe(header(VERSION_VAR_NAME + ": "))
        .pipe(footer("\n"))
        .pipe(rename(VERSION_CONFIG_FILE))
        .pipe(gulp.dest("."));
});

gulp.task("defaults", function () {
    return execPiped("node", [bin("gen_defaults.js"), DOCS_DIR, LATEST_DOCS_VERSION], DEFAULTS_CONFIG_FILE)
        .pipe(gulp.dest(ROOT_DIR));
});

gulp.task("toc", ["fetch"], function (done) {
    if (gutil.env.prod) {
        exec("node", [bin("toc.js"), DOCS_DIR, DATA_DIR], done);
    } else {
        done();
    }
});

gulp.task("less", function () {
    return gulp
        .src(path.join(CSS_SRC_DIR, "**", "*.less"))
        .pipe(less())
        .pipe(header(YAML_FRONT_MATTER))
        .pipe(gulp.dest(CSS_OUT_DIR))
        .pipe(gulp.dest(CSS_OUT_DIR.replace(SOURCE_DIR, gutil.env.outDir)))
        .pipe(browsersync.reload({stream: true}));
})

gulp.task("css", function () {
    return gulp
        .src(path.join(CSS_SRC_DIR, "**", "*.css"))
        .pipe(header(YAML_FRONT_MATTER))
        .pipe(gulp.dest(CSS_OUT_DIR))
        .pipe(gulp.dest(CSS_OUT_DIR.replace(SOURCE_DIR, gutil.env.outDir)))
        .pipe(browsersync.reload({stream: true}));
})

gulp.task("sass", function() {
    return gulp
        .src(path.join(CSS_SRC_DIR, "**", "*.scss"))
        .pipe(sass().on("error", sass.logError))
        .pipe(header(YAML_FRONT_MATTER))
        .pipe(gulp.dest(CSS_OUT_DIR))
        .pipe(gulp.dest(CSS_OUT_DIR.replace(SOURCE_DIR, gutil.env.outDir)))
        .pipe(browsersync.reload({stream: true}));
});

gulp.task("plugins", function() {
    if (gutil.env.prod) {
        process.env.NODE_ENV = "production";
    }

    var stream = browserify(PLUGINS_SRC_FILE, {debug: !gutil.env.prod})
        .transform(reactify)
        .transform(envify)
        .bundle()
        .on("error", gutil.log)
        .pipe(vstream(PLUGINS_FILE_NAME))
        .pipe(buffer());

    if (gutil.env.prod) {
        stream = stream
            .pipe(uglify())
            .on("error", gutil.log);
    }

    return stream
        .pipe(gulp.dest(JS_DIR.replace(SOURCE_DIR, gutil.env.outDir)))
        .pipe(browsersync.reload({stream: true}))

        // NOTE:
        //      adding YAML front matter after doing everything
        //      else so that uglify doesn't screw it up
        .pipe(header(YAML_FRONT_MATTER))

        // WORKAROUND:
        //           minified JS has some things that look like
        //           Liquid tags, so we replace them manually
        .pipe(replace("){{", "){ {"))
        .pipe(gulp.dest(JS_DIR));
});

// convenience tasks
gulp.task("link-bugs", function (done) {
    exec(bin("linkify-bugs.sh"), [path.join(SOURCE_DIR, "_posts")], done);
});

gulp.task("lint", function() {
    return gulp.src(path.join("./", "**", "*.html"))
        .pipe(htmllint());
});

gulp.task("newversion", function(done) {

    copyDocsVersion("dev", NEXT_DOCS_VERSION, function (error) {

        if (error) {
            console.error(error);
            done();
            return;
        }

        // finally update the version file with the new version
        fs.writeFile(VERSION_FILE, NEXT_DOCS_VERSION + "\n", done);
    });
});

gulp.task("snap", function(done) {

    // remove current version first
    LANGUAGES.forEach(function (languageName) {
        var languageLatestDocs = path.join(DOCS_DIR, languageName, LATEST_DOCS_VERSION);
        remove(languageLatestDocs);
    });

    copyDocsVersion("dev", LATEST_DOCS_VERSION, done);
});

gulp.task("checklinks", function(done) {
    crawler
        .crawl("http://localhost:3000/")
        .on("fetch404", function(queueItem, response) {
            gutil.log(
                "Resource not found linked from " +
                queueItem.referrer + " to", queueItem.url
            );
            gutil.log("Status code: " + response.statusCode);
        })
        .on("complete", function(queueItem) {
            done();
        });
});

gulp.task("clean", function () {
    remove(DEV_DIR);
    remove(PROD_DIR);
    remove(FETCH_DIR);
    remove(path.join(DATA_DIR, "toc", "*-generated.yml"));
    remove(CSS_OUT_DIR);
    remove(PLUGINS_FILE);
    remove(DOCS_VERSION_FILE);
    remove(DEFAULTS_CONFIG_FILE);
    remove(VERSION_CONFIG_FILE);
});
