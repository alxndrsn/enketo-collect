.PHONY: default init www www-build www-serve

default: www
	
init:
	npm install -g browserify http-server less

www: www-build www-serve www-clean www-static www-xslt www-enketo-styles www-styles www-js

www-clean:
	rm -rf build/www
	mkdir -p build/www

www-static:
	echo '[www-static] Copying static files...'
	cp -r www/static/* build/www/

www-xslt:
	echo '[www-xslt] Copying XSLTs...'
	mkdir build/www/enketo
	cp -r node_modules/enketo-client-side-transformer/xslt/client-side/*.xsl build/www/enketo

www-enketo-styles:
	echo '[www-enketo-styles] Sassing...'
	grunt enketo-sass
	mkdir -p build/less
	cp build/sass/formhub.css build/less/enketo.less
	echo '[www-enketo-styles] Fixing font paths...'
	sed -i'.bak' 's_/build/fonts/_fonts/_' build/less/enketo.less
	echo '[www-enketo-styles] Copying fonts...'
	mkdir -p build/www/fonts
	cp node_modules/enketo-core/build/fonts/* build/www/fonts/

www-styles: www-enketo-styles
	echo '[www-styles] Compiling stylesheets...'
	lessc www/style/main.less build/www/style.css

www-js:
	echo '[www-js] Concatting JS...'
	browserify www/js/main.js -o build/www/bundle.js

www-build: www-clean www-static www-xslt www-styles www-js

www-serve:
	http-server build/www
