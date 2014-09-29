module.exports = function( grunt ) {
	'use strict';
	
	var banner = [
		'/*!',
		' * <%= pkg.name %>',
		' * <%= pkg.version %>',
		' *',
		' * Copyright(c) <%= grunt.template.today("yyyy") %> <%= pkg.author %>',
		' * <%= pkg.license %>',
		' *',
		' * <%= pkg.homepage %>',
		' */\n'
	].join( "\n" );
	
	
	// Project configuration.
	grunt.initConfig( {
		pkg: grunt.file.readJSON( 'package.json' ),
		
		jshint : {
			files : {
				options : {
					jshintrc : true
				},
				src : [ 'src/**/*.js', 'tests/**/*.js' ]
			}
		},
		
		karma : {
			unit : {
				configFile : 'karma.conf.js',
				singleRun  : true
			}
		},
		
		concat : {
			development : {
				options : {
					banner : banner,
					nonull : true
				},
				src : [ 'src/PromiseCache.js' ],
				dest : 'dist/PromiseCache.js',
			},
		},
		
		uglify : {
			production : {
				options : {
					banner : banner
				},
				src  : [ 'dist/PromiseCache.js' ],
				dest : 'dist/PromiseCache.min.js',
			}
		}
	} );
	

	// Plugins
	grunt.loadNpmTasks( 'grunt-contrib-jshint' );
	grunt.loadNpmTasks( 'grunt-contrib-concat' );
	grunt.loadNpmTasks( 'grunt-contrib-uglify' );
	grunt.loadNpmTasks( 'grunt-karma' );

	// Tasks
	grunt.registerTask( 'default', [ 'lint', 'test', 'build' ] );
	grunt.registerTask( 'lint', [ 'jshint' ] );
	grunt.registerTask( 'test', [ 'karma' ] );
	grunt.registerTask( 'build', [ 'concat:development', 'uglify:production' ] );
	
};
