/* eslint-env node */
/* eslint-disable no-sync */
'use strict';

let del = require('del');
let execSync = require('child_process').execSync;
let osenv = require('osenv');
let path = require('path');
var runSequence = require('run-sequence');

let gulp = require('gulp');
let eslint = require('gulp-eslint');
let jsonEditor = require('gulp-json-editor');
let shell = require('gulp-shell');
let symlink = require('gulp-symlink');
let zip = require('gulp-zip');

let metadata = require('./src/metadata.json');

let src = {
  copy: [
    'src/**/*',
    '!src/**/*~',
    '!src/schemas{,/**/*}',
    '!src/metadata.json',
  ],
  lib: [
    'lib/**/*',
  ],
  metadata: [
    'src/metadata.json',
  ],
  schemas: [
    'src/schemas/**/*',
  ],
};

let install = {
  local: path.join(
    osenv.home(),
    '.local/share/gnome-shell/extensions',
    metadata.uuid
  ),
  global: path.join(
    '/usr/share/gnome-shell/extensions',
    metadata.uuid
  ),
};


function getVersion(rawTag) {
  var sha1, tag;
  sha1 = execSync(
    'git rev-parse --short HEAD'
  ).toString().replace(/\n$/, '');

  try {
    tag = execSync(
      'git describe --tags --exact-match ' + sha1 + ' 2>/dev/null'
    ).toString().replace(/\n$/, '');
  } catch (e) {
    return sha1;
  }

  if (rawTag) {
    return tag;
  }

  let v = parseInt(tag.replace(/^v/, ''), 10);
  if (isNaN(v)) {
    throw new Error('Unable to parse version from tag: ' + tag);
  }
  return v;
}


gulp.task('lint', function () {
  return gulp.src([ '**/*.js' ])
    .pipe(eslint())
    .pipe(eslint.format())
    .pipe(eslint.failAfterError());
});

gulp.task('clean', function (cb) {
  return del([
    'build/',
  ], cb);
});

gulp.task('copy', function () {
  return gulp.src(src.copy)
    .pipe(gulp.dest('build'));
});

gulp.task('copy-lib', function () {
  return gulp.src(src.lib)
    .pipe(gulp.dest('build/lib'));
});

gulp.task('copy-license', function () {
  return gulp.src([
    'LICENSE',
  ])
    .pipe(gulp.dest('build'));
});

gulp.task('metadata', function () {
  return gulp.src(src.metadata)
    .pipe(jsonEditor(function (json) {
      json.version = getVersion();
      return json;
    }, {
      end_with_newline: true,
    }))
    .pipe(gulp.dest('build'));
});

gulp.task('schemas', shell.task([
  'mkdir -p build/schemas',
  'glib-compile-schemas --strict --targetdir build/schemas src/schemas/',
]));


gulp.task('build', function (cb) {
  runSequence(
    'clean',
    [
      'metadata',
      'schemas',
      'copy',
      'copy-lib',
      'copy-license',
    ],
    cb
  );
});

gulp.task('watch', [
  'build',
], function () {
  gulp.watch(src.copy, [ 'copy' ]);
  gulp.watch(src.lib, [ 'copy-lib' ]);
  gulp.watch(src.metadata, [ 'metadata' ]);
  gulp.watch(src.schemas, [ 'schemas' ]);
});


gulp.task('reset-prefs', shell.task([
  'dconf reset -f /org/gnome/shell/extensions/gravatar/',
]));

gulp.task('uninstall', function (cb) {
  return del([
    install.local,
    install.global,
  ], {
    force: true,
  }, cb);
});

gulp.task('install-link', [
  'uninstall',
  'build',
], function () {
  return gulp.src([ 'build' ])
    .pipe(symlink(install.local));
});

gulp.task('install', [
  'uninstall',
  'build',
], function () {
  return gulp.src([ 'build/**/*' ])
    .pipe(gulp.dest(install.local));
});


gulp.task('require-clean-wd', function (cb) {
  let changes = execSync(
    'git status --porcelain | wc -l'
  ).toString().replace(/\n$/, '');

  if (parseInt(changes, 10) !== 0) {
    return cb(new Error(
      'There are uncommited changes in the working directory. Aborting.'
    ));
  }
  return cb();
});

gulp.task('bump', function (cb) {
  var v;
  let stream = gulp.src([
    'package.json',
  ])
    .pipe(jsonEditor(function (json) {
      json.version++;
      v = 'v' + json.version;
      return json;
    }, {
      end_with_newline: true,
    }))
    .pipe(gulp.dest('./'));

  stream.on('error', cb);
  stream.on('end', function () {
    execSync('git commit ./package.json -m "Bump version"');
    execSync('git tag ' + v);
    return cb();
  });
});

gulp.task('push', function (cb) {
  execSync('git push origin');
  execSync('git push origin --tags');
  return cb();
});

gulp.task('dist', [
  'lint',
], function (cb) {
  runSequence('build', function () {
    let zipFile = metadata.uuid + '-' + getVersion(true) + '.zip';
    let stream = gulp.src([
      'build/**/*',
    ])
      .pipe(zip(zipFile))
      .pipe(gulp.dest('dist'));

    stream.on('error', cb);
    stream.on('end', cb);
  });
});

gulp.task('release', [
  'lint',
], function (cb) {
  runSequence(
    'require-clean-wd',
    'bump',
    'push',
    'dist',
    cb
  );
});

gulp.task('enable-debug', shell.task([
  'dconf write /org/gnome/shell/extensions/gravatar/debug true',
]));

gulp.task('disable-debug', shell.task([
  'dconf write /org/gnome/shell/extensions/gravatar/debug false',
]));

gulp.task('default', function () {
  /* eslint-disable no-console, max-len */
  console.log(
    '\n' +
    'Usage: gulp [COMMAND]\n' +
    '\n' +
    'Commands\n' +
    '\n' +
    'BUILD\n' +
    '  clean                 Cleans the build/ directory\n' +
    '  build                 Builds the extension\n' +
    '  watch                 Builds and watches the src/ directory for changes\n' +
    '\n' +
    'INSTALL\n' +
    '  install               Installs the extension to\n' +
    '                        ~/.local/share/gnome-shell/extensions/\n' +
    '  install-link          Installs as symlink to build/ directory\n' +
    '  uninstall             Uninstalls the extension\n' +
    '  reset-prefs           Resets extension preferences\n' +
    '\n' +
    'PACKAGE\n' +
    '  lint                  Lint source files\n' +
    '  dist                  Builds and packages the extension\n' +
    '  release               Bumps/tags version and builds package\n' +
    '\n' +
    'DEBUG\n' +
    '  enable-debug          Enables debug mode\n' +
    '  disable-debug         Disables debug mode\n'
  );
  /* eslint-esnable no-console, max-len */
});
