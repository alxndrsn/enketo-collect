'use strict';

module.exports = function(grunt) {
	// show elapsed time at the end
	require('time-grunt')(grunt);
	// load all grunt tasks
	require('load-grunt-tasks')(grunt);

	// Project configuration.
	grunt.initConfig({
		pkg: grunt.file.readJSON('package.json'),
		sass: {
			compile: {
				cwd: 'node_modules/enketo-core/src/sass',
				dest: 'build/sass/',
				expand: true,
				outputStyle: 'expanded',
				src: '**/*.scss',
				ext: '.css',
				flatten: true,
				extDot: 'last'
			}
		},
		ngtemplates: {
			EnketoCollectApp: {
				cwd: 'www/templates',
				src: '**/*.html',
				dest: 'build/templates.js',
				options: {
					htmlmin: {
						collapseBooleanAttributes: true,
						collapseWhitespace: true,
						removeAttributeQuotes: true,
						removeComments: true,
						removeEmptyAttributes: true,
						removeRedundantAttributes: true,
						removeScriptTypeAttributes: true,
						removeStyleLinkTypeAttributes: true
					},
				},
			},
		},
	});

	grunt.registerTask('compile-templates', ['ngtemplates']);
	grunt.registerTask('enketo-sass', ['sass']);
};
