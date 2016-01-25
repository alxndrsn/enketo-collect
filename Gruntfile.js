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
	});

	grunt.registerTask('enketo-sass', ['sass']);
};
